import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import TypingIndicator from './TypingIndicator.jsx';

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
 *     streaming?: boolean,
 *   },
 *   isDark: boolean,
 * }} props
 */
export default function MessageBubble({ message, isDark }) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const showTyping = message.streaming && !message.content && !(message.images?.length);
  const images = message.images ?? [];

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`group flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`relative max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-accent text-white'
            : 'bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-700'
        }`}
      >
        {!isUser && message.content && !message.streaming && (
          <button
            type="button"
            onClick={handleCopy}
            className="absolute -top-2 -right-2 hidden rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-600 shadow group-hover:block dark:bg-gray-700 dark:text-gray-300"
            title="Copy message"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        )}

        {showTyping ? (
          <TypingIndicator />
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
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
              ) : null
            ) : message.content ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ inline, className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || '');
                      const code = String(children).replace(/\n$/, '');

                      if (!inline && match) {
                        return (
                          <SyntaxHighlighter
                            style={isDark ? oneDark : oneLight}
                            language={match[1]}
                            PreTag="div"
                            customStyle={{
                              borderRadius: '0.5rem',
                              fontSize: '0.8125rem',
                              margin: '0.5rem 0',
                            }}
                            {...props}
                          >
                            {code}
                          </SyntaxHighlighter>
                        );
                      }

                      return (
                        <code
                          className="rounded bg-gray-100 px-1 py-0.5 text-sm dark:bg-gray-800"
                          {...props}
                        >
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {message.content}
                </ReactMarkdown>
                {message.streaming && (
                  <span className="inline-block h-4 w-1 animate-pulse bg-accent ml-0.5 align-middle" />
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
