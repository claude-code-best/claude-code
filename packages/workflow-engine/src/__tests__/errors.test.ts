import { expect, test } from 'bun:test'
import { WorkflowError, WorkflowAbortedError } from '../engine/errors.js'

test('WorkflowError 携带消息与 name', () => {
  const e = new WorkflowError('脚本错误')
  expect(e).toBeInstanceOf(Error)
  expect(e.message).toBe('脚本错误')
  expect(e.name).toBe('WorkflowError')
})

test('WorkflowAbortedError 是可识别的取消错误', () => {
  const e = new WorkflowAbortedError()
  expect(e).toBeInstanceOf(Error)
  expect(e.name).toBe('WorkflowAbortedError')
  expect(e.message).toBeTruthy()
})

test('两类错误可被 instanceof 区分（互不混淆）', () => {
  const a = new WorkflowError('x')
  const b = new WorkflowAbortedError()
  expect(a).toBeInstanceOf(WorkflowError)
  expect(a).not.toBeInstanceOf(WorkflowAbortedError)
  expect(b).toBeInstanceOf(WorkflowAbortedError)
  expect(b).not.toBeInstanceOf(WorkflowError)
})

test('可作为普通 Error 在 catch 中捕获', () => {
  const throwIt = (): never => {
    throw new WorkflowAbortedError()
  }
  let caught: unknown = null
  try {
    throwIt()
  } catch (e) {
    caught = e
  }
  expect(caught).toBeInstanceOf(Error)
  expect(caught).toBeInstanceOf(WorkflowAbortedError)
})
