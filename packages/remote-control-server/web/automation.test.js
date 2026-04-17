import { describe, expect, test } from "bun:test";

import {
  PROACTIVE_DISABLED_TEXT,
  PROACTIVE_ENABLED_TEXT,
  createAutomationState,
  getAutomationActivity,
  getAutomationIndicator,
  isAutomationEnvelopeText,
  reduceAutomationState,
  shouldHideAutomationUserEvent,
  shouldStartAutomationWorkFromUserEvent,
} from "./automation.js";

describe("automation helpers", () => {
  test("keeps real user text visible", () => {
    expect(shouldHideAutomationUserEvent({ content: "hello from a human" }, "inbound")).toBe(false);
  });

  test("hides internal xml wrappers without synthetic metadata", () => {
    expect(isAutomationEnvelopeText("<tick>2:56:47 PM</tick>")).toBe(true);
    expect(isAutomationEnvelopeText("<system-reminder>\nDo useful work.\n</system-reminder>")).toBe(true);
    expect(
      isAutomationEnvelopeText(
        "<task-notification><summary>Finished</summary><output-file>/tmp/out.log</output-file></task-notification>",
      ),
    ).toBe(true);
    expect(
      shouldHideAutomationUserEvent(
        { content: "<local-command-caveat>Generated while running local commands.</local-command-caveat>" },
        "inbound",
      ),
    ).toBe(true);
  });

  test("does not treat slash-command scaffolding as active work", () => {
    expect(
      shouldStartAutomationWorkFromUserEvent(
        { content: "<local-command-caveat>Generated while running local commands.</local-command-caveat>" },
        "inbound",
      ),
    ).toBe(false);
    expect(
      shouldStartAutomationWorkFromUserEvent(
        {
          content:
            "<system-reminder>\nProactive mode is now enabled. You will receive periodic <tick> prompts.\n</system-reminder>",
          isSynthetic: true,
        },
        "inbound",
      ),
    ).toBe(false);
  });

  test("keeps true automatic triggers eligible for loading state", () => {
    expect(
      shouldStartAutomationWorkFromUserEvent(
        { content: "<tick>2:56:47 PM</tick>", isSynthetic: true },
        "inbound",
      ),
    ).toBe(true);
    expect(
      shouldStartAutomationWorkFromUserEvent(
        { content: "scheduled job: refresh analytics cache", isSynthetic: true },
        "inbound",
      ),
    ).toBe(true);
  });

  test("hides synthetic automatic prompts even when they are plain text", () => {
    expect(
      shouldHideAutomationUserEvent(
        { content: "scheduled job: refresh analytics cache", isSynthetic: true },
        "inbound",
      ),
    ).toBe(true);
  });

  test("keeps mixed human text with tags visible", () => {
    expect(
      shouldHideAutomationUserEvent(
        { content: "Please keep this: <system-reminder>not metadata</system-reminder>" },
        "inbound",
      ),
    ).toBe(false);
  });

  test("shows autopilot while proactive mode remains active", () => {
    let state = createAutomationState();

    state = reduceAutomationState(state, {
      type: "assistant",
      payload: { content: PROACTIVE_ENABLED_TEXT },
    });
    expect(getAutomationIndicator(state)).toEqual({
      visible: true,
      label: "Autopilot",
      tone: "proactive",
      title: "Claude Code is in proactive mode and may continue working between user messages.",
      iconVariant: "active",
    });

    state = reduceAutomationState(state, {
      type: "user",
      direction: "inbound",
      payload: { content: "<tick>3:15:00 PM</tick>" },
    });
    expect(getAutomationIndicator(state).label).toBe("Autopilot");

    state = reduceAutomationState(state, {
      type: "assistant",
      payload: { content: "Working on background maintenance." },
    });
    expect(getAutomationIndicator(state).label).toBe("Autopilot");

    state = reduceAutomationState(state, {
      type: "assistant",
      payload: { content: PROACTIVE_DISABLED_TEXT },
    });
    expect(getAutomationIndicator(state).visible).toBe(false);
  });

  test("shows auto run until an automatic trigger settles", () => {
    let state = createAutomationState();

    state = reduceAutomationState(state, {
      type: "user",
      direction: "inbound",
      payload: { content: "scheduled job: refresh analytics cache", isSynthetic: true },
    });
    expect(getAutomationIndicator(state).label).toBe("Auto Run");
    expect(getAutomationIndicator(state).iconVariant).toBe("active");

    state = reduceAutomationState(state, {
      type: "assistant",
      payload: { content: "Completed scheduled refresh." },
    });
    expect(getAutomationIndicator(state).visible).toBe(false);
  });

  test("authoritative automation_state drives standby and sleeping states", () => {
    let state = createAutomationState();

    state = reduceAutomationState(state, {
      type: "automation_state",
      payload: {
        enabled: true,
        phase: "standby",
        next_tick_at: 123456,
        sleep_until: null,
      },
    });
    expect(getAutomationIndicator(state)).toEqual({
      visible: true,
      label: "Autopilot",
      tone: "proactive",
      title: "Claude Code is in proactive mode and waiting for the next scheduled check-in.",
      iconVariant: "standby",
    });
    expect(getAutomationActivity(state)).toEqual({
      mode: "standby",
      label: "standby",
      endsAt: 123456,
      iconVariant: "standby",
    });

    state = reduceAutomationState(state, {
      type: "automation_state",
      payload: {
        enabled: true,
        phase: "sleeping",
        next_tick_at: null,
        sleep_until: 999999,
      },
    });
    expect(getAutomationIndicator(state).tone).toBe("sleeping");
    expect(getAutomationIndicator(state).iconVariant).toBe("sleeping");
    expect(getAutomationActivity(state)).toEqual({
      mode: "sleeping",
      label: "sleeping",
      endsAt: 999999,
      iconVariant: "sleeping",
    });
  });

  test("authoritative disabled snapshot suppresses heuristic auto-run fallback", () => {
    let state = createAutomationState();

    state = reduceAutomationState(state, {
      type: "automation_state",
      payload: {
        enabled: false,
        phase: null,
        next_tick_at: null,
        sleep_until: null,
      },
    });
    state = reduceAutomationState(state, {
      type: "user",
      direction: "inbound",
      payload: { content: "<tick>3:15:00 PM</tick>" },
    });

    expect(getAutomationIndicator(state).visible).toBe(false);
    expect(getAutomationActivity(state)).toBeNull();
  });
});
