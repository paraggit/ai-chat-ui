import { useState } from 'react';
import TypingIndicator from './TypingIndicator.jsx';
import MetadataModal, { hasMetadata } from './MetadataModal.jsx';
import MarkdownContent from './MarkdownContent.jsx';
import ReasoningBlock, { getReasoning } from './ReasoningBlock.jsx';
import { copyMessageText } from '../utils/messageCopy.js';
import CompareView from './CompareView.jsx';

/**
 * @param {{ src: string, alt: string, isUser?: boolean }} props
 */
function MessageImages({ src, alt, isUser }) {
  return (
    <img
      src={src}
      alt={alt}
      className={`max-h-64 max-w-full rounded-lg object-contain ${
        isUser ? 'border border-white/20' : 'border border-gray-200 dark:border-gray-600'
      }`}
    />
  );
}

/**
 * @param {{
 *   message: {
 *     id: string,
 *     role: string,
 *     content: string,
 *     images?: string[],
 *     metadata?: Record<string, unknown>,
 *     streaming?: boolean,
 *     status?: string,
 *     compare?: boolean,
 *     compareResponses?: Array<{ model: string, content: string }>,
 *   },
 *   isDark: boolean,
 *   messageIndex: number,
 *   isLast: boolean,
 *   isLoading: boolean,
 *   onEdit: (messageIndex: number, newContent: string) => void,
 *   onRegenerate: () => void,
 *   onKeepCompare?: (messageId: string, responseIndex: number) => void,
 * }} props
 */
export default function MessageBubble({ message, isDark, messageIndex, isLast, isLoading, onEdit, onRegenerate, onKeepCompare }) {
  const [copied, setCopied] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);
  const isUser = message.role === 'user';
  const images = message.images ?? [];
  const statusText = message.status;
  const metadataAvailable = hasMetadata(message.metadata);
  const reasoning = getReasoning(message.metadata);
  const showTyping = message.streaming && !message.content && !reasoning && !(images.length);
  const canCopy = !isUser && Boolean(message.content || reasoning);

  const handleCopy = async () => {
    const ok = await copyMessageText(message);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      {!isUser && message.compare && message.compareResponses ? (
        <CompareView
          responses={message.compareResponses}
          onKeep={(i) => onKeepCompare?.(message.id, i)}
          isDark={isDark}
          streaming={message.streaming || false}
        />
      ) : (
        <div className={`group flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
          <div
            className={`relative min-w-0 max-w-[85%] overflow-hidden rounded-2xl px-4 py-3 ${
              isUser
                ? 'bg-accent text-white'
                : 'bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-700'
            }`}
          >
          {isUser && !message.streaming && (
            <div className="absolute -top-2 -left-2 hidden group-hover:flex">
              <button
                type="button"
                onClick={() => { setEditText(message.content); setEditing(true); }}
                disabled={isLoading}
                className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-600 shadow dark:bg-gray-700 dark:text-gray-300 disabled:opacity-40"
                title="Edit message"
              >
                Edit
              </button>
            </div>
          )}

          {!isUser && canCopy && (
            <div
              className={`absolute -top-2 -right-2 flex gap-1 ${
                message.streaming ? 'opacity-100' : 'hidden group-hover:flex'
              }`}
            >
              {metadataAvailable && !message.streaming && (
                <button
                  type="button"
                  onClick={() => setShowMetadata(true)}
                  className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-600 shadow dark:bg-gray-700 dark:text-gray-300"
                  title="View metadata"
                >
                  Info
                </button>
              )}
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-600 shadow dark:bg-gray-700 dark:text-gray-300"
                title="Copy message"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          )}

          {showTyping ? (
            <div>
              <TypingIndicator />
              {statusText && <p className="mt-1 text-xs opacity-80">{statusText}</p>}
            </div>
          ) : (
            <div className="space-y-2">
              {images.length > 0 && (
                <div className={`flex flex-wrap gap-2 ${message.content ? 'mb-2' : ''}`}>
                  {images.map((src, index) => (
                    <MessageImages
                      key={`${message.id}-img-${index}`}
                      src={src}
                      alt={`${isUser ? 'Uploaded' : 'Generated'} image ${index + 1}`}
                      isUser={isUser}
                    />
                  ))}
                </div>
              )}

              {isUser ? (
                editing ? (
                  <div className="space-y-2">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={3}
                      className="w-full resize-y rounded-md border border-white/30 bg-white/10 px-2 py-1.5 text-sm text-white outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { onEdit(messageIndex, editText); setEditing(false); }}
                        className="rounded-md bg-white/20 px-3 py-1 text-xs font-medium text-white hover:bg-white/30"
                      >
                        Save & resend
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(false)}
                        className="rounded-md px-3 py-1 text-xs text-white/70 hover:text-white"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : message.content ? (
                  <p className="m-0 whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
                    {message.content}
                  </p>
                ) : null
              ) : message.content || reasoning ? (
                <>
                  {reasoning && (
                    <ReasoningBlock reasoning={reasoning} streaming={message.streaming} />
                  )}
                  {message.content ? (
                    <MarkdownContent
                      content={message.content}
                      isDark={isDark}
                      streaming={message.streaming}
                    />
                  ) : message.streaming ? (
                    <TypingIndicator />
                  ) : null}
                </>
              ) : (
                <p className="text-sm italic opacity-70">No response received.</p>
              )}

              {!isUser && message.metadata?.stopped && !message.streaming && (
                <p className="text-xs italic text-gray-500 dark:text-gray-400">Generation stopped.</p>
              )}

              {!isUser && message.metadata?.finishReason === 'length' && !message.streaming && (
                <p className="text-xs italic text-amber-600 dark:text-amber-400">
                  Response hit the output token limit
                  {typeof message.metadata.outputTokenLimit === 'number'
                    ? ` (${message.metadata.outputTokenLimit.toLocaleString()} tokens)`
                    : ''}
                  . Open Model settings, raise Max tokens to 8192 or 16384, click Save, then try again.
                </p>
              )}

              {!isUser && metadataAvailable && !message.streaming && (
                <button
                  type="button"
                  onClick={() => setShowMetadata(true)}
                  className="mt-1 inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-500 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  View metadata
                </button>
              )}

              {!isUser && isLast && !message.streaming && (
                <button
                  type="button"
                  onClick={onRegenerate}
                  disabled={isLoading}
                  className="mt-1 inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-500 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800 disabled:opacity-40"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Regenerate
                </button>
              )}
            </div>
          )}
          </div>
        </div>
      )}

      {showMetadata && metadataAvailable && (
        <MetadataModal metadata={message.metadata} onClose={() => setShowMetadata(false)} />
      )}
    </>
  );
}
