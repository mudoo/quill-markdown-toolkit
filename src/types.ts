import type { Range } from 'quill'

export interface ConversionOptions {
  /** Resolve aliases against the host's syntax highlighter when needed. */
  normalizeLanguage?: (language: string) => string
  videoLabel?: string
}

export interface ClipboardContent {
  text?: string
  html?: string
}

export type PasteHandler = (
  content: ClipboardContent,
  range: MarkdownRange,
  next: (convertMarkdown?: boolean) => void,
) => void

export interface PasteOptions {
  /** Call next synchronously to continue pasting, or handle the paste yourself. */
  pasteHandler?: PasteHandler
}

export type MarkdownAction = 'import' | 'copy' | 'export'
export type MarkdownContext = 'paste' | 'import' | 'insert' | 'shortcut'
export type MarkdownNoticeCode =
  | 'file-invalid' | 'file-empty' | 'file-read-failed'
  | 'copy-empty' | 'copy-success' | 'copy-failed'
  | 'export-empty' | 'export-failed'

export interface MarkdownNotice {
  code: MarkdownNoticeCode
  level: 'warning' | 'success' | 'error'
  error?: unknown
}

export interface MarkdownOptions extends ConversionOptions, PasteOptions {
  shortcuts?: boolean
  /** Disable when the host clipboard calls shouldConvertMarkdown itself. */
  paste?: boolean
  exportFileName?: string
  labels?: Partial<Record<MarkdownAction, string>>
  onNotice?: (notice: MarkdownNotice) => void
  copy?: (text: string) => void | Promise<void>
  download?: (blob: Blob, fileName: string) => void | Promise<void>
  /** Apply host media restrictions to every Markdown insertion path. */
  transformHtml?: (html: string, context: MarkdownContext) => string
}

export type MarkdownRange = Pick<Range, 'index' | 'length'>
