import { describe, expect, it } from 'vitest'
import { hasSemanticHtml, htmlToMarkdown, looksLikeMarkdown, markdownToHtml, shouldConvertMarkdown } from '../src/conversion'

describe('Markdown recognition and paste priority', () => {
  it.each(['# 标题', '**加粗**', '~~删除~~', '> 引用', '>> 子引用', '- [x] 完成', '| A | B |\n| --- | --- |\n| 1 | 2 |', '标题\n==='])('recognizes %s', (text) => {
    expect(looksLikeMarkdown(text)).toBe(true)
  })
  it.each(['普通文本', 'https://example.com', 'a_b_c', '\\*plain\\*', '1.2.3'])('leaves plain text alone: %s', (text) => {
    expect(looksLikeMarkdown(text)).toBe(false)
  })
  it('preserves semantic HTML but accepts a plain wrapper', () => {
    expect(shouldConvertMarkdown({ text: '**bold**', html: '<div>**bold**</div>' })).toBe(true)
    expect(shouldConvertMarkdown({ text: '**bold**', html: '<b>**bold**</b>' })).toBe(false)
    expect(hasSemanticHtml('<pre>**bold**</pre>')).toBe(true)
  })
  it('bases conversion only on Markdown and semantic HTML', () => {
    expect(shouldConvertMarkdown({ text: '*foo*' })).toBe(true)
    expect(shouldConvertMarkdown({ text: '# Title\n\n- Item\n  - Nested' })).toBe(true)
    expect(shouldConvertMarkdown({ text: '```js\nconst x = 1\n```' })).toBe(true)
    expect(shouldConvertMarkdown({ text: 'plain text' })).toBe(false)
  })
})

describe('conversion fidelity', () => {
  it('keeps nested and separate quote roots through HTML round trips', () => {
    const html = markdownToHtml('> parent\n>\n>> child\n>>> deep\n\nseparator\n\n> second')
    const roundTrip = markdownToHtml(htmlToMarkdown(html))
    const doc = new DOMParser().parseFromString(roundTrip, 'text/html')
    expect(doc.querySelectorAll('body > blockquote')).toHaveLength(2)
    expect(doc.querySelector('blockquote blockquote blockquote')?.textContent?.trim()).toBe('deep')
  })
  it('preserves mixed task states and nested list items', () => {
    const source = '- [ ] todo\n  - child\n- [x] done\n- plain'
    const html = markdownToHtml(source)
    expect(html).toContain('data-checked="false"')
    expect(html).toContain('data-checked="true"')
    const markdown = htmlToMarkdown(html)
    expect(markdown).toContain('- [ ] todo')
    expect(markdown).toContain('- [x] done')
    expect(markdownToHtml(markdown)).toContain('<li>child</li>')
  })
  it('retains code language aliases and fences containing backticks', () => {
    expect(markdownToHtml('```js\nconst x = 1\n```')).toContain('data-language="javascript"')
    const markdown = htmlToMarkdown('<pre><code class="language-js">  ```\nx\n  ```</code></pre>')
    expect(markdown).toMatch(/^````javascript/)
    expect(markdownToHtml(markdown)).toContain('  ```')
    expect(markdownToHtml('```custom\nx\n```', { normalizeLanguage: () => 'host' })).toContain('data-language="host"')
  })
  it('exports Quill 2 semantic task item attributes', () => {
    const markdown = htmlToMarkdown('<ul><li data-list="unchecked">todo</li><li data-list="checked">done</li></ul>')
    expect(markdown).toBe('- [ ] todo\n- [x] done')
  })
  it('recognizes task markers in loose lists with paragraph wrappers', () => {
    const html = markdownToHtml('- [ ] todo\n\n- [x] done')
    expect(html).toContain('data-checked="false"')
    expect(html).toContain('data-checked="true"')
  })
  it('does not read a nested task marker from an empty parent item', () => {
    const doc = new DOMParser().parseFromString(markdownToHtml('- \n  - [x] child'), 'text/html')
    const parent = doc.querySelector('body > ul > li')
    expect(parent?.parentElement?.hasAttribute('data-checked')).toBe(false)
    expect(parent?.querySelector('ul[data-checked="true"]')).not.toBeNull()
  })
  it('exports Quill tables with headerless TD rows and escaped pipes', () => {
    const markdown = htmlToMarkdown('<table><tbody><tr><td><p>A</p></td><td>B</td></tr><tr><td>a | b</td><td><p>one</p><p>two</p></td></tr></tbody></table>')
    expect(markdown).toContain('| A | B |')
    expect(markdown).toContain('a \\| b')
    expect(markdown).toContain('one two')
    expect(markdownToHtml(markdown)).toContain('<table>')
  })
  it('exports mentions, attachments and videos as readable text or links', () => {
    const markdown = htmlToMarkdown('<p><span class="mention">@张三</span> <a href="https://example.com/file">报告</a></p><video src="https://example.com/a(b).mp4" data-name="演示"></video>')
    expect(markdown).toContain('@张三')
    expect(markdown).toContain('[报告](https://example.com/file)')
    expect(markdown).toContain('[演示](https://example.com/a%28b%29.mp4)')
  })
  it('escapes raw HTML and rejects executable Markdown URLs', () => {
    const html = markdownToHtml('<script>alert(1)</script>\n\n[x](javascript:alert(1))')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('href="javascript:')
  })
})
