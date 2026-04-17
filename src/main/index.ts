import { app, shell, BrowserWindow, ipcMain, Tray, Menu, globalShortcut, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerIpcHandlers, getDecryptedApiKey, getProvider, getOllamaModel, getStartupModelPath } from './ipc'
import { startAiWorker, reQueuePendingNotes } from './aiOrchestrator'
import { checkAndScheduleDigest } from './digestScheduler'
import { startMcpServer } from './mcpServer'

let tray: Tray | null = null
let isQuiting = false

function createTray(win: BrowserWindow): void {
  // Use a simple generated icon for development; production will use the bundled icon
  let trayIcon: Electron.NativeImage
  try {
    trayIcon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAABGSURBVDiNY2CgFPwnoP6PgYGB4T8ZmCFAgUEDGBhJtYCBgYGBgYqWkwUGDWBgJNUCBgYGBgYqWk4WGDSAgZFUCxgYyLcAAHOoBArpAAAAAElFTkSuQmCC'
    )
  } catch {
    trayIcon = nativeImage.createEmpty()
  }

  tray = new Tray(trayIcon)
  tray.setToolTip('AInotepad')

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
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

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
  electronApp.setAppUserModelId('com.electron')

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
      app.quit()
    })
  }

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
