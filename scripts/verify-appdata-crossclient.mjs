#!/usr/bin/env node
/**
 * Wave 0: Cross-client appDataFolder visibility verification.
 *
 * Tests that a file written to Drive appDataFolder by a WEB OAuth client
 * is visible when listed by the DESKTOP OAuth client — within the SAME
 * GCP project. This is the load-bearing assumption for Phase 12 (MOB-TRANS-01).
 *
 * Usage: node scripts/verify-appdata-crossclient.mjs
 *
 * No npm dependencies — uses only Node.js built-in fetch (Node 18+).
 */

import readline from 'readline'

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

function ask(prompt) {
  return new Promise(resolve => rl.question(prompt, answer => resolve(answer.trim())))
}

function printDivider() {
  console.log('\n' + '─'.repeat(72) + '\n')
}

async function uploadTestFile(accessToken, timestamp) {
  const filename = `verify-${timestamp}.json`
  const content = JSON.stringify({ test: true, timestamp, source: 'web-client' })

  const boundary = '-------314159265358979323846'
  const delimiter = `\r\n--${boundary}\r\n`
  const closeDelimiter = `\r\n--${boundary}--`

  const metadata = JSON.stringify({
    name: filename,
    parents: ['appDataFolder'],
  })

  const body =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    metadata +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    content +
    closeDelimiter

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary="${boundary}"`,
      },
      body,
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Upload failed (${response.status}): ${text}`)
  }

  const data = await response.json()
  return { fileId: data.id, filename }
}

async function listAppDataFiles(accessToken) {
  const response = await fetch(
    'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name)&pageSize=100',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`List failed (${response.status}): ${text}`)
  }

  const data = await response.json()
  return data.files || []
}

async function deleteFile(accessToken, fileId) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  // 204 = success, 404/410 = already gone — both are fine
  if (!response.ok && response.status !== 404 && response.status !== 410) {
    console.warn(`  Warning: cleanup delete returned ${response.status} — manual cleanup may be needed`)
  }
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════╗')
  console.log('║  Wave 0: Cross-client appDataFolder Verification (Phase 12, MOB-TRANS-01)  ║')
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n')

  console.log('This script verifies that a file written to Drive appDataFolder by the WEB')
  console.log('OAuth client is visible when listed by the DESKTOP OAuth client — within the')
  console.log('SAME GCP project. This is the architectural foundation of Phase 12.\n')

  console.log('You will need to get two access tokens from Google OAuth Playground.')
  console.log('URL: https://developers.google.com/oauthplayground\n')

  printDivider()

  console.log('STEP 1: Get a WEB client access token\n')
  console.log('  (a) Open https://developers.google.com/oauthplayground in your browser.')
  console.log('  (b) Click the gear icon (top right) → check "Use your own OAuth credentials"')
  console.log('      → paste your WEB client\'s Client ID and Client Secret from GCP.')
  console.log('      (GCP Console → APIs & Services → Credentials → your Web application client)')
  console.log('      Close the gear.')
  console.log('  (c) In the left panel, paste this scope into the input box:')
  console.log('        https://www.googleapis.com/auth/drive.appdata')
  console.log('      Click "Authorize APIs" → consent as yourself.')
  console.log('  (d) Click "Exchange authorization code for tokens".')
  console.log('      Copy the access_token shown in the response.\n')

  const webToken = await ask('Paste WEB client access_token here: ')
  if (!webToken) {
    console.error('No token provided. Exiting.')
    rl.close()
    process.exit(1)
  }

  console.log('\n  Uploading test file using WEB client token...')
  const timestamp = Date.now()
  let fileId, filename

  try {
    ;({ fileId, filename } = await uploadTestFile(webToken, timestamp))
    console.log(`  ✓ Uploaded: ${filename}`)
    console.log(`  ✓ File ID:  ${fileId}`)
  } catch (err) {
    console.error(`\n  ✗ Upload failed: ${err.message}`)
    console.error('  Check that your WEB client token has the drive.appdata scope.')
    rl.close()
    process.exit(1)
  }

  printDivider()

  console.log('STEP 2: Get a DESKTOP client access token\n')
  console.log('  (a) In OAuth Playground, reopen the gear icon.')
  console.log('      Replace the Client ID/Secret with your DESKTOP client\'s credentials.')
  console.log('      (GCP Console → APIs & Services → Credentials → your Desktop app client)')
  console.log('  (b) Same scope: https://www.googleapis.com/auth/drive.appdata')
  console.log('  (c) Click "Authorize APIs" → consent → "Exchange authorization code for tokens".')
  console.log('  (d) Copy the new access_token.\n')
  console.log('  IMPORTANT: Both clients must be in the SAME GCP project for this to work.\n')

  const desktopToken = await ask('Paste DESKTOP client access_token here: ')
  if (!desktopToken) {
    console.error('No token provided. Exiting.')
    rl.close()
    process.exit(1)
  }

  console.log('\n  Listing appDataFolder files using DESKTOP client token...')
  let files

  try {
    files = await listAppDataFiles(desktopToken)
    console.log(`  Found ${files.length} file(s) in appDataFolder:`)
    for (const f of files) {
      console.log(`    - ${f.name} (${f.id})`)
    }
  } catch (err) {
    console.error(`\n  ✗ List failed: ${err.message}`)
    rl.close()
    process.exit(1)
  }

  printDivider()

  const found = files.some(f => f.id === fileId)

  if (found) {
    console.log('╔══════════════════════════════════════════════════════════════════════╗')
    console.log('║  ✓ PASS — appDataFolder IS shared across clients in the same project  ║')
    console.log('╚══════════════════════════════════════════════════════════════════════╝\n')
    console.log(`  The test file (${filename}) written by the WEB client`)
    console.log('  IS visible when listed by the DESKTOP client.\n')
    console.log('  Phase 12 appDataFolder transport assumption: CONFIRMED.')
    console.log('  You may proceed with Phase 12 Plans 12-02 and 12-03.\n')

    console.log('  Cleaning up test file...')
    try {
      await deleteFile(desktopToken, fileId)
      console.log('  ✓ Test file deleted.\n')
    } catch (err) {
      console.warn(`  Warning: cleanup failed: ${err.message}`)
      console.warn(`  Please manually delete file ID ${fileId} from appDataFolder.\n`)
    }
  } else {
    console.log('╔══════════════════════════════════════════════════════════════════════╗')
    console.log('║  ✗ FAIL — appDataFolder is NOT shared across these two clients        ║')
    console.log('╚══════════════════════════════════════════════════════════════════════╝\n')
    console.log(`  The test file (${filename}) written by the WEB client`)
    console.log('  is NOT visible when listed by the DESKTOP client.\n')
    console.log('  Possible causes:')
    console.log('  1. The two clients are in DIFFERENT GCP projects.')
    console.log('     → Check GCP Console project selector. Both clients must be in the same project.')
    console.log('  2. The scope used was wrong (must be drive.appdata, not drive or drive.file).')
    console.log('  3. The access token expired — try again with a fresh token.\n')
    console.log('  DO NOT proceed with Phase 12. Report this failure — the architecture')
    console.log('  must be redesigned (appDataFolder transport assumption is broken).\n')
    console.log(`  Note: test file ID ${fileId} may still exist in the WEB client's appDataFolder.`)
    console.log('  Clean up with the WEB client token if desired.\n')
  }

  rl.close()
  process.exit(found ? 0 : 1)
}

main().catch(err => {
  console.error('Unexpected error:', err)
  rl.close()
  process.exit(1)
})
