export default function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-1 py-2">
      <span className="inline-block h-2 w-2 rounded-full bg-gray-400 dark:bg-gray-500 animate-pulse-dot" />
      <span
        className="inline-block h-2 w-2 rounded-full bg-gray-400 dark:bg-gray-500 animate-pulse-dot"
        style={{ animationDelay: '0.2s' }}
      />
      <span
        className="inline-block h-2 w-2 rounded-full bg-gray-400 dark:bg-gray-500 animate-pulse-dot"
        style={{ animationDelay: '0.4s' }}
      />
      <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Thinking…</span>
    </div>
  );
}
