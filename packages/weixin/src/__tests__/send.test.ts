import { describe, expect, test } from 'bun:test'
import { markdownToPlainText } from '../send.js'

describe('markdownToPlainText', () => {
  test('removes bold markers', () => {
    expect(markdownToPlainText('**bold**')).toBe('bold')
  })

  test('removes italic markers', () => {
    expect(markdownToPlainText('*italic*')).toBe('italic')
  })

  test('removes inline code backticks', () => {
    expect(markdownToPlainText('`code`')).toBe('code')
  })

  test('removes code block fences', () => {
    expect(markdownToPlainText("```js\nconsole.log('hi');\n```"))
      .toBe("console.log('hi');")
  })

  test('converts links to text with URL', () => {
    expect(markdownToPlainText('[click](https://example.com)')).toBe(
      'click (https://example.com)',
    )
  })

  test('handles mixed markdown', () => {
    expect(markdownToPlainText('# Hello\n\n**bold** and *italic* with `code`'))
      .toBe('Hello\n\nbold and italic with code')
  })
})
