import { beforeEach, describe, expect, test } from "bun:test";

import {
  applyTaskStateEvent,
  getTaskState,
  processAssistantEvent,
  resetTaskState,
} from "./task-panel.js";

describe("task panel state", () => {
  beforeEach(() => {
    resetTaskState();
  });

  test("falls back to assistant tool_use parsing before an authoritative snapshot arrives", () => {
    processAssistantEvent({
      message: {
        content: [
          {
            type: "tool_use",
            name: "TaskUpdate",
            input: { taskId: "1", subject: "Plan fix", status: "in_progress" },
          },
        ],
      },
    });

    expect(getTaskState()).toEqual({
      tasks: [
        {
          id: "1",
          subject: "Plan fix",
          description: "",
          activeForm: undefined,
          status: "in_progress",
          owner: undefined,
          blocks: [],
          blockedBy: [],
        },
      ],
      todos: [],
      hasAuthoritativeTasks: false,
    });
  });

  test("authoritative task_state snapshots replace tasks and stop transcript-derived task mutations", () => {
    applyTaskStateEvent({
      task_list_id: "team-alpha",
      tasks: [
        {
          id: "7",
          subject: "Real task",
          description: "Pulled from task list",
          status: "pending",
          blocks: [],
          blockedBy: [],
        },
      ],
    });

    processAssistantEvent({
      message: {
        content: [
          {
            type: "tool_use",
            name: "TaskUpdate",
            input: { taskId: "99", subject: "Synthetic task", status: "completed" },
          },
          {
            type: "tool_use",
            name: "TodoWrite",
            input: {
              todos: [{ content: "Keep todo parsing", status: "pending", activeForm: "Keeping todo parsing" }],
            },
          },
        ],
      },
    });

    expect(getTaskState()).toEqual({
      tasks: [
        {
          id: "7",
          subject: "Real task",
          description: "Pulled from task list",
          activeForm: undefined,
          status: "pending",
          owner: undefined,
          blocks: [],
          blockedBy: [],
        },
      ],
      todos: [
        {
          content: "Keep todo parsing",
          status: "pending",
          activeForm: "Keeping todo parsing",
        },
      ],
      hasAuthoritativeTasks: true,
    });
  });
});
