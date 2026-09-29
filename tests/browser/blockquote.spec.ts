import { expect, test } from '@playwright/test'

test('standalone format supports toolbar input without loading Markdown', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))
  await page.goto('/tests/browser/fixtures/blockquote.html')
  const editor = page.locator('.ql-editor')
  await editor.click()
  await page.keyboard.type('first')
  await page.keyboard.press('Enter')
  await page.keyboard.type('second')
  await page.keyboard.press('Control+A')
  await page.locator('.ql-toolbar .ql-blockquote').click()
  await expect(editor.locator('blockquote')).toHaveCount(1)
  await expect(editor.locator('.ql-blockquote-line')).toHaveText(['first', 'second'])
  expect(await page.evaluate(() => window.quill.getSemanticHTML())).toBe('<blockquote><p>first</p><p>second</p></blockquote>')
  expect(await page.evaluate(() => typeof window.markdown)).toBe('undefined')
  expect(requests.some((url) => /markdown-it|turndown|\/dist\/index\.js/.test(url))).toBe(false)
})

test('standalone HTML paste preserves quote groups, nesting, styles and partial copying', async ({ page }) => {
  await page.goto('/tests/browser/fixtures/blockquote.html')
  const editor = page.locator('.ql-editor')
  await editor.click()
  const html = '<blockquote><p><strong>alpha beta</strong></p><p>second</p><blockquote><p>child</p><blockquote><p>deep</p></blockquote></blockquote><p>back</p></blockquote><blockquote><p>separate</p></blockquote>'
  await editor.evaluate((element, html) => {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/html', html)
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
  }, html)
  await expect(editor.locator(':scope > blockquote')).toHaveCount(2)
  const deep = editor.locator('[data-blockquote-depth="3"]')
  await expect(deep).toHaveText('deep')
  await expect(deep).toHaveCSS('border-left-width', '4px')
  expect(await deep.evaluate((element) => {
    const style = getComputedStyle(element)
    return parseFloat(style.marginInlineStart) / parseFloat(style.fontSize)
  })).toBe(2)
  expect(await page.evaluate(() => window.quill.getSemanticHTML())).toContain(html)
  expect(await page.evaluate(() => window.quill.getSemanticHTML(6, 4))).toBe('<strong>beta</strong>')
})
