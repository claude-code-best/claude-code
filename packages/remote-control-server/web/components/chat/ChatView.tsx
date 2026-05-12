import type { ThreadEntry, ToolCallEntry, PlanDisplayEntry } from '../../src/lib/types';
import { cn } from '../../src/lib/utils';
import { UserBubble, AssistantBubble } from './MessageBubble';
import { ToolCallGroup } from './ToolCallGroup';
import { PlanDisplay } from './PlanView';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButtons,
} from '../ai-elements/conversation';

// =============================================================================
// 统一聊天视图 — Anthropic 编辑式排版
// 无气泡间距，用垂直 rhythm 区分消息块
// =============================================================================

interface ChatViewProps {
  entries: ThreadEntry[];
  isLoading?: boolean;
  onPermissionRespond?: (requestId: string, optionId: string | null, optionKind: string | null) => void;
  emptyTitle?: string;
  emptyDescription?: string;
}

export function ChatView({
  entries,
  isLoading = false,
  onPermissionRespond,
  emptyTitle = '开始对话',
  emptyDescription = '输入消息开始聊天',
}: ChatViewProps) {
  // 将相邻的 ToolCallEntry 合并为一组
  const grouped = groupToolCalls(entries);
  const hasMessages = entries.length > 0;

  // 检查是否正在加载（最后一个条目是用户消息）
  const showThinking = isLoading && entries.length > 0 && entries[entries.length - 1]?.type === 'user_message';

  return (
    <Conversation className="flex-1">
      <ConversationContent>
        {!hasMessages ? (
          <ConversationEmptyState title={emptyTitle} description={emptyDescription} />
        ) : (
          <>
            {grouped.map((item, i) => {
              if (item.type === 'single') {
                return (
                  <div key={`entry-${i}`} className={cn(entrySpacing(entries, i))}>
                    <EntryRenderer entry={item.entry} isLoading={isLoading} onPermissionRespond={onPermissionRespond} />
                  </div>
                );
              }
              // 工具调用组 — 紧贴在助手消息下方
              return (
                <div key={`group-${i}`} className="-mt-2">
                  <ToolCallGroup entries={item.entries} onPermissionRespond={onPermissionRespond} />
                </div>
              );
            })}

            {/* 思考指示器 — Anthropic 打字动画 */}
            {showThinking && (
              <div className="flex gap-4 items-start">
                <div className="w-8 h-8 rounded-lg bg-brand/8 flex items-center justify-center flex-shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z"
                      fill="var(--color-brand)"
                      fillRule="nonzero"
                    />
                  </svg>
                </div>
                <div className="flex items-center gap-1 pt-2">
                  <span className="chat-typing-indicator" aria-hidden="true">
                    <span></span>
                    <span></span>
                    <span></span>
                  </span>
                </div>
              </div>
            )}
          </>
        )}
        <ConversationScrollButtons hasUserMessages={entries.some(e => e.type === 'user_message')} />
      </ConversationContent>
    </Conversation>
  );
}

// =============================================================================
// 间距逻辑 — 用户消息前后间距大，工具调用紧贴
// =============================================================================

function entrySpacing(entries: ThreadEntry[], index: number): string {
  const entry = entries[index];
  // 用户消息前后大留白 — Claude.ai 式宽松间距
  if (entry?.type === 'user_message') {
    return 'pt-10 pb-3';
  }
  // 助手消息 — 工具调用紧贴，否则多留白
  if (entry?.type === 'assistant_message') {
    const next = entries[index + 1];
    if (next?.type === 'tool_call') {
      return 'pt-3 pb-1';
    }
    return 'pt-3 pb-8';
  }
  // Plan 条目
  if (entry?.type === 'plan') {
    return 'pt-3 pb-3';
  }
  return 'py-2';
}

// =============================================================================
// 单条目渲染器
// =============================================================================

function EntryRenderer({
  entry,
  isLoading,
  onPermissionRespond,
}: {
  entry: ThreadEntry;
  isLoading: boolean;
  onPermissionRespond?: (requestId: string, optionId: string | null, optionKind: string | null) => void;
}) {
  switch (entry.type) {
    case 'user_message':
      return <UserBubble entry={entry} />;
    case 'assistant_message':
      return <AssistantBubble entry={entry} isStreaming={isLoading} />;
    case 'tool_call':
      return <ToolCallGroup entries={[entry as ToolCallEntry]} onPermissionRespond={onPermissionRespond} />;
    case 'plan':
      return <PlanDisplay entry={entry as PlanDisplayEntry} />;
    default:
      return null;
  }
}

// =============================================================================
// 工具调用分组逻辑
// =============================================================================

type GroupedItem = { type: 'single'; entry: ThreadEntry } | { type: 'tool_group'; entries: ToolCallEntry[] };

function groupToolCalls(entries: ThreadEntry[]): GroupedItem[] {
  const result: GroupedItem[] = [];
  let currentToolGroup: ToolCallEntry[] = [];

  const flushToolGroup = () => {
    if (currentToolGroup.length === 1) {
      result.push({ type: 'single', entry: currentToolGroup[0] });
    } else if (currentToolGroup.length > 1) {
      result.push({ type: 'tool_group', entries: currentToolGroup });
    }
    currentToolGroup = [];
  };

  for (const entry of entries) {
    if (entry.type === 'tool_call') {
      currentToolGroup.push(entry);
    } else {
      flushToolGroup();
      result.push({ type: 'single', entry });
    }
  }
  flushToolGroup();

  return result;
}
