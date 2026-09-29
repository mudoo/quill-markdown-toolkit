import Quill from 'quill'
import hljs from 'highlight.js'
import QuillTableBetter from 'quill-table-better'
import Markdown, { type MarkdownOptions } from 'quill-markdown-toolkit'
import 'quill/dist/quill.snow.css'
import 'quill-table-better/dist/quill-table-better.css'
import 'quill-markdown-toolkit/style.css'

const params = new URLSearchParams(location.search)
const table = params.has('table')
if (table) Quill.register('modules/table-better', QuillTableBetter, true)
Quill.register('modules/markdown', Markdown, true)

const options: MarkdownOptions = {
  paste: !params.has('no-paste'),
  shortcuts: !params.has('no-shortcuts'),
  onNotice: ({ code }) => { document.querySelector('#status')!.textContent = code },
  pasteHandler: params.has('host-paste')
    ? (content, _range, next) => { next(content.text !== '# literal') }
    : undefined,
  ...(params.has('text-only') ? {
    transformHtml: (html: string) => {
      const doc = new DOMParser().parseFromString(html, 'text/html')
      doc.querySelectorAll('img, video, iframe').forEach((node) => node.remove())
      return doc.body.innerHTML
    },
  } : {}),
}

const quill = new Quill('#editor', {
  theme: 'snow',
  modules: {
    syntax: { hljs },
    toolbar: [['bold', 'italic', 'blockquote', 'code-block'], [{ markdown: [false, 'import', 'export', 'copy'] }]],
    ...(table ? { table: false, 'table-better': { language: 'en_US' } } : {}),
    markdown: options,
  },
})
const markdown = quill.getModule('markdown') as Markdown
const source = document.querySelector<HTMLTextAreaElement>('#source')!
const output = document.querySelector<HTMLTextAreaElement>('#output')!
document.querySelector('#insert')!.addEventListener('click', () => markdown.insertMarkdown(source.value))
document.querySelector('#read')!.addEventListener('click', () => { output.value = markdown.getMarkdown() })
document.querySelector('#clear')!.addEventListener('click', () => quill.setText(''))

declare global {
  interface Window { quill: Quill; markdown: Markdown }
}
window.quill = quill
window.markdown = markdown
