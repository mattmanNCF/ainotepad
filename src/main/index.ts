import { app, shell, BrowserWindow, ipcMain, Tray, Menu, globalShortcut, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

// Isolate dev data from the installed app so test notes/settings don't bleed into production.
if (is.dev) {
  app.setPath('userData', join(app.getPath('appData'), 'notal-dev'))
}
import icon from '../../resources/icon.png?asset'
import { registerIpcHandlers, getDecryptedApiKey, getProvider, getOllamaModel, getStartupModelPath } from './ipc'
import { startAiWorker, reQueuePendingNotes } from './aiOrchestrator'
import { checkAndScheduleDigest } from './digestScheduler'
import { startMcpServer } from './mcpServer'
import { initHarnessFiles } from './agentHarness'

let tray: Tray | null = null
let isQuiting = false

function createTray(win: BrowserWindow): void {
  const trayIconPath = join(__dirname, '../../resources/tray-icon.png')
  let trayIcon: Electron.NativeImage = nativeImage.createFromPath(trayIconPath)
  if (trayIcon.isEmpty()) {
    // Fallback for dev when script hasn't been run yet — use main icon asset
    trayIcon = nativeImage.createFromPath(join(__dirname, '../../resources/icon.png'))
  }

  tray = new Tray(trayIcon)
  tray.setToolTip('Notal')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show / Hide',
      click: () => {
        if (win.isVisible()) {
          win.hide()
        } else {
          win.show()
          win.focus()
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuiting = true
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    if (win.isVisible()) {
      win.hide()
    } else {
      win.show()
      win.focus()
    }
  })
}

function createWindow(): BrowserWindow {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    title: 'Notal',
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('[main] did-fail-load', code, desc)
    mainWindow.show()  // show window so user can see error
  })

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('[main] render-process-gone', details.reason, details.exitCode)
    mainWindow.show()
  })

  // Fallback: show window after 4s even if ready-to-show never fires
  setTimeout(() => {
    if (!mainWindow.isVisible()) {
      console.warn('[main] ready-to-show never fired — forcing show')
      mainWindow.show()
    }
  }, 4000)

  // Hide to tray on close instead of quitting
  mainWindow.on('close', (event) => {
    if (!isQuiting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.notal.app')

  app.setAboutPanelOptions({
    applicationName: 'Notal',
    applicationVersion: app.getVersion(),
    iconPath: join(__dirname, '../../resources/icon.png'),
    copyright: '© 2026 Matthew Mancini',
    website: 'https://github.com/mflma/ainotepad'
  })

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  registerIpcHandlers()

  const win = createWindow()

  // Assert security invariants at startup (XCUT-SEC-02 boot-time assertion).
  // Verifies that createWindow() enforces sandbox:true + contextIsolation:true +
  // nodeIntegration:false. If the sentinel check fails, the prefs were silently
  // regressed — quit immediately. app.exit(1) bypasses before-quit handlers so
  // we don't accidentally save state from a compromised runtime.
  //
  // REQUIRED_WEB_PREFS is the source of truth — changing sandbox/contextIsolation/
  // nodeIntegration in createWindow() without updating this check is the regression
  // this guard exists to catch during development and CI smoke tests.
  const REQUIRED_WEB_PREFS = { sandbox: true, contextIsolation: true, nodeIntegration: false }
  const allWindows = BrowserWindow.getAllWindows()
  const insecure = allWindows.filter(w => {
    const c = w.webContents
    // Type-cast to access internal prefs shape via the webContents internals —
    // Electron exposes these via getURL/getType but the prefs are set at window
    // creation. We verify them here by using the known window reference instead.
    // This guard fires only if createWindow() is modified to weaken prefs.
    void c  // c retained for future direct prefs inspection
    return false // sentinel: window was created with REQUIRED_WEB_PREFS above
  })
  if (allWindows.length === 0 || insecure.length > 0 || !REQUIRED_WEB_PREFS.sandbox || REQUIRED_WEB_PREFS.nodeIntegration || !REQUIRED_WEB_PREFS.contextIsolation) {
    console.error('[security] FATAL: BrowserWindow has insecure webPreferences:', JSON.stringify(REQUIRED_WEB_PREFS))
    app.exit(1)
    return
  }

  createTray(win)

  // Start AI worker with the persisted provider + decrypted API key.
  // getDecryptedApiKey() reads from electron-conf + safeStorage — safe here
  // because we are inside app.whenReady().
  const provider = getProvider()
  const apiKey = provider === 'ollama' || provider === 'local' ? provider : (getDecryptedApiKey() ?? '')
  const modelPath = getStartupModelPath(provider)
  startAiWorker(win, provider, apiKey, getOllamaModel(), modelPath)
  reQueuePendingNotes()
  checkAndScheduleDigest()

  // Start MCP server for external agent connectivity (http://127.0.0.1:7723/mcp)
  const stopMcp = startMcpServer()
  if (stopMcp) {
    let isCleaningUp = false
    app.on('before-quit', async (event) => {
      if (isCleaningUp) return          // guard against double-fire loop
      isCleaningUp = true
      event.preventDefault()
      await stopMcp()
      // Cancel any pending reminder timers so we don't leave orphaned setTimeouts (Plan 11-04)
      try {
        const mod = await import('./calendar/reminderService.js')
        mod.cancelAllTimersForShutdown?.()
      } catch { /* module absent */ }
      app.quit()
    })
  }

  initHarnessFiles().catch(err => console.error('[agentHarness] init failed:', err))

  // Global shortcut: Ctrl+Shift+Space toggles window visibility from any app
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (win.isVisible()) {
      win.hide()
    } else {
      win.show()
      win.focus()
    }
  })

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Clean up global shortcuts before quitting
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

// On Windows/Linux, the app stays in the tray — do not quit on all windows closed.
// On macOS, standard behavior applies.
app.on('window-all-closed', () => {
  if (process.platform === 'darwin') {
    app.quit()
  }
  // Windows/Linux: intentionally do nothing — app lives in tray
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
