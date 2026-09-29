import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const output = new URL('../dist/', import.meta.url)
await mkdir(output, { recursive: true })

await build({
  entryPoints: [fileURLToPath(new URL('../src/index.ts', import.meta.url))],
  outfile: fileURLToPath(new URL('index.umd.js', output)),
  bundle: true,
  format: 'iife',
  globalName: '__quillMarkdownExports',
  target: 'es2022',
  minify: true,
  plugins: [{
    name: 'quill-global',
    setup(build) {
      // Share the host Quill instance so formats register on the same registry.
      build.onResolve({ filter: /^quill$/ }, () => ({ path: 'quill', namespace: 'quill-global' }))
      build.onLoad({ filter: /.*/, namespace: 'quill-global' }, () => ({ contents: 'export default Quill' }))
    },
  }],
  banner: {
    js: `(function (root, factory) {
  if (typeof define === 'function' && define.amd) define(['quill'], factory)
  else if (typeof module === 'object' && module.exports) module.exports = factory(require('quill'))
  else root.QuillMarkdownModule = factory(root.Quill)
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Quill) {
  Quill = Quill && Quill.default || Quill
  if (!Quill) throw new Error('Quill must be loaded before QuillMarkdownModule')`,
  },
  footer: { js: 'return __quillMarkdownExports\n})' },
})
