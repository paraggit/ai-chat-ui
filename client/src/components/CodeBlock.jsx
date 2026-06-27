import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

/**
 * @param {{ code: string, language: string, isDark: boolean }} props
 */
export default function CodeBlock({ code, language, isDark }) {
  const [copied, setCopied] = useState(false);
  const label = language === 'text' ? 'code' : language;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-block my-3 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-100 px-3 py-1.5 dark:border-gray-700 dark:bg-gray-800">
        <span className="font-mono text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {label}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded px-2 py-0.5 text-[11px] text-gray-500 transition hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
        >
          {copied ? 'Copied!' : 'Copy code'}
        </button>
      </div>
      <div className="overflow-x-auto">
        <SyntaxHighlighter
          style={isDark ? oneDark : oneLight}
          language={language}
          PreTag="div"
          customStyle={{
            margin: 0,
            padding: '0.875rem 1rem',
            background: 'transparent',
            fontSize: '0.8125rem',
            lineHeight: 1.6,
          }}
          codeTagProps={{
            className: 'font-mono',
          }}
          showLineNumbers={code.split('\n').length > 2}
          wrapLongLines
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}
