import type { SessionEvent } from "./event-bus";

/**
 * Convert an internal session event into the SDK/control message shape that
 * bridge workers consume on both the legacy WS path and the v2 worker SSE path.
 */
export function toClientPayload(event: SessionEvent): Record<string, unknown> {
  const payload = event.payload as Record<string, unknown> | null;
  const messageUuid =
    typeof payload?.uuid === "string" && payload.uuid ? payload.uuid : event.id;

  if (event.type === "user" || event.type === "user_message") {
    return {
      type: "user",
      uuid: messageUuid,
      session_id: event.sessionId,
      ...(payload?.isSynthetic === true ? { isSynthetic: true } : {}),
      message: {
        role: "user",
        content: payload?.content ?? payload?.message ?? "",
      },
    };
  }

  if (event.type === "permission_response" || event.type === "control_response") {
    const approved = !!payload?.approved;
    const existingResponse = payload?.response as Record<string, unknown> | undefined;
    if (existingResponse) {
      return { type: "control_response", response: existingResponse };
    }

    const updatedInput = payload?.updated_input as Record<string, unknown> | undefined;
    const updatedPermissions = payload?.updated_permissions as Record<string, unknown>[] | undefined;
    const feedbackMessage = payload?.message as string | undefined;

    return {
      type: "control_response",
      response: {
        subtype: approved ? "success" : "error",
        request_id: payload?.request_id ?? "",
        ...(approved
          ? {
              response: {
                behavior: "allow" as const,
                ...(updatedInput ? { updatedInput } : {}),
                ...(updatedPermissions ? { updatedPermissions } : {}),
              },
            }
          : {
              error: "Permission denied by user",
              response: { behavior: "deny" as const },
              ...(feedbackMessage ? { message: feedbackMessage } : {}),
            }),
      },
    };
  }

  if (event.type === "interrupt") {
    return {
      type: "control_request",
      request_id: event.id,
      request: { subtype: "interrupt" },
    };
  }

  if (event.type === "control_request") {
    return {
      type: "control_request",
      request_id: payload?.request_id ?? event.id,
      request: payload?.request ?? payload,
    };
  }

  return {
    type: event.type,
    uuid: messageUuid,
    session_id: event.sessionId,
    message: payload,
  };
}
