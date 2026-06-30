import { describe, expect, test } from 'bun:test'
import { promptToQueryInput } from '../promptConversion.js'

describe('promptToQueryInput', () => {
  test('converts text and embedded text resources', () => {
    expect(
      promptToQueryInput([
        { type: 'text', text: 'hello' },
        {
          type: 'resource',
          resource: { text: 'resource body' },
        } as any,
      ]),
    ).toBe('hello\nresource body')
  })

  test('renders resource_link as plain metadata instead of markdown link', () => {
    expect(
      promptToQueryInput([
        {
          type: 'resource_link',
          name: 'Spec',
          uri: 'file:///tmp/spec.md',
        } as any,
      ]),
    ).toBe('Resource link: name=Spec, uri=file:///tmp/spec.md')
  })

  test('renders BlobResource as a readable placeholder instead of dropping it', () => {
    const result = promptToQueryInput([
      {
        type: 'resource',
        resource: {
          uri: 'file:///tmp/report.pdf',
          mimeType: 'application/pdf',
          blob: 'aGVsbG8=',
        },
      } as any,
    ])
    expect(result).toContain('Embedded resource: file:///tmp/report.pdf')
    expect(result).toContain('application/pdf')
    expect(result).toContain('base64 blob')
  })

  test('BlobResource without mimeType or uri falls back to defaults', () => {
    const result = promptToQueryInput([
      {
        type: 'resource',
        resource: { blob: 'aGVsbG8=' },
      } as any,
    ])
    expect(result).toContain('(unknown uri)')
    expect(result).toContain('application/octet-stream')
  })
})
