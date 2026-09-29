import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)

test('conversion entry imports without a DOM in both module systems', async () => {
  assert.equal(typeof globalThis.document, 'undefined')
  const esm = await import('quill-markdown-toolkit/conversion')
  const cjs = require('quill-markdown-toolkit/conversion')
  assert.equal(esm.looksLikeMarkdown('# ESM'), true)
  assert.equal(cjs.looksLikeMarkdown('# CommonJS'), true)
})

test('browser entries handle the Quill peer in ESM, CommonJS and UMD builds', async () => {
  const { JSDOM } = await import('jsdom')
  const dom = new JSDOM('', { runScripts: 'outside-only' })
  const globals = ['window', 'document', 'DOMParser', 'Node', 'NodeFilter', 'Element', 'HTMLElement', 'Text', 'MutationObserver', 'navigator']
  const descriptors = new Map(globals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  try {
    for (const name of globals) {
      Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true })
    }
    const esm = await import('quill-markdown-toolkit')
    const cjs = require('quill-markdown-toolkit')
    const blockquote = await import('quill-format-blockquote')
    for (const entry of [esm, cjs]) {
      assert.equal(typeof entry.default, 'function')
      assert.equal(entry.default, entry.Markdown)
      assert.equal(entry.Blockquote, blockquote.default)
      assert.equal(entry.BlockquoteContainer, blockquote.BlockquoteContainer)
      assert.equal(entry.matchBlockquote, blockquote.matchBlockquote)
      const markdown = entry.htmlToMarkdown(entry.markdownToHtml('# Heading\n\n- [x] done'))
      assert.match(markdown, /- \[x\] done/)
    }
    const umdSource = await readFile(new URL('../dist/index.umd.js', import.meta.url), 'utf8')
    dom.window.Quill = (await import('quill')).default
    dom.window.eval(umdSource)
    const umd = dom.window.QuillMarkdownModule
    assert.equal(typeof umd.Markdown, 'function')
    assert.equal(umd.Markdown, umd.default)
    assert.match(umd.markdownToHtml('# UMD'), /<h1>UMD<\/h1>/)

    const commonjs = { exports: {} }
    dom.window.module = commonjs
    dom.window.require = (name) => {
      assert.equal(name, 'quill')
      return dom.window.Quill
    }
    dom.window.eval(umdSource)
    assert.equal(typeof commonjs.exports.Markdown, 'function')
    delete dom.window.module
    delete dom.window.require

    let amd
    dom.window.define = (_dependencies, factory) => { amd = factory(dom.window.Quill) }
    dom.window.define.amd = true
    dom.window.eval(umdSource)
    assert.equal(typeof amd.Markdown, 'function')
  } finally {
    dom.window.close()
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else delete globalThis[name]
    }
  }
})
