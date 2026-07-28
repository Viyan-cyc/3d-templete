/**
 * ts-to-js.mjs — 将 src/ 下所有 .ts/.vue 文件转为 JS
 *
 * 用法：node scripts/ts-to-js.mjs
 *
 * .ts → .js（esbuild transpile）
 * .vue 中 <script setup lang="ts"> → <script setup>
 */
import { build } from 'esbuild'
import { readdir, rm, readFile, writeFile } from 'node:fs/promises'
import { join, dirname, basename, extname } from 'node:path'

const SRC = 'src'

async function collectFiles(dir, ext) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      files.push(...await collectFiles(full, ext))
    } else if (entry.isFile() && entry.name.endsWith(ext) && !entry.name.endsWith('.d.ts')) {
      files.push(full)
    }
  }
  return files
}

// .ts → .js
const tsFiles = await collectFiles(SRC, '.ts')
console.log(`📦 找到 ${tsFiles.length} 个 .ts 文件`)

for (const f of tsFiles) {
  const dir = dirname(f)
  const base = basename(f, extname(f))
  const tmpOut = join(dir, base + '.tmp.js')
  const outFile = join(dir, base + '.js')

  await build({
    entryPoints: [f],
    outfile: tmpOut,
    allowOverwrite: true,
    format: 'esm',
    target: 'esnext',
    bundle: false,
  })

  await rm(f)
  const { rename } = await import('node:fs/promises')
  await rename(tmpOut, outFile)
}

// .vue 中去掉 lang="ts"
const vueFiles = await collectFiles(SRC, '.vue')
console.log(`📦 找到 ${vueFiles.length} 个 .vue 文件`)

for (const f of vueFiles) {
  const content = await readFile(f, 'utf-8')
  if (content.includes('lang="ts"') || content.includes("lang='ts'")) {
    const stripped = content
      .replace(/<script\s+setup\s+lang=["']ts["']\s*>/g, '<script setup>')
      .replace(/<script\s+lang=["']ts["']\s*>/g, '<script>')
    await writeFile(f, stripped)
  }
}

console.log('✅ TS→JS 转换完成！')
