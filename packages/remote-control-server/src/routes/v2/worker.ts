import { Hono } from "hono";
import { getSession, incrementEpoch, touchSession, updateSessionStatus } from "../../services/session";
import {
  automationStatesEqual,
  getAutomationStateEventPayload,
} from "../../services/automationState";
import { apiKeyAuth, acceptCliHeaders, sessionIngressAuth } from "../../auth/middleware";
import { getEventBus } from "../../transport/event-bus";
import { storeGetSessionWorker, storeUpsertSessionWorker } from "../../store";
import { v4 as uuid } from "uuid";

const app = new Hono();

/** GET /v1/code/sessions/:id/worker — Read worker state */
app.get("/:id/worker", acceptCliHeaders, sessionIngressAuth, async (c) => {
  const sessionId = c.req.param("id")!;
  const session = getSession(sessionId);
  if (!session) {
    return c.json({ error: { type: "not_found", message: "Session not found" } }, 404);
  }

  const worker = storeGetSessionWorker(sessionId);
  return c.json({
    worker: {
      worker_status: worker?.workerStatus ?? session.status,
      external_metadata: worker?.externalMetadata ?? null,
      requires_action_details: worker?.requiresActionDetails ?? null,
      last_heartbeat_at: worker?.lastHeartbeatAt?.toISOString() ?? null,
    },
  }, 200);
});

/** PUT /v1/code/sessions/:id/worker — Update worker state */
app.put("/:id/worker", acceptCliHeaders, sessionIngressAuth, async (c) => {
  const sessionId = c.req.param("id")!;
  const session = getSession(sessionId);
  if (!session) {
    return c.json({ error: { type: "not_found", message: "Session not found" } }, 404);
  }

  const body = await c.req.json();
  const prevAutomationState = getAutomationStateEventPayload(
    storeGetSessionWorker(sessionId)?.externalMetadata,
  );
  if (body.worker_status) {
    updateSessionStatus(sessionId, body.worker_status);
  } else {
    touchSession(sessionId);
  }

  const worker = storeUpsertSessionWorker(sessionId, {
    workerStatus: body.worker_status,
    externalMetadata: body.external_metadata,
    requiresActionDetails: body.requires_action_details,
  });
  const nextAutomationState = getAutomationStateEventPayload(worker.externalMetadata);

  if (!automationStatesEqual(prevAutomationState, nextAutomationState)) {
    getEventBus(sessionId).publish({
      id: uuid(),
      sessionId,
      type: "automation_state",
      payload: nextAutomationState,
      direction: "inbound",
    });
  }

  return c.json({
    status: "ok",
    worker: {
      worker_status: worker.workerStatus ?? session.status,
      external_metadata: worker.externalMetadata,
      requires_action_details: worker.requiresActionDetails,
      last_heartbeat_at: worker.lastHeartbeatAt?.toISOString() ?? null,
    },
  }, 200);
});

/** POST /v1/code/sessions/:id/worker/heartbeat — Keep worker alive */
app.post("/:id/worker/heartbeat", acceptCliHeaders, sessionIngressAuth, async (c) => {
  const sessionId = c.req.param("id")!;
  const session = getSession(sessionId);
  if (!session) {
    return c.json({ error: { type: "not_found", message: "Session not found" } }, 404);
  }

  const now = new Date();
  storeUpsertSessionWorker(sessionId, { lastHeartbeatAt: now });
  touchSession(sessionId);
  return c.json({ status: "ok", last_heartbeat_at: now.toISOString() }, 200);
});

/** POST /v1/code/sessions/:id/worker/register — Register worker */
app.post("/:id/worker/register", acceptCliHeaders, apiKeyAuth, async (c) => {
  const sessionId = c.req.param("id")!;
  const session = getSession(sessionId);
  if (!session) {
    return c.json({ error: { type: "not_found", message: "Session not found" } }, 404);
  }

  const epoch = incrementEpoch(sessionId);
  return c.json({ worker_epoch: epoch }, 200);
});

export default app;
