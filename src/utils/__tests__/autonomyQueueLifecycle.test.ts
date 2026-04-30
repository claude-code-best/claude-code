import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createTempDir, cleanupTempDir } from '../../../tests/mocks/file-system'
import { getAttachmentMessages } from '../attachments'
import {
  createAutonomyQueuedPrompt,
  createProactiveAutonomyCommands,
  getAutonomyRunById,
  markAutonomyRunCancelled,
  startManagedAutonomyFlowFromHeartbeatTask,
} from '../autonomyRuns'
import { getAutonomyFlowById, listAutonomyFlows } from '../autonomyFlows'
import {
  cancelQueuedAutonomyCommands,
  claimConsumableQueuedAutonomyCommands,
  finalizeAutonomyCommandsForTurn,
  partitionConsumableQueuedAutonomyCommands,
} from '../autonomyQueueLifecycle'
import {
  enqueue,
  getCommandsByMaxPriority,
  remove as removeFromQueue,
  resetCommandQueue,
} from '../messageQueueManager'

let tempDir = ''
let extraTempDirs: string[] = []

beforeEach(async () => {
  tempDir = await createTempDir('autonomy-queue-lifecycle-')
  extraTempDirs = []
  resetCommandQueue()
})

afterEach(async () => {
  resetCommandQueue()
  if (tempDir) {
    await cleanupTempDir(tempDir)
  }
  for (const extraTempDir of extraTempDirs) {
    await cleanupTempDir(extraTempDir)
  }
})

describe('autonomyQueueLifecycle', () => {
  async function consumeQueuedAutonomyAttachmentTurn() {
    const previousDisableAttachments =
      process.env.CLAUDE_CODE_DISABLE_ATTACHMENTS
    process.env.CLAUDE_CODE_DISABLE_ATTACHMENTS = '1'
    try {
      const snapshot = getCommandsByMaxPriority('later')
      const claim = await claimConsumableQueuedAutonomyCommands(
        snapshot,
        tempDir,
      )
      removeFromQueue(claim.staleCommands)
      removeFromQueue(claim.claimedCommands)

      const attachments = []
      for await (const attachment of getAttachmentMessages(
        null,
        {} as never,
        null,
        claim.attachmentCommands,
        [],
      )) {
        attachments.push(attachment)
      }

      const consumedCommands = claim.attachmentCommands.filter(
        command =>
          (command.mode === 'prompt' || command.mode === 'task-notification') &&
          !claim.claimedCommands.includes(command),
      )
      removeFromQueue(consumedCommands)
      const nextCommands = await finalizeAutonomyCommandsForTurn({
        commands: claim.claimedCommands,
        outcome: { type: 'completed' },
        currentDir: tempDir,
        priority: 'later',
      })
      for (const command of nextCommands) {
        enqueue(command)
      }

      return { attachments, runningRunIds: claim.claimedRunIds, nextCommands }
    } finally {
      if (previousDisableAttachments === undefined) {
        delete process.env.CLAUDE_CODE_DISABLE_ATTACHMENTS
      } else {
        process.env.CLAUDE_CODE_DISABLE_ATTACHMENTS = previousDisableAttachments
      }
    }
  }

  test('filters stale autonomy commands before mid-turn attachment consumption', async () => {
    const command = await createAutonomyQueuedPrompt({
      basePrompt: 'scheduled prompt',
      trigger: 'scheduled-task',
      rootDir: tempDir,
      currentDir: tempDir,
    })
    expect(command).not.toBeNull()

    const initial = await partitionConsumableQueuedAutonomyCommands(
      [command!],
      tempDir,
    )
    expect(initial.attachmentCommands).toHaveLength(1)
    expect(initial.staleCommands).toHaveLength(0)

    await markAutonomyRunCancelled(command!.autonomy!.runId, tempDir)

    const afterCancel = await partitionConsumableQueuedAutonomyCommands(
      [command!],
      tempDir,
    )
    expect(afterCancel.attachmentCommands).toHaveLength(0)
    expect(afterCancel.staleCommands).toHaveLength(1)
  })

  test('cancels proactive commands that are created but dropped before enqueue', async () => {
    const commands = await createProactiveAutonomyCommands({
      basePrompt: '<tick>12:00:00</tick>',
      rootDir: tempDir,
      currentDir: tempDir,
    })
    expect(commands).toHaveLength(1)

    const queuedRun = await getAutonomyRunById(
      commands[0]!.autonomy!.runId,
      tempDir,
    )
    expect(queuedRun!.status).toBe('queued')

    await cancelQueuedAutonomyCommands({ commands, rootDir: tempDir })

    const cancelledRun = await getAutonomyRunById(
      commands[0]!.autonomy!.runId,
      tempDir,
    )
    expect(cancelledRun!.status).toBe('cancelled')
  })

  test('uses command rootDir when claiming after project context changes', async () => {
    const otherProjectDir = await createTempDir('autonomy-other-project-')
    extraTempDirs.push(otherProjectDir)
    const command = await createAutonomyQueuedPrompt({
      basePrompt: 'scheduled prompt',
      trigger: 'scheduled-task',
      rootDir: tempDir,
      currentDir: tempDir,
    })
    expect(command).not.toBeNull()
    expect(command!.autonomy?.rootDir).toBe(tempDir)

    const claim = await claimConsumableQueuedAutonomyCommands(
      [command!],
      otherProjectDir,
    )

    const originalRun = await getAutonomyRunById(
      command!.autonomy!.runId,
      tempDir,
    )
    const wrongProjectRun = await getAutonomyRunById(
      command!.autonomy!.runId,
      otherProjectDir,
    )

    expect(claim.claimedRunIds).toEqual([command!.autonomy!.runId])
    expect(claim.attachmentCommands).toHaveLength(1)
    expect(originalRun!.status).toBe('running')
    expect(wrongProjectRun).toBeNull()
  })

  test('advances a managed flow consumed as a queued attachment', async () => {
    const command = await startManagedAutonomyFlowFromHeartbeatTask({
      task: {
        name: 'weekly-report',
        interval: '7d',
        prompt: 'Ship the weekly report',
        steps: [
          { name: 'gather', prompt: 'Gather weekly inputs' },
          { name: 'draft', prompt: 'Draft weekly report' },
        ],
      },
      rootDir: tempDir,
      currentDir: tempDir,
    })
    expect(command).not.toBeNull()

    const claim = await claimConsumableQueuedAutonomyCommands(
      [command!],
      tempDir,
    )
    const runningRunIds = claim.claimedRunIds
    expect(runningRunIds).toEqual([command!.autonomy!.runId])

    const nextCommands = await finalizeAutonomyCommandsForTurn({
      commands: claim.claimedCommands,
      outcome: { type: 'completed' },
      currentDir: tempDir,
      priority: 'later',
    })
    const [flow] = await listAutonomyFlows(tempDir)
    const detail = await getAutonomyFlowById(flow!.flowId, tempDir)
    const run = await getAutonomyRunById(command!.autonomy!.runId, tempDir)

    expect(run!.status).toBe('completed')
    expect(nextCommands).toHaveLength(1)
    expect(nextCommands[0]!.autonomy?.flowId).toBe(flow!.flowId)
    expect(detail!.stateJson!.steps.map(step => step.status)).toEqual([
      'completed',
      'queued',
    ])
  })

  test('keeps managed autonomy flow coherent across queued attachment turns', async () => {
    const firstCommand = await startManagedAutonomyFlowFromHeartbeatTask({
      task: {
        name: 'weekly-report',
        interval: '7d',
        prompt: 'Ship the weekly report',
        steps: [
          { name: 'gather', prompt: 'Gather weekly inputs' },
          { name: 'draft', prompt: 'Draft weekly report' },
        ],
      },
      rootDir: tempDir,
      currentDir: tempDir,
    })
    expect(firstCommand).not.toBeNull()
    enqueue(firstCommand!)

    const firstTurn = await consumeQueuedAutonomyAttachmentTurn()
    const queuedAfterFirstTurn = getCommandsByMaxPriority('later')
    const [flowAfterFirstTurn] = await listAutonomyFlows(tempDir)
    const firstRun = await getAutonomyRunById(
      firstCommand!.autonomy!.runId,
      tempDir,
    )

    expect(firstTurn.attachments).toHaveLength(1)
    expect(firstTurn.attachments[0]!.attachment?.type).toBe('queued_command')
    expect(firstTurn.runningRunIds).toEqual([firstCommand!.autonomy!.runId])
    expect(firstTurn.nextCommands).toHaveLength(1)
    expect(queuedAfterFirstTurn).toHaveLength(1)
    expect(queuedAfterFirstTurn[0]!.autonomy?.flowId).toBe(
      flowAfterFirstTurn!.flowId,
    )
    expect(firstRun!.status).toBe('completed')
    expect(
      flowAfterFirstTurn!.stateJson!.steps.map(step => step.status),
    ).toEqual(['completed', 'queued'])

    const secondCommand = queuedAfterFirstTurn[0]!
    const secondTurn = await consumeQueuedAutonomyAttachmentTurn()
    const queuedAfterSecondTurn = getCommandsByMaxPriority('later')
    const finalFlow = await getAutonomyFlowById(
      flowAfterFirstTurn!.flowId,
      tempDir,
    )
    const secondRun = await getAutonomyRunById(
      secondCommand.autonomy!.runId,
      tempDir,
    )

    expect(secondTurn.attachments).toHaveLength(1)
    expect(secondTurn.runningRunIds).toEqual([secondCommand.autonomy!.runId])
    expect(secondTurn.nextCommands).toHaveLength(0)
    expect(queuedAfterSecondTurn).toHaveLength(0)
    expect(secondRun!.status).toBe('completed')
    expect(finalFlow!.status).toBe('succeeded')
    expect(finalFlow!.stateJson!.steps.map(step => step.status)).toEqual([
      'completed',
      'completed',
    ])
  })
})
