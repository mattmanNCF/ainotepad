// scripts/generate-icons.cjs
// Regenerates all icon derivatives from build/icon-source.svg
// Usage: node scripts/generate-icons.cjs
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SVG_SRC = path.join(ROOT, 'build', 'icon-source.svg');
// Intermediate high-res PNG rasterized from SVG (written to build/, not committed as source)
const PNG_BASE = path.join(ROOT, 'build', 'icon-source-rasterized.png');

async function main() {
  if (!fs.existsSync(SVG_SRC)) throw new Error('Missing source: ' + SVG_SRC);

  // Step 1: Rasterize SVG → 1024×1024 PNG as base for all derivatives
  await sharp(Buffer.from(fs.readFileSync(SVG_SRC)))
    .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(PNG_BASE);
  console.log('rasterized SVG →', path.relative(ROOT, PNG_BASE), '(1024x1024)');

  // Step 2: PNG derivatives
  const pngTargets = [
    { out: path.join(ROOT, 'build', 'icon-1024.png'), size: 1024 },
    { out: path.join(ROOT, 'build', 'icon.png'),      size: 512  },
    { out: path.join(ROOT, 'resources', 'icon.png'),  size: 512  },
    { out: path.join(ROOT, 'resources', 'tray-icon.png'), size: 32 }
  ];
  for (const t of pngTargets) {
    await sharp(PNG_BASE)
      .resize(t.size, t.size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(t.out);
    console.log('wrote', path.relative(ROOT, t.out), '(' + t.size + 'x' + t.size + ')');
  }

  // Step 3: Multi-resolution ICO via electron-icon-builder
  const { spawnSync } = require('child_process');
  const icoOut = path.join(ROOT, 'build', 'icon.ico');
  const tmpDir = path.join(ROOT, 'build', '.icon-tmp');
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  const iconBuilderBin = path.join(ROOT, 'node_modules', '.bin', 'electron-icon-builder' + (process.platform === 'win32' ? '.cmd' : ''));

  // On Windows, .cmd scripts require shell:true for spawnSync
  const r = spawnSync(iconBuilderBin, [
    '--input=' + path.join(ROOT, 'build', 'icon-1024.png'),
    '--output=' + tmpDir,
    '--flatten'
  ], { stdio: 'inherit', shell: process.platform === 'win32' });

  // electron-icon-builder exits 2 on success (known quirk) — check artifact not exit code
  const generatedIco = path.join(tmpDir, 'icons', 'icon.ico');
  if (!fs.existsSync(generatedIco)) throw new Error('ICO not produced (exit ' + r.status + '): ' + generatedIco);
  fs.copyFileSync(generatedIco, icoOut);
  console.log('wrote', path.relative(ROOT, icoOut));
  fs.rmSync(tmpDir, { recursive: true, force: true });

  // Step 4: Verify tray icon dimensions
  const trayMeta = await sharp(path.join(ROOT, 'resources', 'tray-icon.png')).metadata();
  if (trayMeta.width !== 32 || trayMeta.height !== 32) {
    throw new Error('tray-icon.png dimensions wrong: ' + trayMeta.width + 'x' + trayMeta.height);
  }
  console.log('verified tray-icon.png 32x32 ✓');

  // Step 5: Pixel palette check — sample center pixel of resources/icon.png
  // SVG background is #1a1a2e (dark navy). Center of 512x512 = pixel (256,256).
  const { data } = await sharp(path.join(ROOT, 'resources', 'icon.png'))
    .extract({ left: 250, top: 250, width: 10, height: 10 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  // Average the sampled region
  let rSum = 0, gSum = 0, bSum = 0, count = 0;
  for (let i = 0; i < data.length; i += 4) {
    rSum += data[i]; gSum += data[i+1]; bSum += data[i+2]; count++;
  }
  const avgR = Math.round(rSum/count), avgG = Math.round(gSum/count), avgB = Math.round(bSum/count);
  console.log('palette check: center pixel avg RGB =', avgR, avgG, avgB, '(expect dark navy ~26,26,46)');
  // Dark navy #1a1a2e = 26,26,46. Accept within 30 of each channel.
  if (Math.abs(avgR - 26) > 40 || Math.abs(avgG - 26) > 40 || Math.abs(avgB - 46) > 40) {
    console.warn('WARNING: center pixel does not match expected dark navy palette. Got:', avgR, avgG, avgB);
  } else {
    console.log('palette check PASSED ✓');
  }

  console.log('\nAll icon assets regenerated from', path.relative(ROOT, SVG_SRC));
}
main().catch((e) => { console.error(e); process.exit(1); });
