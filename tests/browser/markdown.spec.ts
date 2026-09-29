import { expect, test, type Page } from '@playwright/test'

async function open(page: Page, query = '') {
  await page.goto(`/example/${query}`)
  await expect(page.locator('.ql-editor')).toBeVisible()
  await expect(page.locator('.ql-markdown .ql-picker-item[data-value="import"]')).toHaveAttribute('aria-label', '导入 md 文件')
}

async function insert(page: Page, markdown: string) {
  await page.locator('#source').fill(markdown)
  await page.locator('#insert').click()
}

async function paste(page: Page, text: string, html = '') {
  await page.locator('.ql-editor').focus()
  await page.locator('.ql-editor').evaluate((element, content) => {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/plain', content.text)
    if (content.html) clipboardData.setData('text/html', content.html)
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
  }, { text, html })
}

test('import, nested quote round trip, task lists, code language and one-step undo', async ({ page }) => {
  await open(page)
  await insert(page, '# 标题\n\n> parent\n>\n>> child\n>>> deep\n>\n> back\n\nseparator\n\n> second\n\n- [ ] todo\n- [x] done\n\n```js\nconst x = 1\n```\n\n---')
  await expect(page.locator('.ql-editor h1')).toHaveText('标题')
  await expect(page.locator('.ql-editor > blockquote')).toHaveCount(2)
  await expect(page.locator('[data-blockquote-depth="3"]')).toHaveText('deep')
  await expect(page.locator('li[data-list="checked"]')).toHaveText('done')
  await expect(page.locator('.ql-editor .ql-code-block')).toHaveAttribute('data-language', 'javascript')
  await expect(page.locator('.ql-editor hr')).toHaveCount(1)
  const markdown = await page.evaluate(() => window.markdown.getMarkdown())
  expect(markdown).toContain('> > > deep')
  expect(markdown).toContain('- [x] done')
  expect(markdown).toContain('```javascript')
  await page.evaluate(() => window.quill.history.undo())
  await expect(page.locator('.ql-editor')).toHaveText('')
  await page.evaluate(() => window.quill.history.redo())
  await expect(page.locator('.ql-editor h1')).toHaveText('标题')
  await page.locator('#clear').click()
  await insert(page, markdown)
  await expect(page.locator('[data-blockquote-depth="3"]')).toHaveText('deep')
})

test('mixed and nested task states survive export and reimport', async ({ page }) => {
  await open(page)
  await insert(page, '- [ ] parent\n  - [x] child\n- [x] done\n- plain')
  const before = await page.evaluate(() => window.quill.getContents().ops)
  const markdown = await page.evaluate(() => window.markdown.getMarkdown())
  expect(markdown).toContain('- [ ] parent')
  expect(markdown).toContain('- [x] child')
  expect(markdown).toContain('- [x] done')
  await page.locator('#clear').click()
  await insert(page, markdown)
  expect(await page.evaluate(() => window.quill.getContents().ops)).toEqual(before)
})

test('paste recognizes Markdown and preserves rich HTML', async ({ page }) => {
  await open(page)
  await paste(page, '## 粘贴标题\n\n> quote\n\n**bold**')
  await expect(page.locator('.ql-editor h2')).toHaveText('粘贴标题')
  await expect(page.locator('.ql-editor strong')).toHaveText('bold')
  await page.locator('#clear').click()
  await paste(page, '**literal**', '<p><strong>**literal**</strong></p>')
  await expect(page.locator('.ql-editor strong')).toHaveText('**literal**')
})

test('host paste handler can bypass Markdown conversion or continue normally', async ({ page }) => {
  await open(page, '?host-paste')
  await paste(page, '# literal')
  await expect(page.locator('.ql-editor h1')).toHaveCount(0)
  await expect(page.locator('.ql-editor')).toContainText('# literal')
  await page.locator('#clear').click()
  await paste(page, '## heading')
  await expect(page.locator('.ql-editor h2')).toHaveText('heading')
})

test('real typing shortcuts preserve cursor, inline formatting and nested quote depth', async ({ page }) => {
  await open(page)
  const editor = page.locator('.ql-editor')
  await editor.click()
  await page.keyboard.type('# Title')
  await expect(editor.locator('h1')).toHaveText('Title')
  await page.keyboard.press('Enter')
  await page.keyboard.type('**bold**')
  await page.keyboard.press('Space')
  await page.keyboard.type('normal')
  await expect(editor.locator('strong')).toHaveText('bold')
  await expect(editor).toContainText('bold normal')
  await page.locator('#clear').click()
  await editor.click()
  await page.keyboard.type('>> child')
  await expect(editor.locator('[data-blockquote-depth="2"]')).toHaveText('child')
  await page.keyboard.press('Enter')
  await page.keyboard.type('>>> deep')
  await expect(editor.locator('[data-blockquote-depth="3"]')).toHaveText('deep')
  await page.keyboard.press('Enter')
  await page.keyboard.type('> parent')
  await expect(editor.locator('[data-blockquote-depth="1"]')).toHaveText('parent')
})

test('code fence Enter positions typing inside the code block', async ({ page }) => {
  await open(page)
  await page.locator('.ql-editor').click()
  await page.keyboard.type('```js')
  await page.keyboard.press('Enter')
  await page.keyboard.type('const value = 1')
  await expect(page.locator('.ql-editor .ql-code-block')).toHaveText('const value = 1')
  await expect(page.locator('.ql-editor .ql-code-block')).toHaveAttribute('data-language', 'javascript')
})

test('toolbar imports files, copies Markdown and downloads an actual md file', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await open(page, '?table')
  await page.locator('.ql-markdown .ql-picker-label').click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByLabel('导入 md 文件').click()
  await (await chooser).setFiles({ name: 'example.md', mimeType: 'text/markdown', buffer: Buffer.from('# 文件导入\n\n正文') })
  await expect(page.locator('.ql-editor h1')).toHaveText('文件导入')
  await page.locator('.ql-markdown .ql-picker-label').click()
  await page.getByLabel('复制 Markdown 格式').click()
  await expect(page.getByRole('status')).toHaveText('copy-success')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('# 文件导入')
  await page.locator('.ql-markdown .ql-picker-label').click()
  const download = page.waitForEvent('download')
  await page.getByLabel('导出 md 文件').click()
  const file = await download
  expect(file.suggestedFilename()).toBe('content.md')
  const stream = await file.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  expect(Buffer.concat(chunks).toString()).toBe('# 文件导入\n\n正文\n')
})

test('table-better retains GFM tables through insert and export', async ({ page }) => {
  await open(page, '?table')
  await insert(page, '| Name | Value |\n| --- | --- |\n| **bold** | a \\| b |')
  await expect(page.locator('.ql-editor table')).toHaveCount(1)
  await expect(page.locator('.ql-editor table')).toContainText('a | b')
  const markdown = await page.evaluate(() => window.markdown.getMarkdown())
  expect(markdown).toContain('| Name | Value |')
  expect(markdown).toContain('**bold**')
  expect(markdown).toContain('a \\| b')
})

test('host filters cover API insertion, paste and file import', async ({ page }) => {
  await open(page, '?text-only')
  await insert(page, '![image](https://example.com/image.png)\n\nAPI text')
  await paste(page, '![image](https://example.com/image.png)\n\npasted text')
  await page.evaluate(async () => window.markdown.importFile(new File(['![image](https://example.com/image.png)\n\nfile text'], 'text.md')))
  await expect(page.locator('.ql-editor img')).toHaveCount(0)
  await expect(page.locator('.ql-editor')).toContainText('API text')
  await expect(page.locator('.ql-editor')).toContainText('pasted text')
  await expect(page.locator('.ql-editor')).toContainText('file text')
})

test('composition, configuration, read-only and destroy leave input untouched', async ({ page }) => {
  await open(page)
  await page.evaluate(() => {
    window.quill.root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    window.quill.insertText(0, '#', 'user')
    window.quill.insertText(1, ' ', 'user')
    window.quill.root.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
  })
  await expect(page.locator('.ql-editor h1')).toHaveCount(0)
  await page.evaluate(() => {
    window.quill.disable()
    window.markdown.insertMarkdown('# blocked')
  })
  await expect(page.locator('.ql-editor')).not.toContainText('blocked')
  await page.evaluate(() => {
    window.quill.enable()
    window.quill.setText('')
    window.markdown.destroy()
    window.markdown.destroy()
  })
  await paste(page, '# unchanged')
  await expect(page.locator('.ql-editor h1')).toHaveCount(0)
  await expect(page.locator('.ql-editor')).toContainText('# unchanged')
  await open(page, '?no-shortcuts&no-paste')
  await page.locator('.ql-editor').click()
  await page.keyboard.type('# plain')
  await expect(page.locator('.ql-editor h1')).toHaveCount(0)
  await paste(page, '**plain**')
  await expect(page.locator('.ql-editor strong')).toHaveCount(0)
})

test('file errors and async destruction produce no unwanted edits', async ({ page }) => {
  await open(page)
  expect(await page.evaluate(() => window.markdown.importFile(new File(['# x'], 'x.txt')))).toBe(false)
  await expect(page.getByRole('status')).toHaveText('file-invalid')
  expect(await page.evaluate(() => window.markdown.importFile(new File(['  '], 'x.md')))).toBe(false)
  await expect(page.getByRole('status')).toHaveText('file-empty')
  expect(await page.evaluate(async () => {
    const file = new File(['# late'], 'late.md')
    let release!: (text: string) => void
    file.text = () => new Promise((resolve) => { release = resolve })
    const imported = window.markdown.importFile(file)
    window.markdown.destroy()
    release('# late')
    return imported
  })).toBe(false)
  await expect(page.locator('.ql-editor')).toHaveText('')
})

test('copying part of a quote serializes only the selected text and inline format', async ({ page }) => {
  await open(page)
  await insert(page, '> **alpha beta**\n>\n> other paragraph')
  const html = await page.evaluate(() => window.quill.getSemanticHTML(6, 4))
  expect(html).toContain('<strong>beta</strong>')
  expect(html).not.toContain('alpha')
  expect(html).not.toContain('other paragraph')
})
