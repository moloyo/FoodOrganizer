import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = dirname(fileURLToPath(import.meta.url))
const outputDir = join(root, '..', 'public', 'icons')

function svg({ rounded, padding }) {
  const bg = rounded
    ? '<rect width="512" height="512" rx="112" fill="#2F6A4F"/>'
    : '<rect width="512" height="512" fill="#2F6A4F"/>'
  const scale = padding ? 0.76 : 1
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    ${bg}
    <circle cx="256" cy="205" r="104" fill="#E3EFE6" opacity="0.16"/>
    <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
      <path d="M120 244a136 136 0 0 0 272 0Z" fill="#FAF6EF"/>
      <path d="M120 244h272" stroke="#23503C" stroke-width="14" stroke-linecap="round"/>
      <path d="M214 178c0-30 18-44 30-70M278 178c0-26 16-38 26-62" stroke="#FAF6EF" stroke-width="20" stroke-linecap="round" fill="none"/>
      <path d="M196 300c14 18 34 28 60 28s46-10 60-28" stroke="#2F6A4F" stroke-width="12" stroke-linecap="round" fill="none" opacity="0.22"/>
    </g>
  </svg>`)
}

const targets = [
  { name: 'icon-512.png', size: 512, rounded: true, padding: false },
  { name: 'icon-192.png', size: 192, rounded: true, padding: false },
  { name: 'maskable-512.png', size: 512, rounded: false, padding: true },
  { name: 'apple-touch-icon.png', size: 180, rounded: false, padding: true },
]

await mkdir(outputDir, { recursive: true })

for (const target of targets) {
  const input = svg({ rounded: target.rounded, padding: target.padding })
  await sharp(input).resize(target.size, target.size).png().toFile(join(outputDir, target.name))
  console.log(`✓ public/icons/${target.name}`)
}
