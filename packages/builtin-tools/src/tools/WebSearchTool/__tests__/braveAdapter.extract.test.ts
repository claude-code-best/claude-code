import { describe, expect, test } from 'bun:test'
import { extractBraveResults } from '../adapters/braveAdapter'

describe('extractBraveResults', () => {
  test('extracts generic grounding results', () => {
    const results = extractBraveResults({
      grounding: {
        generic: [
          {
            title: 'Example Title 1',
            url: 'https://example.com/page1',
            snippets: ['First result description'],
          },
          {
            title: 'Example Title 2',
            url: 'https://example.com/page2',
            snippets: ['Second result description'],
          },
        ],
      },
    })

    expect(results).toEqual([
      {
        title: 'Example Title 1',
        url: 'https://example.com/page1',
        snippet: 'First result description',
      },
      {
        title: 'Example Title 2',
        url: 'https://example.com/page2',
        snippet: 'Second result description',
      },
    ])
  })

  test('combines generic, poi, and map grounding results', () => {
    const results = extractBraveResults({
      grounding: {
        generic: [{ title: 'Generic', url: 'https://example.com/generic' }],
        poi: { title: 'POI', url: 'https://maps.example.com/poi' },
        map: [{ title: 'Map', url: 'https://maps.example.com/map' }],
      },
    })

    expect(results).toEqual([
      { title: 'Generic', url: 'https://example.com/generic', snippet: undefined },
      { title: 'POI', url: 'https://maps.example.com/poi', snippet: undefined },
      { title: 'Map', url: 'https://maps.example.com/map', snippet: undefined },
    ])
  })

  test('joins multiple snippets into one summary string', () => {
    const results = extractBraveResults({
      grounding: {
        generic: [
          {
            title: 'Joined Snippets',
            url: 'https://example.com/joined',
            snippets: ['First snippet.', 'Second snippet.'],
          },
        ],
      },
    })

    expect(results[0].snippet).toBe('First snippet. Second snippet.')
  })

  test('skips entries without a title or URL', () => {
    const results = extractBraveResults({
      grounding: {
        generic: [
          { title: 'Missing URL' },
          { url: 'https://example.com/missing-title' },
          { title: 'Valid', url: 'https://example.com/valid' },
        ],
      },
    })

    expect(results).toEqual([
      { title: 'Valid', url: 'https://example.com/valid', snippet: undefined },
    ])
  })

  test('deduplicates repeated URLs across grounding buckets', () => {
    const results = extractBraveResults({
      grounding: {
        generic: [{ title: 'First', url: 'https://example.com/dup' }],
        poi: { title: 'Second', url: 'https://example.com/dup' },
        map: [{ title: 'Third', url: 'https://example.com/dup' }],
      },
    })

    expect(results).toEqual([
      { title: 'First', url: 'https://example.com/dup', snippet: undefined },
    ])
  })

  test('returns empty array when grounding is missing', () => {
    expect(extractBraveResults({})).toEqual([])
  })

  test('returns empty array when grounding arrays are absent', () => {
    expect(extractBraveResults({ grounding: {} })).toEqual([])
  })
})
