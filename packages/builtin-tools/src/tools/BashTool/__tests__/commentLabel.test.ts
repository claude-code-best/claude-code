import { describe, expect, test } from 'bun:test'
import { extractBashCommentLabel } from '../commentLabel.js'

describe('extractBashCommentLabel', () => {
  test('extracts a pure-comment command as the label', () => {
    expect(extractBashCommentLabel('# check status')).toBe('check status')
  })

  test('strips multiple # and leading whitespace', () => {
    expect(extractBashCommentLabel('##  build the project')).toBe(
      'build the project',
    )
  })

  test('single-line comment command yields the label', () => {
    expect(extractBashCommentLabel('# just a comment')).toBe('just a comment')
  })

  test('shebang first line is not a label', () => {
    expect(extractBashCommentLabel('#!/bin/bash\necho hi')).toBeUndefined()
  })

  test('no comment prefix yields undefined', () => {
    expect(extractBashCommentLabel('git status')).toBeUndefined()
  })

  test('empty label after stripping yields undefined', () => {
    expect(extractBashCommentLabel('#')).toBeUndefined()
    expect(extractBashCommentLabel('#   ')).toBeUndefined()
  })

  // Official 2.1.330 `tkr` guard: a leading comment followed by real command
  // content is shell documentation, not a note for the human — no label.
  test('real command content after the comment suppresses the label', () => {
    expect(extractBashCommentLabel('# label\ngit status')).toBeUndefined()
    expect(extractBashCommentLabel('# label\n\nls -la')).toBeUndefined()
  })

  test('only blank and comment lines after the comment keep the label', () => {
    expect(extractBashCommentLabel('# label\n\n# another comment')).toBe(
      'label',
    )
  })

  // Official 2.1.330 `nkr` guard: control characters (C0 < 0x20, C1
  // 0x7F–0x9F) in the label reject it, so escape sequences cannot smuggle
  // invisible characters into the transcript row.
  test('control characters in the label reject it', () => {
    expect(extractBashCommentLabel('# la\x01bel')).toBeUndefined()
    expect(extractBashCommentLabel('# la\u007fel')).toBeUndefined()
    expect(extractBashCommentLabel('# la\u009fel')).toBeUndefined()
  })

  test('printable ASCII and common Unicode labels are accepted', () => {
    expect(extractBashCommentLabel('# runs the tests — all of them')).toBe(
      'runs the tests — all of them',
    )
    expect(extractBashCommentLabel('# 100% pass')).toBe('100% pass')
  })
})
