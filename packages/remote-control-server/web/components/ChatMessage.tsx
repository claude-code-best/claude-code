import { cn } from '../src/lib/utils';
import { User, Bot, Wrench, Loader2 } from 'lucide-react';

export interface ToolCall {
  id: string;
  title: string;
  status: 'running' | 'complete' | 'error';
}

export interface ChatMessageData {
  id: string;
  role: 'user' | 'agent';
  content: string;
  toolCalls?: ToolCall[];
  isStreaming?: boolean;
}

interface ChatMessageProps {
  message: ChatMessageData;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-3 p-4 rounded-lg', isUser ? 'bg-muted/50' : 'bg-background')}>
      <div
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-secondary',
        )}
      >
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="text-sm font-medium">{isUser ? 'You' : 'Agent'}</div>
        <div className="text-sm whitespace-pre-wrap break-words">
          {message.content}
          {message.isStreaming && <span className="inline-block w-1.5 h-4 ml-0.5 bg-foreground animate-pulse" />}
        </div>
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="space-y-1.5 pt-2">
            {message.toolCalls.map(tool => (
              <ToolCallDisplay key={tool.id} toolCall={tool} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface ToolCallDisplayProps {
  toolCall: ToolCall;
}

function ToolCallDisplay({ toolCall }: ToolCallDisplayProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 text-xs px-2 py-1.5 rounded border',
        toolCall.status === 'running' && 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
        toolCall.status === 'complete' && 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
        toolCall.status === 'error' && 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
      )}
    >
      {toolCall.status === 'running' ? (
        <Loader2 className="w-3 h-3 animate-spin text-yellow-600 dark:text-yellow-400" />
      ) : (
        <Wrench
          className={cn(
            'w-3 h-3',
            toolCall.status === 'complete' && 'text-green-600 dark:text-green-400',
            toolCall.status === 'error' && 'text-red-600 dark:text-red-400',
          )}
        />
      )}
      <span className="truncate">{toolCall.title}</span>
      <span
        className={cn(
          'ml-auto text-[10px] uppercase font-medium',
          toolCall.status === 'running' && 'text-yellow-600 dark:text-yellow-400',
          toolCall.status === 'complete' && 'text-green-600 dark:text-green-400',
          toolCall.status === 'error' && 'text-red-600 dark:text-red-400',
        )}
      >
        {toolCall.status}
      </span>
    </div>
  );
}
