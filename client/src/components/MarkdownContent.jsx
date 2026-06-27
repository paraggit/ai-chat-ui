import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CodeBlock from './CodeBlock.jsx';
import { isBlockCode, resolveLanguage } from '../utils/codeLanguage.js';

/**
 * @param {{ content: string, isDark: boolean, streaming?: boolean }} props
 */
export default function MarkdownContent({ content, isDark, streaming }) {
  return (
    <div className="markdown-content prose prose-sm dark:prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) {
            return <>{children}</>;
          },
          code({ className, children, node, ...props }) {
            const code = String(children).replace(/\n$/, '');

            if (isBlockCode(className, code, node)) {
              const language = resolveLanguage(className, code);
              return <CodeBlock code={code} language={language} isDark={isDark} />;
            }

            return (
              <code
                className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[0.8125rem] text-accent dark:bg-gray-800 dark:text-emerald-300"
                {...props}
              >
                {children}
              </code>
            );
          },
          a({ href, children, ...props }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
      {streaming && (
        <span className="inline-block h-4 w-1 animate-pulse bg-accent ml-0.5 align-middle" />
      )}
    </div>
  );
}
