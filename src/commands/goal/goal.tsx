/**
 * `/goal` slash command — set, view, or control the persistent thread
 * goal that drives auto-continuation across turns.
 *
 * Subcommands
 * -----------
 * `/goal`              -> show current status
 * `/goal status`       -> alias of bare `/goal`
 * `/goal clear`        -> remove the active goal (persists tombstone)
 * `/goal pause`        -> pause auto-continuation
 * `/goal resume`       -> resume from paused/blocked/limited
 * `/goal complete`     -> mark complete (manual override; tools usually do this)
 * `/goal <objective>`  -> set a new goal; if one is already active and not
 *                         complete, a confirmation dialog appears first.
 */
import * as React from 'react';

import type { LocalJSXCommandContext } from 'src/commands.js';
import type { LocalJSXCommandOnDone } from 'src/types/command.js';
import {
  clearGoal,
  completeGoal,
  formatGoalElapsed,
  formatGoalStatusLabel,
  getGoal,
  pauseGoal,
  resumeGoal,
  setGoal,
} from 'src/services/goal/goalState.js';
import { persistCurrentGoal, persistGoalClear } from 'src/services/goal/goalStorage.js';
import { GoalReplaceConfirmDialog } from './GoalReplaceConfirmDialog.js';

const MAX_OBJECTIVE_CHARS = 4000;

function formatGoalStatus(): string {
  const goal = getGoal();
  if (!goal) {
    return 'No active goal. Set one with `/goal <objective>`.';
  }
  const tokens = goal.tokenBudget !== null ? `${goal.tokensUsed} / ${goal.tokenBudget}` : `${goal.tokensUsed}`;
  return [
    `Goal: ${goal.objective}`,
    `Status: ${formatGoalStatusLabel(goal.status)}`,
    `Time: ${formatGoalElapsed(goal)}`,
    `Tokens: ${tokens}`,
    `Continuation turns: ${goal.turnsExecuted}`,
  ].join('\n');
}

function applySetGoal(objective: string): string {
  setGoal(objective);
  persistCurrentGoal();
  return `Goal set: ${objective}\n\n${formatGoalStatus()}`;
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> {
  const trimmed = args.trim();

  if (!trimmed || trimmed.toLowerCase() === 'status') {
    onDone(formatGoalStatus(), { display: 'system' });
    return null;
  }

  const lower = trimmed.toLowerCase();

  if (lower === 'clear') {
    const cleared = clearGoal();
    if (cleared) persistGoalClear();
    onDone(cleared ? 'Goal cleared.' : 'No active goal to clear.', {
      display: 'system',
    });
    return null;
  }

  if (lower === 'pause') {
    const g = pauseGoal();
    if (g) persistCurrentGoal();
    onDone(g ? 'Goal paused.' : 'No active goal to pause.', {
      display: 'system',
    });
    return null;
  }

  if (lower === 'resume') {
    const g = resumeGoal();
    if (g) persistCurrentGoal();
    onDone(g ? 'Goal resumed.' : 'No paused goal to resume.', {
      display: 'system',
    });
    return null;
  }

  if (lower === 'complete') {
    const g = completeGoal();
    if (g) persistCurrentGoal();
    onDone(g ? 'Goal marked complete.' : 'No active goal to complete.', {
      display: 'system',
    });
    return null;
  }

  if (trimmed.length > MAX_OBJECTIVE_CHARS) {
    onDone(
      `Goal objective is too long (${trimmed.length} chars; limit ${MAX_OBJECTIVE_CHARS}). Save the detailed instructions to a file and reference it from a shorter objective.`,
      { display: 'system' },
    );
    return null;
  }

  const existing = getGoal();
  const needsConfirmation = existing && existing.status !== 'complete';

  if (!needsConfirmation) {
    const summary = applySetGoal(trimmed);
    onDone(summary, {
      display: 'system',
      metaMessages: [`<goal-objective-updated>\n${trimmed}\n</goal-objective-updated>`],
    });
    return null;
  }

  return (
    <GoalReplaceConfirmDialog
      currentGoal={existing}
      newObjective={trimmed}
      onConfirm={() => {
        const summary = applySetGoal(trimmed);
        onDone(summary, {
          display: 'system',
          metaMessages: [`<goal-objective-updated>\n${trimmed}\n</goal-objective-updated>`],
        });
      }}
      onCancel={() => {
        onDone('Kept the current goal. New objective discarded.', {
          display: 'system',
        });
      }}
    />
  );
}
