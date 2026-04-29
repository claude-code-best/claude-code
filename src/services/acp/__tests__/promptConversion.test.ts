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
})
