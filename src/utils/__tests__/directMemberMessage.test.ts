import { describe, expect, test } from 'bun:test'
import {
  parseDirectMemberMessage,
  sendDirectMemberMessage,
} from '../directMemberMessage'

describe('parseDirectMemberMessage', () => {
  test("parses '@agent-name hello world'", () => {
    const result = parseDirectMemberMessage('@agent-name hello world')
    expect(result).toEqual({
      recipientName: 'agent-name',
      message: 'hello world',
    })
  })

  test("parses '@agent-name single-word'", () => {
    const result = parseDirectMemberMessage('@agent-name single-word')
    expect(result).toEqual({
      recipientName: 'agent-name',
      message: 'single-word',
    })
  })

  test('returns null for non-matching input', () => {
    expect(parseDirectMemberMessage('hello world')).toBeNull()
  })

  test('returns null for empty string', () => {
    expect(parseDirectMemberMessage('')).toBeNull()
  })

  test("returns null for '@name' without message", () => {
    expect(parseDirectMemberMessage('@name')).toBeNull()
  })

  test("handles hyphenated agent names like '@my-agent msg'", () => {
    const result = parseDirectMemberMessage('@my-agent msg')
    expect(result).toEqual({ recipientName: 'my-agent', message: 'msg' })
  })

  test('handles multiline message content', () => {
    const result = parseDirectMemberMessage('@agent line1\nline2')
    expect(result).toEqual({ recipientName: 'agent', message: 'line1\nline2' })
  })

  test('extracts correct recipientName and message', () => {
    const result = parseDirectMemberMessage('@alice please fix the bug')
    expect(result?.recipientName).toBe('alice')
    expect(result?.message).toBe('please fix the bug')
  })

  test('trims message whitespace', () => {
    const result = parseDirectMemberMessage('@agent   hello   ')
    expect(result?.message).toBe('hello')
  })
})

describe('sendDirectMemberMessage', () => {
  test('returns error when no team context', async () => {
    const result = await sendDirectMemberMessage('agent', 'hello', null as any)
    expect(result).toEqual({ success: false, error: 'no_team_context' })
  })

  test('returns error for unknown recipient', async () => {
    const teamContext = {
      teamName: 'team1',
      teammates: { alice: { name: 'alice' } },
    }
    const result = await sendDirectMemberMessage(
      'bob',
      'hello',
      teamContext as any,
      async () => {},
    )
    expect(result).toEqual({
      success: false,
      error: 'unknown_recipient',
      recipientName: 'bob',
    })
  })

  test('calls writeToMailbox with correct args for valid recipient', async () => {
    let mailboxArgs: any = null
    const teamContext = {
      teamName: 'team1',
      teammates: { alice: { name: 'alice' } },
    }
    const result = await sendDirectMemberMessage(
      'alice',
      'hello',
      teamContext as any,
      async (recipient, msg, team) => {
        mailboxArgs = { recipient, msg, team }
      },
    )
    expect(result).toEqual({ success: true, recipientName: 'alice' })
    expect(mailboxArgs.recipient).toBe('alice')
    expect(mailboxArgs.msg.text).toBe('hello')
    expect(mailboxArgs.msg.from).toBe('user')
    expect(mailboxArgs.team).toBe('team1')
  })

  test('returns success for valid message', async () => {
    const teamContext = {
      teamName: 'team1',
      teammates: { bob: { name: 'bob' } },
    }
    const result = await sendDirectMemberMessage(
      'bob',
      'test message',
      teamContext as any,
      async () => {},
    )
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.recipientName).toBe('bob')
    }
  })
})
