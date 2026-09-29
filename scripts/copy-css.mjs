import { readFile, writeFile } from 'node:fs/promises'

// Keep the existing stylesheet entry complete for Markdown consumers.
const [markdown, blockquote] = await Promise.all([
  readFile(new URL('../src/style.css', import.meta.url), 'utf8'),
  readFile(new URL(import.meta.resolve('quill-format-blockquote/style.css')), 'utf8'),
])
await writeFile(new URL('../dist/style.css', import.meta.url), `${markdown.trimEnd()}\n${blockquote}`)
