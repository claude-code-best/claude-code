import { describe, expect, test } from 'bun:test'
import { detectContextBleed } from '../degradationGuard'

describe('detectContextBleed', () => {
  test('fires on a closed reminder block whose body matches a harness fingerprint', () => {
    // Real sample from session 816c6bda (2026-07-27): a whole assistant text
    // block that is just a regurgitated internal reminder.
    const text =
      '<system-reminder>\n' +
      'Warning: this tool result is 5 hours old. ' +
      'The user may have continued working since sending it.\n' +
      '</system-reminder>'
    const notice = detectContextBleed(text)
    expect(notice).not.toBeNull()
    expect(notice).toContain('/rewind')
  })

  test('does not fire when a fingerprinted block is wrapped in neutral prose (intentional quote)', () => {
    // Tightened: a block embedded in substantial neutral explanation is a quote,
    // not a bleed. (Previously this mid-text case fired; layer 3 now spares it.)
    const text =
      '这是 harness 注入的提醒:' +
      '<system-reminder>' +
      'This memory is 3 days old, verify before trusting.' +
      '</system-reminder> 它只是用来标注记忆的年龄。'
    expect(detectContextBleed(text)).toBeNull()
  })

  test('does not fire on normal prose that merely mentions "system reminder"', () => {
    const text =
      'The harness injects a system reminder into the user turn, not the assistant.'
    expect(detectContextBleed(text)).toBeNull()
  })

  test('does not fire when the tag is named without a closed block', () => {
    const text = '模型不应该在输出里回吐 <system-reminder> 这种内部标记。'
    expect(detectContextBleed(text)).toBeNull()
  })

  test('does not fire on source code that references the tag literal', () => {
    const text = "const SYSTEM_REMINDER_OPEN = '<system-reminder>'"
    expect(detectContextBleed(text)).toBeNull()
  })

  test('does not fire when discussing the degradation, quoting its hallucination phrases', () => {
    // This is exactly what a CCB dev session does: it names the tag and quotes
    // the symptom phrases. The old naive `includes('<system-reminder>')` check
    // false-fired here; the tightened one must not.
    const text =
      '收紧后,即使我在回复里提到 <system-reminder> 并引用"文件被污染/工具未执行"这些幻觉短语,也不该误报。'
    expect(detectContextBleed(text)).toBeNull()
  })

  test('does not fire on a closed block whose body has no harness fingerprint', () => {
    // e.g. quoting the language-restriction reminder verbatim for illustration.
    const text =
      '<system-reminder>语言限制：只允许中文或英文。</system-reminder>'
    expect(detectContextBleed(text)).toBeNull()
  })

  test('returns null for null, empty, and whitespace-only input', () => {
    expect(detectContextBleed(null)).toBeNull()
    expect(detectContextBleed('')).toBeNull()
    expect(detectContextBleed('   \n\t ')).toBeNull()
  })

  test('returns null for ordinary assistant output', () => {
    expect(
      detectContextBleed('Task 1 done. Now onemin_cut_process.py.'),
    ).toBeNull()
  })

  test('layer 1 (length gate): does not fire in a short session even on a bleed', () => {
    const text =
      '<system-reminder>Warning: this tool result is 5 hours old.</system-reminder>'
    expect(detectContextBleed(text, 5)).toBeNull()
  })

  test('layer 1 (length gate): fires once the session is long enough', () => {
    const text =
      '<system-reminder>Warning: this tool result is 5 hours old.</system-reminder>'
    expect(detectContextBleed(text, 80)).not.toBeNull()
  })

  test('layer 2 (meta-discussion): does not fire when outside prose discusses the guard', () => {
    const text =
      '<system-reminder>Warning: this tool result is 5 hours old.</system-reminder> —— 这正是 degradationGuard 要检测的回吐形态。'
    expect(detectContextBleed(text, 80)).toBeNull()
  })

  test('layer 3 (quote): does not fire when a fingerprinted block is wrapped in neutral prose', () => {
    const text =
      '这是 harness 每轮开头附加的内容,用来标注工具结果已经存在多久,方便判断新鲜度:<system-reminder>Warning: this tool result is 5 hours old.</system-reminder> 它属于正常的会话机制,不影响结果。'
    expect(detectContextBleed(text, 80)).toBeNull()
  })

  test('does not fire on a fingerprinted reminder quoted in a fenced code block', () => {
    // A teaching example: the whole reminder lives inside a ``` fence, and the
    // surrounding prose even carries symptom words. Without code-span exclusion
    // this would false-fire; the guard must treat code as documentation.
    const text =
      '举个例子，模型不该虚构文件被污染。它长这样：\n' +
      '```\n' +
      '<system-reminder>Warning: this tool result is 5 hours old.' +
      '</system-reminder>\n' +
      '```'
    expect(detectContextBleed(text, 80)).toBeNull()
  })

  test('does not fire on a fingerprinted reminder quoted in an inline code span', () => {
    const text =
      '内部提醒块 `<system-reminder>gentle reminder' +
      '</system-reminder>` 只是被当作代码引用，文件被污染这类幻觉词也在。'
    expect(detectContextBleed(text, 80)).toBeNull()
  })

  test('layer 3 (symptoms): fires when outside prose carries the hallucination symptoms', () => {
    // The real 2026-07-27 signature: block regurgitated, then bogus claims that
    // files were corrupted and tools never ran.
    const text =
      '<system-reminder>Warning: this tool result is 5 hours old.</system-reminder> 我发现文件被污染了,刚才的工具未执行。'
    expect(detectContextBleed(text, 80)).not.toBeNull()
  })
})
