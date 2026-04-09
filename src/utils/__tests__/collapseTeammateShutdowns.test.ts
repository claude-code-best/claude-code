import { describe, expect, test } from "bun:test";
import { collapseTeammateShutdowns } from "../collapseTeammateShutdowns";

function makeShutdownMsg(uuid = "1"): any {
  return {
    type: "attachment",
    uuid,
    timestamp: Date.now(),
    attachment: {
      type: "task_status",
      taskType: "in_process_teammate",
      status: "completed",
    },
  };
}

function makeNonShutdownMsg(): any {
  return { type: "user", message: { content: "hello" } };
}

describe("collapseTeammateShutdowns", () => {
  test("returns same messages when no teammate shutdowns", () => {
    const msgs = [makeNonShutdownMsg(), makeNonShutdownMsg()];
    expect(collapseTeammateShutdowns(msgs)).toEqual(msgs);
  });

  test("leaves single shutdown message unchanged", () => {
    const msgs = [makeShutdownMsg()];
    const result = collapseTeammateShutdowns(msgs);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(msgs[0]);
  });

  test("collapses consecutive shutdown messages into batch", () => {
    const msgs = [makeShutdownMsg("1"), makeShutdownMsg("2")];
    const result = collapseTeammateShutdowns(msgs);
    expect(result).toHaveLength(1);
    expect((result[0] as any).attachment.type).toBe("teammate_shutdown_batch");
  });

  test("batch attachment has correct count", () => {
    const msgs = [makeShutdownMsg("1"), makeShutdownMsg("2"), makeShutdownMsg("3")];
    const result = collapseTeammateShutdowns(msgs);
    expect((result[0] as any).attachment.count).toBe(3);
  });

  test("does not collapse non-consecutive shutdowns", () => {
    const msgs = [makeShutdownMsg("1"), makeNonShutdownMsg(), makeShutdownMsg("2")];
    const result = collapseTeammateShutdowns(msgs);
    expect(result).toHaveLength(3);
    expect((result[0] as any).attachment.type).toBe("task_status");
    expect((result[2] as any).attachment.type).toBe("task_status");
  });

  test("preserves non-shutdown messages between shutdowns", () => {
    const msgs = [makeShutdownMsg("1"), makeNonShutdownMsg(), makeShutdownMsg("2")];
    const result = collapseTeammateShutdowns(msgs);
    expect(result[1]).toEqual(makeNonShutdownMsg());
  });

  test("handles empty array", () => {
    expect(collapseTeammateShutdowns([])).toEqual([]);
  });

  test("handles mixed message types", () => {
    const msgs = [makeNonShutdownMsg(), makeShutdownMsg("1"), makeShutdownMsg("2"), makeNonShutdownMsg()];
    const result = collapseTeammateShutdowns(msgs);
    expect(result).toHaveLength(3);
    expect((result[1] as any).attachment.type).toBe("teammate_shutdown_batch");
  });

  test("collapses more than 2 consecutive shutdowns", () => {
    const msgs = Array.from({ length: 5 }, (_, i) => makeShutdownMsg(String(i)));
    const result = collapseTeammateShutdowns(msgs);
    expect(result).toHaveLength(1);
    expect((result[0] as any).attachment.count).toBe(5);
  });

  test("non-teammate task_status messages are not collapsed", () => {
    const nonTeammate: any = {
      type: "attachment",
      uuid: "x",
      timestamp: Date.now(),
      attachment: {
        type: "task_status",
        taskType: "subagent",
        status: "completed",
      },
    };
    const msgs = [nonTeammate, { ...nonTeammate, uuid: "y" }];
    const result = collapseTeammateShutdowns(msgs);
    expect(result).toHaveLength(2);
  });
});
