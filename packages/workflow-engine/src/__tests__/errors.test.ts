import { expect, test } from 'bun:test'
import { WorkflowError, WorkflowAbortedError } from '../engine/errors.js'

test('WorkflowError carries message and name', () => {
  const e = new WorkflowError('script error')
  expect(e).toBeInstanceOf(Error)
  expect(e.message).toBe('script error')
  expect(e.name).toBe('WorkflowError')
})

test('WorkflowAbortedError is a recognizable cancellation error', () => {
  const e = new WorkflowAbortedError()
  expect(e).toBeInstanceOf(Error)
  expect(e.name).toBe('WorkflowAbortedError')
  expect(e.message).toBeTruthy()
})

test('the two error types can be distinguished by instanceof (not confused)', () => {
  const a = new WorkflowError('x')
  const b = new WorkflowAbortedError()
  expect(a).toBeInstanceOf(WorkflowError)
  expect(a).not.toBeInstanceOf(WorkflowAbortedError)
  expect(b).toBeInstanceOf(WorkflowAbortedError)
  expect(b).not.toBeInstanceOf(WorkflowError)
})

test('can be caught as a plain Error in a catch block', () => {
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
