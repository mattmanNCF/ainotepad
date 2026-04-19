// scripts/generate-icons.cjs
// Regenerates all icon derivatives from build/icon-source.png
// Usage: node scripts/generate-icons.cjs
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'build', 'icon-source.png');

async function main() {
  if (!fs.existsSync(SRC)) throw new Error('Missing source: ' + SRC);

  // PNG derivatives
  const pngTargets = [
    { out: path.join(ROOT, 'build', 'icon-1024.png'), size: 1024 },
    { out: path.join(ROOT, 'build', 'icon.png'),      size: 512  },
    { out: path.join(ROOT, 'resources', 'icon.png'),  size: 512  },
    { out: path.join(ROOT, 'resources', 'tray-icon.png'), size: 32 }
  ];
  for (const t of pngTargets) {
    await sharp(SRC)
      .resize(t.size, t.size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toFile(t.out);
    console.log('wrote', path.relative(ROOT, t.out), '(' + t.size + 'x' + t.size + ')');
  }

  // Multi-resolution ICO via electron-icon-builder
  // electron-icon-builder --flatten emits {output}/icons/win/icon.ico with
  // 16/24/32/48/64/128/256 entries which satisfies 16/32/48/256 criterion.
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
  // electron-icon-builder --flatten emits to {output}/icons/icon.ico (not icons/win/)
  const generatedIco = path.join(tmpDir, 'icons', 'icon.ico');
  if (!fs.existsSync(generatedIco)) throw new Error('ICO not produced (exit ' + r.status + '): ' + generatedIco);
  fs.copyFileSync(generatedIco, icoOut);
  console.log('wrote', path.relative(ROOT, icoOut));
  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log('\nAll icon assets regenerated from', path.relative(ROOT, SRC));
}
main().catch((e) => { console.error(e); process.exit(1); });
