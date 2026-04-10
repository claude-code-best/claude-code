import { describe, expect, test } from 'bun:test'
import { classifyMcpToolForCollapse } from '../classifyForCollapse'

describe('classifyMcpToolForCollapse', () => {
  // Search tools
  test('classifies Slack slack_search_public as search', () => {
    expect(classifyMcpToolForCollapse('slack', 'slack_search_public')).toEqual({
      isSearch: true,
      isRead: false,
    })
  })

  test('classifies GitHub search_code as search', () => {
    expect(classifyMcpToolForCollapse('github', 'search_code')).toEqual({
      isSearch: true,
      isRead: false,
    })
  })

  test('classifies Linear search_issues as search', () => {
    expect(classifyMcpToolForCollapse('linear', 'search_issues')).toEqual({
      isSearch: true,
      isRead: false,
    })
  })

  test('classifies Datadog search_logs as search', () => {
    expect(classifyMcpToolForCollapse('datadog', 'search_logs')).toEqual({
      isSearch: true,
      isRead: false,
    })
  })

  test('classifies Notion search as search', () => {
    expect(classifyMcpToolForCollapse('notion', 'search')).toEqual({
      isSearch: true,
      isRead: false,
    })
  })

  test('classifies Brave brave_web_search as search', () => {
    expect(
      classifyMcpToolForCollapse('brave-search', 'brave_web_search'),
    ).toEqual({
      isSearch: true,
      isRead: false,
    })
  })

  // Read tools
  test('classifies Slack slack_read_channel as read', () => {
    expect(classifyMcpToolForCollapse('slack', 'slack_read_channel')).toEqual({
      isSearch: false,
      isRead: true,
    })
  })

  test('classifies GitHub get_file_contents as read', () => {
    expect(classifyMcpToolForCollapse('github', 'get_file_contents')).toEqual({
      isSearch: false,
      isRead: true,
    })
  })

  test('classifies Linear get_issue as read', () => {
    expect(classifyMcpToolForCollapse('linear', 'get_issue')).toEqual({
      isSearch: false,
      isRead: true,
    })
  })

  test('classifies Filesystem read_file as read', () => {
    expect(classifyMcpToolForCollapse('filesystem', 'read_file')).toEqual({
      isSearch: false,
      isRead: true,
    })
  })

  test('classifies GitHub list_commits as read', () => {
    expect(classifyMcpToolForCollapse('github', 'list_commits')).toEqual({
      isSearch: false,
      isRead: true,
    })
  })

  test('classifies Slack slack_list_channels as read', () => {
    expect(classifyMcpToolForCollapse('slack', 'slack_list_channels')).toEqual({
      isSearch: false,
      isRead: true,
    })
  })

  // Unknown tools
  test('unknown tool returns { isSearch: false, isRead: false }', () => {
    expect(classifyMcpToolForCollapse('unknown', 'do_something')).toEqual({
      isSearch: false,
      isRead: false,
    })
  })

  // normalize: camelCase -> snake_case
  test('tool name with camelCase variant still matches after normalize', () => {
    // searchCode -> search_code
    expect(classifyMcpToolForCollapse('github', 'searchCode')).toEqual({
      isSearch: true,
      isRead: false,
    })
  })

  // normalize: kebab-case -> snake_case
  test('tool name with kebab-case variant still matches after normalize', () => {
    // search-code -> search_code
    expect(classifyMcpToolForCollapse('github', 'search-code')).toEqual({
      isSearch: true,
      isRead: false,
    })
  })

  // Server name doesn't affect classification
  test('server name parameter does not affect classification', () => {
    const r1 = classifyMcpToolForCollapse('server-a', 'search_code')
    const r2 = classifyMcpToolForCollapse('server-b', 'search_code')
    expect(r1).toEqual(r2)
  })

  // Edge cases
  test('empty tool name returns false/false', () => {
    expect(classifyMcpToolForCollapse('server', '')).toEqual({
      isSearch: false,
      isRead: false,
    })
  })

  // normalize lowercases, so SEARCH_CODE -> search_code -> matches
  test('uppercase input normalizes to match', () => {
    expect(classifyMcpToolForCollapse('github', 'SEARCH_CODE')).toEqual({
      isSearch: true,
      isRead: false,
    })
  })

  test('handles tool names with numbers', () => {
    expect(classifyMcpToolForCollapse('server', 'search2_things')).toEqual({
      isSearch: false,
      isRead: false,
    })
  })
})
