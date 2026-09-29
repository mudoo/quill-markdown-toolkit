import type { Delta, EmitterSource } from 'quill'
import Quill from 'quill'
import { createBlockquoteGroup, getBlockquotePath } from 'quill-format-blockquote'
import { looksLikeMarkdown } from './conversion'

interface TextChange {
  index: number
  text: ' ' | '\n'
}

function clearInlineFormatsAtCursor(quill: Quill) {
  const range = quill.getSelection()
  if (!range || range.length !== 0) return
  const { Scope } = Quill.import('parchment')
  Object.keys(quill.getFormat(range)).forEach((name) => {
    if (quill.scroll.query(name, Scope.INLINE)) {
      quill.format(name, false, Quill.sources.SILENT)
    }
  })
}

export class MarkdownShortcuts {
  private composing = false
  private converting = false
  private destroyed = false

  constructor(private quill: Quill, private toHtml: (markdown: string) => string) {
    this.handleTextChange = this.handleTextChange.bind(this)
    this.handleCompositionStart = this.handleCompositionStart.bind(this)
    this.handleCompositionEnd = this.handleCompositionEnd.bind(this)
    quill.on('text-change', this.handleTextChange)
    quill.root.addEventListener('compositionstart', this.handleCompositionStart)
    quill.root.addEventListener('compositionend', this.handleCompositionEnd)
  }

  private handleCompositionStart() {
    this.composing = true
  }

  private handleCompositionEnd() {
    this.composing = false
  }

  private getTextChange(delta: Delta): TextChange | null {
    let index = 0
    let result: TextChange | null = null

    for (const op of delta.ops) {
      if (typeof op.retain === 'number') index += op.retain
      if (typeof op.insert !== 'string') continue
      if (op.insert !== ' ' && op.insert !== '\n') return null
      if (result) return null
      result = { index, text: op.insert }
      index += op.insert.length
    }

    return result
  }

  private handleTextChange(delta: Delta, _oldContents: Delta, source: EmitterSource) {
    if (source !== Quill.sources.USER || this.composing || this.converting) return
    const change = this.getTextChange(delta)
    if (!change) return
    this.convertCurrentLine(change)
  }

  private convertCurrentLine(change: TextChange) {
    const [line, offset] = this.quill.getLine(change.index)
    if (!line) return

    const lineStart = change.index - offset
    const lineLength = line.length()
    const lineText = this.quill.getText(lineStart, lineLength).replace(/\n$/, '')
    const triggerOffset = change.index - lineStart
    const isLineEnd = change.text === '\n'
      ? triggerOffset === lineText.length
      : triggerOffset === lineText.length - 1
    if (!isLineEnd || !looksLikeMarkdown(lineText, true)) return

    const formatIndex = Math.max(lineStart, change.index - 1)
    const formats = this.quill.getFormat(formatIndex, 1)
    if (formats.code || formats['code-block'] || formats['code-plain']) return

    const DeltaClass = Quill.import('delta') as typeof Delta
    const html = this.toHtml(lineText)
    let converted = this.quill.clipboard.convert({ html, text: lineText })
    const blockquoteDepth = lineText.match(/^\s{0,3}(>+)\s/)?.[1].length || 0
    const currentBlockquotePath = formats.blockquote ? getBlockquotePath(formats.blockquote) : []
    let blockquotePath = ''
    if (blockquoteDepth) {
      const preservedDepth = Math.min(currentBlockquotePath.length, blockquoteDepth)
      blockquotePath = [
        ...currentBlockquotePath.slice(0, preservedDepth),
        ...Array.from(
          { length: blockquoteDepth - preservedDepth },
          createBlockquoteGroup
        )
      ].join('/')
      converted = converted.reduce((result, op) => {
        if (!op.insert || !op.attributes?.blockquote) return result.push(op)
        return result.insert(op.insert, { ...op.attributes, blockquote: blockquotePath })
      }, new DeltaClass())
      // An empty root quote renders without a paragraph, so Clipboard can return no line.
      if (/^\s{0,3}>+\s+$/.test(lineText)) {
        converted = new DeltaClass().insert('\n', { blockquote: blockquotePath })
      }
    }
    if (!converted.length()) return

    const isCodeFence = /^\s{0,3}(?:`{3}|~{3})/.test(lineText)
    const isHorizontal = converted.ops.some((op) => (
      typeof op.insert === 'object' && op.insert !== null && 'horizontal' in op.insert
    ))
    // Clipboard conversion trims trailing whitespace. Keep the inline shortcut's space
    // outside the new format so the following word does not stick to the formatted text.
    if (change.text === ' ' && !isHorizontal && !isCodeFence
      && !converted.ops.some((op) => typeof op.insert === 'string' && op.insert.includes('\n'))) {
      const tail = converted.ops.at(-1)?.insert
      if (typeof tail !== 'string' || !tail.endsWith(' ')) converted.insert(' ')
    }
    const lastOp = converted.ops[converted.ops.length - 1]
    const endsWithNewline = typeof lastOp?.insert === 'string' && lastOp.insert.endsWith('\n')
    const preserveLineBreak = !isCodeFence && !endsWithNewline && !(isHorizontal && change.text === '\n')
    const deleteLength = Math.min(
      lineLength - (preserveLineBreak ? 1 : 0) + (isCodeFence && change.text === '\n' ? 1 : 0),
      this.quill.getLength() - lineStart
    )
    const update = new DeltaClass()
      .retain(lineStart)
      .delete(deleteLength)
      .concat(converted)
    const selectionIndex = isCodeFence
      ? lineStart
      : lineStart + converted.length() + (change.text === '\n' && preserveLineBreak ? 1 : 0) - (change.text === ' ' && endsWithNewline ? 1 : 0)

    const setConvertedSelection = () => {
      if (this.destroyed) return
      if (isCodeFence && !this.quill.getFormat(lineStart, 1)['code-block']) return
      const maxIndex = Math.max(0, this.quill.getLength() - 1)
      this.quill.setSelection(Math.min(selectionIndex, maxIndex), 0, Quill.sources.SILENT)
      clearInlineFormatsAtCursor(this.quill)
    }

    this.converting = true
    try {
      this.quill.updateContents(update, Quill.sources.USER)
      if (blockquotePath) {
        this.quill.formatLine(lineStart, 1, 'blockquote', blockquotePath, Quill.sources.USER)
      }
      if (change.text === '\n' || isCodeFence) {
        // Quill's Enter handler restores a selection based on the removed Markdown source length.
        queueMicrotask(setConvertedSelection)
      } else {
        setConvertedSelection()
      }
    } finally {
      this.converting = false
    }
  }

  destroy() {
    this.destroyed = true
    this.quill.off('text-change', this.handleTextChange)
    this.quill.root.removeEventListener('compositionstart', this.handleCompositionStart)
    this.quill.root.removeEventListener('compositionend', this.handleCompositionEnd)
  }
}
