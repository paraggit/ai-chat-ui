import { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import MessageList from './components/MessageList.jsx';
import ChatInput from './components/ChatInput.jsx';
import { useChat } from './hooks/useChat.js';
import { useModelSettings } from './hooks/useModelSettings.js';
import { isLocalProvider } from './utils/modelSettings.js';
import { getInitialDarkMode, setDarkMode } from './utils/theme.js';

export default function App() {
  const { settings, configured, updateSettings } = useModelSettings();
  const {
    messages,
    sessions,
    isLoading,
    error,
    sessionId,
    sendMessage,
    stopGeneration,
    copyLastAssistant,
    newChat,
    selectSession,
    deleteSession,
  } = useChat(settings);
  const [isDark, setIsDark] = useState(getInitialDarkMode);

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const canCopyLast = Boolean(lastAssistant?.content?.trim() || lastAssistant?.metadata?.reasoning);

  useEffect(() => {
    setDarkMode(isDark);
  }, [isDark]);

  const toggleDark = () => setIsDark((prev) => !prev);

  return (
    <div className="flex h-full">
      <Sidebar
        onNewChat={newChat}
        isDark={isDark}
        onToggleDark={toggleDark}
        sessionId={sessionId}
        sessions={sessions}
        onSelectSession={selectSession}
        onDeleteSession={deleteSession}
        chatBusy={isLoading}
        settings={settings}
        configured={configured}
        onSaveSettings={updateSettings}
      />

      <main className="flex min-w-0 flex-1 flex-col bg-surface-secondary dark:bg-surface-dark-secondary">
        {error && (
          <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-center text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
        )}

        <MessageList messages={messages} isDark={isDark} />
        <ChatInput
          onSend={sendMessage}
          onStop={stopGeneration}
          onCopyLast={copyLastAssistant}
          isGenerating={isLoading}
          canCopyLast={canCopyLast}
          disabled={isLoading}
          configured={configured}
          localMode={isLocalProvider(settings)}
        />
      </main>
    </div>
  );
}
