import { useState, useRef, useEffect, useCallback } from "react";
import type { UserMessageEntry, AssistantMessageEntry, UserMessageImage } from "../../src/lib/types";
import { cn, esc } from "../../src/lib/utils";
import { MessageResponse } from "../ai-elements/message";
import { Reasoning, ReasoningTrigger, ReasoningContent } from "../ai-elements/reasoning";
import { ChevronDown } from "lucide-react";

// 用户消息折叠最大高度（px）
const COLLAPSED_MAX_HEIGHT = 200;

// =============================================================================
// 用户消息 — 右对齐，品牌色淡底，可折叠
// =============================================================================

interface UserBubbleProps {
  entry: UserMessageEntry;
}

export function UserBubble({ entry }: UserBubbleProps) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const checkOverflow = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    setOverflowing(el.scrollHeight > COLLAPSED_MAX_HEIGHT + 4);
  }, []);

  useEffect(() => {
    checkOverflow();
  }, [checkOverflow, entry.content]);

  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] sm:max-w-[70%]">
        {/* 图片附件 */}
        {entry.images && entry.images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 justify-end">
            {entry.images.map((img, i) => (
              <ImageThumbnail key={i} image={img} />
            ))}
          </div>
        )}
        {/* 文本内容 — 品牌色淡底 + 折叠 */}
        {entry.content && (
          <div className="relative rounded-2xl rounded-br-md bg-user-bubble border border-user-bubble-border overflow-hidden">
            <div
              ref={contentRef}
              className={cn(
                "px-5 py-3 text-sm text-white whitespace-pre-wrap font-display leading-relaxed",
                !expanded && overflowing && `max-h-[${COLLAPSED_MAX_HEIGHT}px]`,
              )}
              style={!expanded && overflowing ? { maxHeight: `${COLLAPSED_MAX_HEIGHT}px` } : undefined}
            >
              {esc(entry.content)}
            </div>
            {/* 折叠渐变遮罩 + 展开按钮 */}
            {!expanded && overflowing && (
              <div className="absolute bottom-0 inset-x-0 flex flex-col items-center pt-8 bg-gradient-to-t from-user-bubble via-user-bubble/80 to-transparent">
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-display font-medium text-white/90 hover:bg-white/15 transition-colors"
                >
                  <span>展开</span>
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// 助手消息 — 左对齐，无背景卡片，编辑式排版
// =============================================================================

interface AssistantBubbleProps {
  entry: AssistantMessageEntry;
  isStreaming?: boolean;
}

export function AssistantBubble({ entry, isStreaming }: AssistantBubbleProps) {
  return (
    <div className="flex gap-4 items-start">
      {/* Orange triangle avatar */}
      <div className="w-8 h-8 rounded-lg bg-brand/8 flex items-center justify-center flex-shrink-0 mt-0.5">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" fill="var(--color-brand)" fillRule="nonzero" />
        </svg>
      </div>
      {/* 内容 — 无卡片背景，直接排版 */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Sender label */}
        <span className="text-sm font-semibold text-text-primary font-display">Claude</span>
        {entry.chunks.map((chunk, i) => {
          if (chunk.type === "thought") {
            const isLastChunk = i === entry.chunks.length - 1;
            const isThoughtStreaming = isStreaming && isLastChunk;
            return (
              <Reasoning key={i} isStreaming={isThoughtStreaming}>
                <ReasoningTrigger />
                <ReasoningContent>
                  <div className="text-sm text-text-secondary leading-relaxed">
                    {chunk.text}
                  </div>
                </ReasoningContent>
              </Reasoning>
            );
          }
          // 普通消息块 — 直接输出，无包裹卡片
          return (
            <div key={i} className="message-content text-text-primary leading-[1.75]">
              <MessageResponse>{chunk.text}</MessageResponse>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// 图片缩略图 — 点击放大
// =============================================================================

function ImageThumbnail({ image }: { image: UserMessageImage }) {
  const dataUrl = `data:${image.mimeType};base64,${image.data}`;
  return (
    <button
      type="button"
      className="rounded-lg overflow-hidden border border-border hover:border-brand/40 transition-colors cursor-pointer"
      onClick={() => {
        const w = window.open("");
        if (w) {
          w.document.write(`<img src="${dataUrl}" style="max-width:100%;max-height:100%" />`);
        }
      }}
    >
      <img
        src={dataUrl}
        alt="Uploaded image"
        className="h-20 w-20 object-cover"
      />
    </button>
  );
}
