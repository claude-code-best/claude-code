import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
	resetCommandQueue,
	enqueue,
	enqueuePendingNotification,
} from '../messageQueueManager.js'
import { hasQueuedCommands, processQueueIfReady } from '../queueProcessor.js'

beforeEach(() => {
	resetCommandQueue()
})

afterEach(() => {
	resetCommandQueue()
})

describe('processQueueIfReady', () => {
	test('returns processed:false when queue empty', () => {
		const result = processQueueIfReady({
			executeInput: async () => {},
		})
		expect(result.processed).toBe(false)
	})

	test('processes single slash command individually', () => {
		const executed: string[][] = []
		enqueue({ value: '/help', mode: 'prompt' } as any)

		const result = processQueueIfReady({
			executeInput: async cmds => {
				executed.push(cmds.map(c => c.value as string))
			},
		})

		expect(result.processed).toBe(true)
		expect(executed).toHaveLength(1)
		expect(executed[0]).toEqual(['/help'])
	})

	test('processes bash mode command individually', () => {
		const executed: string[][] = []
		enqueue({ value: 'git status', mode: 'bash' } as any)

		const result = processQueueIfReady({
			executeInput: async cmds => {
				executed.push(cmds.map(c => c.value as string))
			},
		})

		expect(result.processed).toBe(true)
		expect(executed).toHaveLength(1)
		expect(executed[0]).toEqual(['git status'])
	})

	test('batches commands with same mode', () => {
		const executed: string[][] = []
		enqueuePendingNotification({ value: '<task1/>', mode: 'task-notification' } as any)
		enqueuePendingNotification({ value: '<task2/>', mode: 'task-notification' } as any)

		const result = processQueueIfReady({
			executeInput: async cmds => {
				executed.push(cmds.map(c => c.value as string))
			},
		})

		expect(result.processed).toBe(true)
		expect(executed).toHaveLength(1)
		expect(executed[0]).toEqual(['<task1/>', '<task2/>'])
	})

	test('does not mix different modes in same batch', () => {
		const executed: string[][] = []
		enqueue({ value: 'hello', mode: 'prompt' } as any)
		enqueuePendingNotification({ value: '<task/>', mode: 'task-notification' } as any)

		const result = processQueueIfReady({
			executeInput: async cmds => {
				executed.push(cmds.map(c => c.value as string))
			},
		})

		expect(result.processed).toBe(true)
		// Only the 'prompt' mode command should be processed (higher priority than task-notification)
		expect(executed).toHaveLength(1)
		expect(executed[0]).toEqual(['hello'])

		// The task-notification is still in queue
		expect(hasQueuedCommands()).toBe(true)
	})

	test('skips commands with agentId set (subagent notifications)', () => {
		// This simulates the v2.1.119 fix: subagent task-notification with agentId
		// should not be processed by the main thread queue processor
		enqueuePendingNotification({
			value: '<task-notification>subagent result</task-notification>',
			mode: 'task-notification',
			agentId: 'agent-123',
		} as any)

		const result = processQueueIfReady({
			executeInput: async () => {},
		})

		// Should not process — it's a subagent notification
		expect(result.processed).toBe(false)
	})

	test('returns processed:false when only subagent commands in queue', () => {
		enqueuePendingNotification({
			value: '<task-notification/>',
			mode: 'task-notification',
			agentId: 'agent-456',
		} as any)
		enqueuePendingNotification({
			value: '<task-notification/>',
			mode: 'task-notification',
			agentId: 'agent-789',
		} as any)

		const result = processQueueIfReady({
			executeInput: async () => {},
		})

		expect(result.processed).toBe(false)
		expect(hasQueuedCommands()).toBe(true)
	})

	test('processes main-thread command but skips subagent command', () => {
		const executed: string[][] = []
		enqueuePendingNotification({ value: '<main-task/>', mode: 'task-notification' } as any)
		enqueuePendingNotification({
			value: '<sub-task/>',
			mode: 'task-notification',
			agentId: 'agent-123',
		} as any)

		const result = processQueueIfReady({
			executeInput: async cmds => {
				executed.push(cmds.map(c => c.value as string))
			},
		})

		expect(result.processed).toBe(true)
		expect(executed).toHaveLength(1)
		expect(executed[0]).toEqual(['<main-task/>'])

		// Subagent command still in queue
		expect(hasQueuedCommands()).toBe(true)
	})
})

describe('hasQueuedCommands', () => {
	test('returns false when queue empty', () => {
		expect(hasQueuedCommands()).toBe(false)
	})

	test('returns true when commands in queue', () => {
		enqueue({ value: 'hello', mode: 'prompt' } as any)
		expect(hasQueuedCommands()).toBe(true)
	})
})
