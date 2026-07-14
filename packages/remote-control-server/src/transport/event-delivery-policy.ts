export const OUTBOUND_EVENT_DELIVERY_POLICY = {
  user: 'durable',
  control_request: 'durable',
  control_response: 'durable',
  permission_response: 'durable',
  terminal_input: 'live',
  terminal_resize: 'live',
  terminal_sync: 'live',
  terminal_open: 'live',
  terminal_close: 'live',
  interrupt: 'live',
} as const

export type OutboundEventType = keyof typeof OUTBOUND_EVENT_DELIVERY_POLICY
export type EventDeliveryPolicy =
  (typeof OUTBOUND_EVENT_DELIVERY_POLICY)[OutboundEventType]

export const DURABLE_OUTBOUND_EVENT_TYPES = [
  'user',
  'control_request',
  'control_response',
  'permission_response',
] as const

export const DURABLE_MESSAGE_EVENT_TYPES = new Set<string>(['user'])
export const DURABLE_CONTROL_EVENT_TYPES = new Set<string>(
  DURABLE_OUTBOUND_EVENT_TYPES.filter(type => type !== 'user'),
)
export const LIVE_WORKER_COMMAND_TYPES = new Set<string>([
  'terminal_input',
  'terminal_resize',
  'terminal_sync',
  'terminal_open',
  'terminal_close',
  'interrupt',
])

export function getOutboundEventDeliveryPolicy(
  type: string,
): EventDeliveryPolicy | undefined {
  return OUTBOUND_EVENT_DELIVERY_POLICY[type as OutboundEventType]
}
