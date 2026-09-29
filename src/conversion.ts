import MarkdownIt from 'markdown-it'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import type { ClipboardContent, ConversionOptions } from './types'

export type { ClipboardContent, ConversionOptions, PasteHandler, PasteOptions } from './types'

const languageAliases: Record<string, string> = {
  text: 'plain', txt: 'plain', plaintext: 'plain',
  js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  sh: 'bash', shell: 'bash', shellscript: 'bash', py: 'python',
  html: 'xml', yml: 'yaml', cs: 'csharp', 'c#': 'csharp', 'c++': 'cpp',
}

export function normalizeLanguage(language: string): string {
  const value = language.trim().toLowerCase()
  return languageAliases[value] || value || 'plain'
}

const markdownParser = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  typographer: false
})

const blockTokenTypes = new Set([
  'heading_open', 'blockquote_open', 'bullet_list_open',
  'ordered_list_open', 'fence', 'hr', 'table_open',
])
const inlineMarkdownTokenTypes = new Set([
  'code_inline',
  'em_open',
  'image',
  's_open',
  'strong_open'
])
const supportingBlockTokenTypes = new Set([
  'blockquote_open',
  'bullet_list_open',
  'hr',
  'ordered_list_open',
  'table_open'
])
// Quill 1 and 2 already handle `-`, `*`, and `1.` list shortcuts.
const shortcutPattern = /^(?:#{1,6}\s|>+\s|[-*]\s+\[[ xX]\]\s*|\+\s+(?:\[[ xX]\]\s*)?|\d+\)\s+|`{3}[\w-]*|~{3}[\w-]*|(?:[-*_]\s*){3,})/
const semanticHtmlSelector = [
  'a',
  'b',
  'blockquote',
  'code',
  'del',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'iframe',
  'i',
  'img',
  'ol',
  'picture',
  'pre',
  'strong',
  's',
  'u',
  'table',
  'ul',
  'video'
].join(',')

function hasInlineMarkdown(text: string): boolean {
  return markdownParser.parseInline(text, {}).some((token) => token.children?.some((child) => (
    inlineMarkdownTokenTypes.has(child.type) || (child.type === 'link_open' && child.markup !== 'linkify')
  )))
}

function looksLikeMarkdown(text: string, allowShortcut = false): boolean {
  const value = text.trimEnd()
  if (!value && !text.trim()) return false
  return markdownParser.parse(value, {}).some((token) => blockTokenTypes.has(token.type))
    || hasInlineMarkdown(value)
    || (allowShortcut && shortcutPattern.test(text))
}

export function shouldConvertMarkdown({ text = '', html = '' }: ClipboardContent): boolean {
  return looksLikeMarkdown(text) && !hasSemanticHtml(html)
}

function hasMarkdownDocumentStructure(text: string): boolean {
  const tokens = markdownParser.parse(text, {})
  const headingCount = tokens.filter((token) => token.type === 'heading_open').length
  if (headingCount >= 2) return true

  const hasSupportingBlock = tokens.some((token) => supportingBlockTokenTypes.has(token.type))
  const hasImage = tokens.some((token) => token.children?.some((child) => child.type === 'image'))
  return headingCount === 1 && (hasSupportingBlock || hasImage)
}

function hasSemanticHtml(html: string): boolean {
  if (!html) return false
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return Boolean(doc.body.querySelector(semanticHtmlSelector))
}

function getTaskMarkerTextNode(item: HTMLElement): Text | null {
  const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT)
  let node: Text | null
  while ((node = walker.nextNode() as Text | null)) {
    // Loose lists start with whitespace; nested items cannot mark their parent as a task.
    if (node.data.trim() && node.parentElement?.closest('li') === item) return node
  }
  return null
}

function convertTaskLists(html: string): string {
  if (html.indexOf('[ ]') === -1 && !/\[[xX]\]/.test(html)) return html

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const lists = Array.from(doc.body.querySelectorAll('ul')).reverse()

  lists.forEach((list) => {
    const items = Array.from(list.children).filter((child) => child.tagName === 'LI') as HTMLElement[]
    const groups: Array<{ checked?: boolean; items: HTMLElement[] }> = []

    items.forEach((item) => {
      const firstText = getTaskMarkerTextNode(item)
      const taskMatch = firstText?.data.match(/^\s*\[([ xX])\](?:\s+|$)/)
      const checked = taskMatch ? taskMatch[1].toLowerCase() === 'x' : undefined

      if (taskMatch && firstText) {
        firstText.data = firstText.data.slice(taskMatch[0].length)
      }

      const lastGroup = groups.at(-1)
      if (!lastGroup || lastGroup.checked !== checked) {
        groups.push({ checked, items: [item] })
      } else {
        lastGroup.items.push(item)
      }
    })

    if (!groups.some((group) => group.checked !== undefined)) return

    groups.forEach((group) => {
      const groupList = list.cloneNode(false) as HTMLElement
      groupList.removeAttribute('class')
      if (group.checked !== undefined) {
        groupList.setAttribute('data-checked', String(group.checked))
      }
      group.items.forEach((item) => groupList.appendChild(item))
      list.before(groupList)
    })
    list.remove()
  })

  return doc.body.innerHTML
}

function convertCodeLanguages(html: string, normalize: (language: string) => string): string {
  if (html.indexOf('language-') === -1) return html

  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.body.querySelectorAll('pre > code[class]').forEach((code) => {
    const languageClass = Array.from(code.classList).find((className) => className.startsWith('language-'))
    const language = normalize(languageClass?.slice('language-'.length) || '')
    if (language) code.parentElement?.setAttribute('data-language', language)
  })
  return doc.body.innerHTML
}

function markdownToHtml(markdown: string, options: ConversionOptions = {}): string {
  return convertTaskLists(convertCodeLanguages(markdownParser.render(markdown), options.normalizeLanguage || normalizeLanguage))
}

function normalizeTableCellContent(content: string): string {
  return content
    .trim()
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\\?\|/g, (value) => value === '\\|' ? value : '\\|')
}

function getCodeFence(code: string): string {
  const longestFence = Math.max(0, ...Array.from(code.matchAll(/^ {0,3}(`+)/gm), (match) => match[1].length))
  return '`'.repeat(Math.max(3, longestFence + 1))
}

function createTurndownService(options: ConversionOptions): TurndownService {
  const service = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**'
  })
  service.use(gfm)

  service.addRule('quillCodeBlock', {
    filter: (node) => node.tagName === 'PRE',
    replacement: (_content, node) => {
      const code = (node.textContent || '')
        .replace(/\r\n?/g, '\n')
        .replace(/^\n/, '')
        .replace(/\n$/, '')
      const codeClass = node.querySelector('code')?.className.match(/(?:^|\s)language-([^\s]+)/)?.[1]
      const language = (options.normalizeLanguage || normalizeLanguage)(node.getAttribute('data-language') || codeClass || 'plain')
      const fence = getCodeFence(code)
      return `\n\n${fence}${language}\n${code}\n${fence}\n\n`
    }
  })
  service.addRule('quillTableCell', {
    filter: ['th', 'td'],
    replacement: (content, node) => {
      const prefix = node.parentElement?.firstElementChild === node ? '| ' : ' '
      return `${prefix}${normalizeTableCellContent(content)} |`
    }
  })
  // Quill splits checked and unchecked runs into separate lists; keep their Markdown lines adjacent.
  service.addRule('quillTaskList', {
    filter: (node) => node.tagName === 'UL' && (
      node.hasAttribute('data-checked')
      || Array.from(node.children).some((item) => (
        item.tagName === 'LI' && /^(checked|unchecked)$/.test(item.getAttribute('data-list') || '')
      ))
    ),
    replacement: (content, node) => {
      const parent = node.parentNode
      if (parent?.nodeName === 'LI') {
        return parent.lastElementChild === node ? `\n${content}` : `\n\n${content}\n\n`
      }
      return `\n${content.trimEnd()}\n`
    }
  })
  service.addRule('quillTaskListItem', {
    filter: (node) => node.tagName === 'LI' && (
      /^(checked|unchecked)$/.test(node.getAttribute('data-list') || '')
      || node.parentElement?.hasAttribute('data-checked') === true
    ),
    replacement: (content, node) => {
      const state = node.getAttribute('data-list')
      const checked = (state ? state === 'checked' : node.parentElement?.getAttribute('data-checked') === 'true') ? 'x' : ' '
      const item = content.trim().replace(/\n/g, '\n  ')
      return `- [${checked}] ${item}\n`
    }
  })
  service.addRule('quillMention', {
    filter: (node) => node.classList.contains('mention'),
    replacement: (_content, node) => node.textContent || ''
  })
  service.addRule('quillVideo', {
    filter: ['video', 'iframe'],
    replacement: (content, node) => {
      const src = node.getAttribute('src')
      if (!src) return content
      const label = node.getAttribute('data-name') || node.getAttribute('title') || options.videoLabel || '视频'
      return `\n[${service.escape(label)}](${src.replace(/\(/g, '%28').replace(/\)/g, '%29')})\n`
    }
  })

  return service
}

function htmlToMarkdown(html: string, options: ConversionOptions = {}): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  // Quill tables serialize every cell as TD. GFM needs a header row to retain the table.
  doc.body.querySelectorAll('table').forEach((table) => {
    const row = table.rows[0]
    if (!row || row.querySelector('th')) return
    Array.from(row.cells).forEach((cell) => {
      const header = doc.createElement('th')
      Array.from(cell.attributes).forEach((attribute) => header.setAttribute(attribute.name, attribute.value))
      header.innerHTML = cell.innerHTML
      cell.replaceWith(header)
    })
  })
  return createTurndownService(options).turndown(doc.body).trim()
}

export {
  hasMarkdownDocumentStructure,
  hasSemanticHtml,
  htmlToMarkdown,
  looksLikeMarkdown,
  markdownToHtml
}
