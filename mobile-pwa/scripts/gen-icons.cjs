const sharp = require('../../node_modules/sharp')
const path = require('path')
const SRC = path.resolve(__dirname, '../../build/icon.png')
const OUT = path.resolve(__dirname, '../public')
async function main() {
  await sharp(SRC).resize(180, 180).png().toFile(path.join(OUT, 'apple-touch-icon-180x180.png'))
  await sharp(SRC).resize(192, 192).png().toFile(path.join(OUT, 'pwa-192x192.png'))
  await sharp(SRC).resize(512, 512).png().toFile(path.join(OUT, 'pwa-512x512.png'))
  console.log('Icons generated in mobile-pwa/public/')
}
main()
