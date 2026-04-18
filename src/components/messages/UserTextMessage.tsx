import { feature } from 'bun:bundle';
import type { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs';
import * as React from 'react';
import { NO_CONTENT_MESSAGE } from '../../constants/messages.js';
import {
  COMMAND_MESSAGE_TAG,
  LOCAL_COMMAND_CAVEAT_TAG,
  TASK_NOTIFICATION_TAG,
  TEAMMATE_MESSAGE_TAG,
  TICK_TAG,
} from '../../constants/xml.js';
import { isAgentSwarmsEnabled } from '../../utils/agentSwarmsEnabled.js';
import { extractTag, INTERRUPT_MESSAGE, INTERRUPT_MESSAGE_FOR_TOOL_USE } from '../../utils/messages.js';
import { InterruptedByUser } from '../InterruptedByUser.js';
import { MessageResponse } from '../MessageResponse.js';
import { UserAgentNotificationMessage } from './UserAgentNotificationMessage.js';
import { UserBashInputMessage } from './UserBashInputMessage.js';
import { UserBashOutputMessage } from './UserBashOutputMessage.js';
import { UserCommandMessage } from './UserCommandMessage.js';
import { UserLocalCommandOutputMessage } from './UserLocalCommandOutputMessage.js';
import { UserMemoryInputMessage } from './UserMemoryInputMessage.js';
import { UserPlanMessage } from './UserPlanMessage.js';
import { UserPromptMessage } from './UserPromptMessage.js';
import { UserResourceUpdateMessage } from './UserResourceUpdateMessage.js';
import { UserTeammateMessage } from './UserTeammateMessage.js';

type Props = {
  addMargin: boolean;
  param: TextBlockParam;
  verbose: boolean;
  planContent?: string;
  isTranscriptMode?: boolean;
  timestamp?: string;
};

export function UserTextMessage({
  addMargin,
  param,
  verbose,
  planContent,
  isTranscriptMode,
  timestamp,
}: Props): React.ReactNode {
  if (param.text.trim() === NO_CONTENT_MESSAGE) {
    return null;
  }

  // Plan to implement message (cleared context flow)
  if (planContent) {
    return <UserPlanMessage addMargin={addMargin} planContent={planContent} />;
  }

  if (extractTag(param.text, TICK_TAG)) {
    return null;
  }

  // Hide synthetic caveat messages (should be filtered by isMeta, this is defensive)
  if (param.text.includes(`<${LOCAL_COMMAND_CAVEAT_TAG}>`)) {
    return null;
  }

  // Show bash output
  if (param.text.startsWith('<bash-stdout') || param.text.startsWith('<bash-stderr')) {
    return <UserBashOutputMessage content={param.text} verbose={verbose} />;
  }

  // Show command output
  if (param.text.startsWith('<local-command-stdout') || param.text.startsWith('<local-command-stderr')) {
    return <UserLocalCommandOutputMessage content={param.text} />;
  }

  // Handle interruption messages specially
  if (param.text === INTERRUPT_MESSAGE || param.text === INTERRUPT_MESSAGE_FOR_TOOL_USE) {
    return (
      <MessageResponse height={1}>
        <InterruptedByUser />
      </MessageResponse>
    );
  }

  // GitHub webhook events (check_run, review comments, pushes) delivered via
  // bound-session routing after /subscribe-pr. The tag constant is stripped
  // from external builds — inline the literal so the import doesn't fail.
  // The require() below DCEs when both flags are off. startsWith (not
  // includes) and before the includes-checks below: defense-in-depth if
  // the sanitizer were ever weakened.
  if (feature('KAIROS_GITHUB_WEBHOOKS')) {
    if (param.text.startsWith('<github-webhook-activity>')) {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const { UserGitHubWebhookMessage } =
        require('./UserGitHubWebhookMessage.js') as typeof import('./UserGitHubWebhookMessage.js');
      /* eslint-enable @typescript-eslint/no-require-imports */
      return <UserGitHubWebhookMessage addMargin={addMargin} param={param} />;
    }
  }

  // Bash inputs!
  if (param.text.includes('<bash-input>')) {
    return <UserBashInputMessage addMargin={addMargin} param={param} />;
  }

  // Slash commands/
  if (param.text.includes(`<${COMMAND_MESSAGE_TAG}>`)) {
    return <UserCommandMessage addMargin={addMargin} param={param} />;
  }

  if (param.text.includes('<user-memory-input>')) {
    return <UserMemoryInputMessage addMargin={addMargin} text={param.text} />;
  }

  // Teammate messages - only check when swarms enabled
  if (isAgentSwarmsEnabled() && param.text.includes(`<${TEAMMATE_MESSAGE_TAG}`)) {
    return <UserTeammateMessage addMargin={addMargin} param={param} isTranscriptMode={isTranscriptMode} />;
  }

  // Task notifications (agent completions, bash completions, etc.)
  if (param.text.includes(`<${TASK_NOTIFICATION_TAG}`)) {
    return <UserAgentNotificationMessage addMargin={addMargin} param={param} />;
  }

  // MCP resource and polling update notifications
  if (param.text.includes('<mcp-resource-update') || param.text.includes('<mcp-polling-update')) {
    return <UserResourceUpdateMessage addMargin={addMargin} param={param} />;
  }

  // Fork child's first message: collapse the rules/format boilerplate, show
  // only the directive. FORK_BOILERPLATE_TAG is inlined so the import doesn't
  // ship in external builds where feature('FORK_SUBAGENT') is false.
  if (feature('FORK_SUBAGENT')) {
    if (param.text.includes('<fork-boilerplate>')) {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const { UserForkBoilerplateMessage } =
        require('./UserForkBoilerplateMessage.js') as typeof import('./UserForkBoilerplateMessage.js');
      /* eslint-enable @typescript-eslint/no-require-imports */
      return <UserForkBoilerplateMessage addMargin={addMargin} param={param} />;
    }
  }

  // Cross-session UDS message (from another Claude session's SendMessage).
  // CROSS_SESSION_MESSAGE_TAG is inlined so the import doesn't ship in
  // external builds where feature('UDS_INBOX') is false.
  if (feature('UDS_INBOX')) {
    if (param.text.includes('<cross-session-message')) {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const { UserCrossSessionMessage } =
        require('./UserCrossSessionMessage.js') as typeof import('./UserCrossSessionMessage.js');
      /* eslint-enable @typescript-eslint/no-require-imports */
      return <UserCrossSessionMessage addMargin={addMargin} param={param} />;
    }
  }

  // Inbound channel message (MCP server push).
  if (feature('KAIROS') || feature('KAIROS_CHANNELS')) {
    if (param.text.includes('<channel source="')) {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const { UserChannelMessage } = require('./UserChannelMessage.js') as typeof import('./UserChannelMessage.js');
      /* eslint-enable @typescript-eslint/no-require-imports */
      return <UserChannelMessage addMargin={addMargin} param={param} />;
    }
  }

  // User prompts>
  return (
    <UserPromptMessage addMargin={addMargin} param={param} isTranscriptMode={isTranscriptMode} timestamp={timestamp} />
  );
}
