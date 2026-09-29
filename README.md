# quill-markdown-toolkit

适用于 Quill 2.0.3 及以上的 2.x 版本的独立 TypeScript 模块，提供 Markdown / HTML 转换、粘贴识别、输入快捷转换，以及工具栏导入、复制和导出。

运行时依赖 `markdown-it`、`turndown`、`turndown-plugin-gfm` 和独立引用格式包 `quill-format-blockquote`，Quill 为 peer dependency。提供 ESM、CommonJS、UMD、类型声明和独立 CSS。

## 本地构建与接入

```sh
npm install
npm run verify
npm pack
```

```ts
import Quill from 'quill'
import Markdown from 'quill-markdown-toolkit'
import 'quill/dist/quill.snow.css'
import 'quill-markdown-toolkit/style.css'

Quill.register('modules/markdown', Markdown, true)

const quill = new Quill('#editor', {
  theme: 'snow',
  modules: {
    toolbar: [
      ['bold', 'italic', 'blockquote', 'code-block'],
      [{ markdown: [false, 'import', 'export', 'copy'] }],
    ],
    markdown: {
      exportFileName: 'content.md',
      onNotice: ({ code, level }) => console.log(level, code),
    },
  },
})

const markdown = quill.getModule('markdown') as Markdown
markdown.insertMarkdown('# 标题\n\n**内容**')
console.log(markdown.getMarkdown())

// 在宿主组件卸载时调用；Quill 2 本身不提供统一的 destroy()。
// markdown.destroy()
```

直接通过浏览器脚本加载时，先加载 Quill，再加载 `dist/index.umd.js` 和 `dist/style.css`。UMD 暴露 `window.QuillMarkdownModule`，其中 `Markdown` 是模块类：

```html
<script src="quill/dist/quill.js"></script>
<script src="quill-markdown-toolkit/dist/index.umd.js"></script>
<script>
  Quill.register('modules/markdown', QuillMarkdownModule.Markdown, true)
</script>
```

Git 只跟踪构建生成的 UMD 文件；其他 `dist` 文件由 `npm run build` 或打包前的 `prepack` 生成。

注册模块时会同时注册 `blockquote`、`blockquote-container` 和 `horizontal` 格式，以保留连续/嵌套引用和分隔线。注册发生在显式调用 `Quill.register` 时。使用 `formats` 白名单时需允许 `blockquote` 和 `horizontal`，引用容器会自动带上；自定义 Parchment registry 则需要自行注册这些格式。

引用的格式类、分组 matcher 和嵌套样式由 `quill-format-blockquote` 提供。需要单独使用引用功能时，可直接接入该包，无需加载 Markdown。当前主入口继续导出 `Blockquote`、`BlockquoteContainer`、`matchBlockquote` 和 `Horizontal`，`style.css` 也继续包含完整引用样式。

## 独立转换工具

```ts
import {
  markdownToHtml,
  htmlToMarkdown,
  shouldConvertMarkdown,
} from 'quill-markdown-toolkit/conversion'

const html = markdownToHtml('> 引用\n>\n>> 嵌套引用')
const markdown = htmlToMarkdown(html)
const shouldConvert = shouldConvertMarkdown({ text: '**内容**', html: '' })
```

`/conversion` 不加载 Quill，可以在 SSR 中导入。实际 HTML 转换和 HTML 检测需要浏览器 DOM（`DOMParser`、`document`）；Node 中执行这些函数需要提供 DOM 环境。主入口是浏览器模块，SSR 项目应在客户端加载。

TypeScript 推荐沿用 Vite 的 `moduleResolution: "Bundler"`。使用 `NodeNext` 时，Quill / quill-delta 的上游声明需要 `skipLibCheck: true`；本包的两种入口均提供对应类型声明。

| 函数 | 用途 |
| --- | --- |
| `markdownToHtml(text, options?)` | 转换 Markdown，设置代码语言与任务列表状态 |
| `htmlToMarkdown(html, options?)` | 导出 Quill 语义 HTML，也支持普通 HTML |
| `looksLikeMarkdown(text, allowShortcut?)` | 识别 Markdown，默认不把裸 URL 当成 Markdown |
| `hasSemanticHtml(html)` | 检测应优先保留的富文本 HTML |
| `hasMarkdownDocumentStructure(text)` | 检测标题、列表等 Markdown 文档结构 |
| `shouldConvertMarkdown(content)` | 根据 Markdown 文本和富文本 HTML 决定是否转换 |
| `normalizeLanguage(language)` | 规范化常见代码语言别名，如 `js → javascript` |

转换选项为 `normalizeLanguage?: (language) => string` 和 `videoLabel?: string`。Markdown 中的原始 HTML 会转义，不会直接执行。

## 模块 API

| 方法 | 行为 |
| --- | --- |
| `insertMarkdown(text, range?)` | 在当前/指定选区插入，作为一次独立的撤销操作；没有选区时追加 |
| `getMarkdown()` | 返回全文 Markdown |
| `importFile(file, range?)` | 导入 `.md` / `.markdown`，返回 `Promise<boolean>` |
| `selectMarkdownFile()` | 打开文件选择器，保留打开前的选区 |
| `copyMarkdown()` | 复制全文，返回 `Promise<boolean>` |
| `exportMarkdown()` | 下载 Markdown 文件，返回 `Promise<boolean>` |
| `destroy()` | 移除事件、文件控件和当前实例的粘贴处理，可重复调用 |

输入空格或回车时转换标题、引用、代码围栏、行内格式等。Quill 原有列表快捷键继续生效。输入法组合期间及代码块内部不触发转换。

| 配置 | 默认值 / 用途 |
| --- | --- |
| `paste` | `true`，自动识别 Markdown 粘贴，并继续调用现有 Clipboard 的 `onPaste` |
| `shortcuts` | `true`，输入快捷转换 |
| `exportFileName` | `content.md` |
| `labels` | 工具栏 `import`、`export`、`copy` 标签，默认中文 |
| `pasteHandler(content, range, next)` | 可选的同步粘贴处理函数；`next()` 使用默认 Markdown 识别，`next(false)` 直接交给原有 Clipboard |
| `normalizeLanguage` | 可选的宿主代码语言规范化函数 |
| `videoLabel` | 未提供视频标题时的链接文案，默认 `视频` |
| `transformHtml(html, context)` | 在 `paste`、`import`、`insert`、`shortcut` 各入口应用媒体过滤等宿主策略 |
| `onNotice({ code, level, error? })` | 宿主提示回调，包本身不弹消息 |
| `copy(text)` | 可选异步复制实现；失败应抛出异常或 reject |
| `download(blob, fileName)` | 可选异步下载实现；失败应抛出异常或 reject |

通知代码：`file-invalid`、`file-empty`、`file-read-failed`、`copy-empty`、`copy-success`、`copy-failed`、`export-empty`、`export-failed`。`level` 为 `warning`、`success` 或 `error`。

## 与宿主协作

- 富文本 HTML 优先保留，纯文本或只有普通包裹元素的 Markdown 才进入识别流程。宿主可用 `pasteHandler` 决定是否交给原有 Clipboard；自行处理粘贴时无需调用 `next`。每次粘贴最多调用一次 `next`，且应同步调用。
- `transformHtml` 可统一过滤禁用的图片、视频等，覆盖粘贴、文件导入、API 插入和快捷输入。该配置针对 Markdown 路径，宿主仍负责普通富文本粘贴及文件上传限制。
- 包不注册或替换 Clipboard 类。已有复杂粘贴管线可以设置 `paste: false`，在原来的处理位置调用 `shouldConvertMarkdown` 和 `markdownToHtml`。
- `quill-table-better` 为示例/测试依赖，运行时由宿主自行配置。已验证 1.2.3 的表格导入导出与工具栏行为；代码高亮和语言保留沿用宿主的 Quill `syntax` 模块。
- Markdown 不承载字体、颜色、合并单元格等全部富文本信息。提及导出为可读文本，视频导出为链接；无表头表格将首行作为 Markdown 表头。

## 开发

```sh
npm run dev          # http://127.0.0.1:5197/example/
npm run typecheck
npm test
npm run build
npm run test:browser # 针对构建产物运行真实 Chromium 测试
```

浏览器测试会检查端口是否空闲，记录临时服务 PID/端口到 `.preview/server.json`，结束时关闭服务并确认端口释放。不会复用或关闭已有服务。示例加 `?table` 启用 table-better；加 `?text-only` 演示统一媒体过滤。
