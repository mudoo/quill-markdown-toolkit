export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Some embedded editors have clipboard permissions disabled but allow a user gesture.
    }
  }

  const active = document.activeElement as HTMLElement | null
  const selection = document.getSelection()
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange()) : []
  const input = document.createElement('textarea')
  input.value = text
  input.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'
  document.body.appendChild(input)
  try {
    input.select()
    if (!document.execCommand('copy')) throw new Error('Clipboard write failed')
  } finally {
    input.remove()
    active?.focus({ preventScroll: true })
    if (selection) {
      selection.removeAllRanges()
      ranges.forEach((range) => selection.addRange(range))
    }
  }
}

export function downloadFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  try {
    link.click()
  } finally {
    link.remove()
    // Let the browser consume the object URL before revoking it.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}
