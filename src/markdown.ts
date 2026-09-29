import Quill from 'quill'
import Blockquote, { addBlockquoteMatcher } from 'quill-format-blockquote'
import type Toolbar from 'quill/modules/toolbar.js'
import { copyText, downloadFile } from './browser-actions'
import { htmlToMarkdown, markdownToHtml, shouldConvertMarkdown } from './conversion'
import { Horizontal } from './formats/horizontal'
import { MarkdownShortcuts } from './shortcuts'
import type { MarkdownAction, MarkdownContext, MarkdownNoticeCode, MarkdownOptions, MarkdownRange } from './types'

const actions: MarkdownAction[] = ['import', 'export', 'copy']
const defaultLabels: Record<MarkdownAction, string> = {
  import: '导入 md 文件', export: '导出 md 文件', copy: '复制 Markdown 格式',
}

interface MarkdownPicker {
  select: HTMLSelectElement
  update: () => void
}

export function markdownHandler(this: { quill: Quill }, value: MarkdownAction | false): void {
  if (value && actions.includes(value)) {
    const module = this.quill.getModule('markdown') as Markdown | undefined
    module?.handleToolbarAction(value)
  }
}

export class Markdown {
  static register(): void {
    Quill.register({
      'formats/blockquote': Blockquote,
      'formats/horizontal': Horizontal,
    }, true)
    const ToolbarClass = Quill.import('modules/toolbar') as typeof Toolbar
    ToolbarClass.DEFAULTS.handlers = { ...ToolbarClass.DEFAULTS.handlers, markdown: markdownHandler }
  }

  private readonly options: MarkdownOptions
  private readonly removeMatcher: () => void
  private restorePaste?: () => void
  private shortcuts?: MarkdownShortcuts
  private toolbar?: Toolbar
  private previousToolbarHandler?: Toolbar['handlers'][string]
  private toolbarSelect?: HTMLSelectElement
  private toolbarPicker?: MarkdownPicker
  private fileInput?: HTMLInputElement
  private importRange?: MarkdownRange
  private destroyed = false

  constructor(private quill: Quill, options: MarkdownOptions = {}) {
    this.options = { ...options, labels: { ...defaultLabels, ...options.labels } }
    this.removeMatcher = addBlockquoteMatcher(quill.clipboard)
    if (options.paste !== false) this.installPaste()
    if (options.shortcuts !== false) {
      this.shortcuts = new MarkdownShortcuts(quill, (text) => this.toHtml(text, 'shortcut'))
    }
    // Snow builds its pickers after constructing modules; custom themes may replace Toolbar.
    queueMicrotask(() => { if (!this.destroyed) this.initToolbar() })
  }

  private toHtml(markdown: string, context: MarkdownContext): string {
    const html = markdownToHtml(markdown, this.options)
    return this.options.transformHtml?.(html, context) ?? html
  }

  private installPaste(): void {
    const clipboard = this.quill.clipboard
    const original = clipboard.onPaste
    const wrapped: typeof original = (range, content) => {
      let continued = false
      const next = (convertMarkdown = true) => {
        if (continued) return
        continued = true
        const pasteContent = !this.destroyed && convertMarkdown && shouldConvertMarkdown(content)
          ? { ...content, html: this.toHtml(content.text!, 'paste') }
          : content
        original.call(clipboard, range, pasteContent)
      }
      if (!this.destroyed && this.options.pasteHandler) {
        this.options.pasteHandler(content, range, next)
      } else {
        next()
      }
    }
    clipboard.onPaste = wrapped
    this.restorePaste = () => {
      if (clipboard.onPaste === wrapped) clipboard.onPaste = original
    }
  }

  private initToolbar(): void {
    const toolbar = this.quill.getModule('toolbar') as Toolbar | undefined
    if (!toolbar?.container) return
    this.toolbar = toolbar
    this.previousToolbarHandler = toolbar.handlers.markdown
    toolbar.addHandler('markdown', markdownHandler)
    const select = toolbar.container.querySelector<HTMLSelectElement>('select.ql-markdown')
    if (!select) return
    this.toolbarSelect = select
    const theme = this.quill.theme as unknown as { pickers?: MarkdownPicker[] }
    this.toolbarPicker = theme.pickers?.find((picker) => picker.select === select)
    const picker = toolbar.container.querySelector('.ql-picker.ql-markdown')
    select.setAttribute('aria-label', 'Markdown')
    picker?.setAttribute('aria-label', 'Markdown')
    picker?.querySelector('.ql-picker-label')?.setAttribute('aria-label', 'Markdown')
    actions.forEach((action) => {
      const label = this.options.labels![action]!
      const option = select.querySelector(`option[value="${action}"]`)
      if (option) option.textContent = label
      picker?.querySelector(`.ql-picker-item[data-value="${action}"]`)?.setAttribute('aria-label', label)
    })
  }

  handleToolbarAction(action: MarkdownAction): void {
    if (this.destroyed) return
    try {
      if (action === 'import') this.selectMarkdownFile()
      if (action === 'copy') void this.copyMarkdown()
      if (action === 'export') void this.exportMarkdown()
    } finally {
      if (this.toolbarSelect) {
        this.toolbarSelect.value = ''
        this.toolbarPicker?.update()
      }
    }
  }

  private notify(code: MarkdownNoticeCode, error?: unknown): void {
    if (this.destroyed) return
    const level = code.endsWith('failed') ? 'error' : code === 'copy-success' ? 'success' : 'warning'
    this.options.onNotice?.({ code, level, ...(error === undefined ? {} : { error }) })
  }

  private getRange(range?: MarkdownRange): MarkdownRange {
    const current = range || this.quill.getSelection() || { index: this.quill.getLength() - 1, length: 0 }
    const index = Math.max(0, Math.min(current.index, this.quill.getLength() - 1))
    return { index, length: Math.max(0, Math.min(current.length, this.quill.getLength() - index)) }
  }

  private insert(markdown: string, range: MarkdownRange | undefined, context: MarkdownContext): void {
    if (this.destroyed || !this.quill.isEnabled()) return
    const { index, length } = this.getRange(range)
    const converted = this.quill.clipboard.convert({ html: this.toHtml(markdown, context), text: markdown })
    const Delta = Quill.import('delta')
    // Import is one undoable operation, isolated from typing before and after it.
    this.quill.history.cutoff()
    this.quill.updateContents(new Delta().retain(index).delete(length).concat(converted), Quill.sources.USER)
    this.quill.history.cutoff()
    this.quill.setSelection(Math.min(index + converted.length(), this.quill.getLength() - 1), 0, Quill.sources.SILENT)
    this.quill.focus()
  }

  insertMarkdown(markdown: string, range?: MarkdownRange): void {
    this.insert(markdown, range, 'insert')
  }

  getMarkdown(): string {
    return htmlToMarkdown(this.quill.getSemanticHTML(), this.options)
  }

  async importFile(file: File, range?: MarkdownRange): Promise<boolean> {
    if (this.destroyed || !this.quill.isEnabled()) return false
    if (!/\.(?:md|markdown)$/i.test(file.name)) {
      this.notify('file-invalid')
      return false
    }
    const selectedRange = this.getRange(range)
    try {
      const markdown = await file.text()
      if (this.destroyed || !this.quill.isEnabled()) return false
      if (!markdown.trim()) {
        this.notify('file-empty')
        return false
      }
      this.insert(markdown, selectedRange, 'import')
      return true
    } catch (error) {
      this.notify('file-read-failed', error)
      return false
    }
  }

  selectMarkdownFile(): void {
    if (this.destroyed || !this.quill.isEnabled()) return
    this.importRange = this.getRange()
    if (!this.fileInput) {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.md,.markdown,text/markdown'
      input.hidden = true
      input.className = 'ql-markdown-file'
      input.addEventListener('change', async () => {
        const file = input.files?.[0]
        if (file) await this.importFile(file, this.importRange)
        input.value = ''
      })
      this.quill.container.appendChild(input)
      this.fileInput = input
    }
    this.fileInput.click()
  }

  async copyMarkdown(): Promise<boolean> {
    if (this.destroyed) return false
    const markdown = this.getMarkdown()
    if (!markdown) {
      this.notify('copy-empty')
      return false
    }
    try {
      await (this.options.copy || copyText)(markdown)
      this.notify('copy-success')
      return true
    } catch (error) {
      this.notify('copy-failed', error)
      return false
    }
  }

  async exportMarkdown(): Promise<boolean> {
    if (this.destroyed) return false
    const markdown = this.getMarkdown()
    if (!markdown) {
      this.notify('export-empty')
      return false
    }
    try {
      const blob = new Blob([`${markdown}\n`], { type: 'text/markdown;charset=utf-8' })
      await (this.options.download || downloadFile)(blob, this.options.exportFileName || 'content.md')
      return true
    } catch (error) {
      this.notify('export-failed', error)
      return false
    }
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.shortcuts?.destroy()
    this.restorePaste?.()
    this.removeMatcher()
    if (this.toolbar?.handlers.markdown === markdownHandler) {
      if (this.previousToolbarHandler) this.toolbar.handlers.markdown = this.previousToolbarHandler
      else delete this.toolbar.handlers.markdown
    }
    this.fileInput?.remove()
    this.fileInput = undefined
  }
}
