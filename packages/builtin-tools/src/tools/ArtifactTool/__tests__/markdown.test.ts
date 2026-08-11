import { describe, expect, test } from 'bun:test'
import { markdownToHtml } from '../markdown.js'

describe('markdownToHtml', () => {
  test('wraps body in a full HTML document', () => {
    const out = markdownToHtml('# Hello')
    expect(out.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(out).toContain('<html')
    expect(out).toContain('</html>')
    expect(out).toContain('<style>')
  })

  test('extracts H1 as <title>', () => {
    const out = markdownToHtml('# Hello World\n\nbody')
    expect(out).toContain('<title>Hello World</title>')
    expect(out).toContain('<h1>Hello World</h1>')
  })

  test('renders GFM tables', () => {
    const md = ['| A | B |', '| - | - |', '| 1 | 2 |'].join('\n')
    const out = markdownToHtml(md)
    expect(out).toContain('<table>')
    expect(out).toContain('<th>A</th>')
    expect(out).toContain('<td>1</td>')
  })

  test('preserves fenced code language class', () => {
    const md = '```ts\nconst x = 1\n```'
    const out = markdownToHtml(md)
    expect(out).toContain('class="language-ts"')
    expect(out).toContain('<pre>')
  })

  test('passes through inline raw HTML', () => {
    const out = markdownToHtml('<strong>raw</strong>')
    expect(out).toContain('<strong>raw</strong>')
  })

  test('renders blockquotes', () => {
    const out = markdownToHtml('> quoted')
    expect(out).toContain('<blockquote>')
  })

  test('falls back to basename when no H1 present', () => {
    const out = markdownToHtml('just body text', '/tmp/My Report.md')
    expect(out).toContain('<title>My Report</title>')
  })

  test('falls back to default when no H1 and no filename', () => {
    const out = markdownToHtml('just body text')
    expect(out).toContain('<title>Artifact</title>')
  })

  test('strips .markdown suffix in fallback title', () => {
    const out = markdownToHtml('body', '/x/foo.markdown')
    expect(out).toContain('<title>foo</title>')
  })

  test('escapes HTML in title to prevent injection', () => {
    const out = markdownToHtml('# Title <script>alert(1)</script>')
    // Title tag must not contain a literal <script>
    const titleMatch = out.match(/<title>([\s\S]*?)<\/title>/)
    expect(titleMatch).not.toBeNull()
    expect(titleMatch![1]).not.toContain('<script>')
    expect(titleMatch![1]).toContain('&lt;script&gt;')
  })

  test('embeds highlight.js and mermaid via unpkg CDN', () => {
    const out = markdownToHtml('body')
    expect(out).toContain(
      'https://unpkg.com/@highlightjs/cdn-assets@11.10.0/highlight.min.js',
    )
    expect(out).toContain(
      'https://unpkg.com/@highlightjs/cdn-assets@11.10.0/styles/github.min.css',
    )
    expect(out).toContain('https://unpkg.com/mermaid@11/dist/mermaid.min.js')
    // Init script must run after both libraries load.
    expect(out).toContain('hljs.highlightAll()')
    expect(out).toContain('mermaid.initialize(')
    expect(out).toContain('language-mermaid')
    const mermaidIdx = out.indexOf('mermaid@11/dist/mermaid.min.js')
    const hljsIdx = out.indexOf('highlight.min.js')
    const initIdx = out.indexOf('hljs.highlightAll')
    expect(mermaidIdx).toBeGreaterThan(0)
    expect(hljsIdx).toBeGreaterThan(mermaidIdx)
    expect(initIdx).toBeGreaterThan(hljsIdx)
  })
})
