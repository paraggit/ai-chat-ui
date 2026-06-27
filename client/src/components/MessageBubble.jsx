import { useState } from 'react';
import TypingIndicator from './TypingIndicator.jsx';
import MetadataModal, { hasMetadata } from './MetadataModal.jsx';
import MarkdownContent from './MarkdownContent.jsx';
import ReasoningBlock, { getReasoning } from './ReasoningBlock.jsx';

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
 *   },
 *   isDark: boolean,
 * }} props
 */
export default function MessageBubble({ message, isDark }) {
  const [copied, setCopied] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const isUser = message.role === 'user';
  const images = message.images ?? [];
  const statusText = message.status;
  const metadataAvailable = hasMetadata(message.metadata);
  const reasoning = getReasoning(message.metadata);
  const showTyping = message.streaming && !message.content && !reasoning && !(images.length);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div className={`group flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
        <div
          className={`relative min-w-0 max-w-[85%] overflow-hidden rounded-2xl px-4 py-3 ${
            isUser
              ? 'bg-accent text-white'
              : 'bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-700'
          }`}
        >
          {!isUser && (message.content || reasoning) && !message.streaming && (
            <div className="absolute -top-2 -right-2 hidden gap-1 group-hover:flex">
              {metadataAvailable && (
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
                message.content ? (
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

              {!isUser && message.metadata?.finishReason === 'length' && !message.streaming && (
                <p className="text-xs italic text-amber-600 dark:text-amber-400">
                  Response was cut off at the token limit. Increase Max tokens in Model settings for
                  longer replies.
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
            </div>
          )}
        </div>
      </div>

      {showMetadata && metadataAvailable && (
        <MetadataModal metadata={message.metadata} onClose={() => setShowMetadata(false)} />
      )}
    </>
  );
}
