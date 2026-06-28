import { sessionStore } from './sessionStore.js';
import { buildModelMessages, sanitizeMemoryForPrompt } from './promptService.js';
import { summarizeMessages } from './memoryService.js';
import { estimateMessagesTokens, truncateToTokenBudget } from './tokenCounter.js';

const DEFAULT_MAX_RECENT = 16;
const DEFAULT_MAX_CONTEXT_TOKENS = 8192;
const DEFAULT_SUMMARIZE_THRESHOLD = 20;
const TRIM_TARGET_RATIO = 0.85;

/**
 * @param {string} sessionId
 * @param {Array<{ role: string, content: string }>} history
 * @param {import('./hfService.js').HFConfig} config
 */
export async function prepareConversationContext(sessionId, history, config) {
  const maxRecent = Number(process.env.CONTEXT_MAX_RECENT_MESSAGES) || DEFAULT_MAX_RECENT;
  const maxContextTokens = Number(process.env.CONTEXT_MAX_TOKENS) || DEFAULT_MAX_CONTEXT_TOKENS;
  const summarizeThreshold =
    Number(process.env.CONTEXT_SUMMARIZE_THRESHOLD) || DEFAULT_SUMMARIZE_THRESHOLD;

  let memory = sanitizeMemoryForPrompt(sessionStore.getMemory(sessionId));
  let summarized = false;

  const unsummarizedCount = history.length - memory.lastSummarizedIndex;
  const shouldSummarize =
    history.length >= summarizeThreshold && unsummarizedCount > maxRecent;

  if (shouldSummarize) {
    const summarizeEnd = history.length - maxRecent;
    const messagesToSummarize = history.slice(memory.lastSummarizedIndex, summarizeEnd);

    if (messagesToSummarize.length > 0) {
      await summarizeMessages(
        sessionId,
        messagesToSummarize,
        config,
        memory.conversationSummary
      );
      sessionStore.setLastSummarizedIndex(sessionId, summarizeEnd);
      memory = sanitizeMemoryForPrompt(sessionStore.getMemory(sessionId));
      summarized = true;
    }
  }

  let recentHistory = history.slice(-maxRecent);
  let memoryForPrompt = {
    conversationSummary: memory.conversationSummary,
    longTermMemory: memory.longTermMemory,
  };

  let messages = buildModelMessages(recentHistory, memoryForPrompt);
  let tokenEstimate = estimateMessagesTokens(messages);
  let trimmedMessages = 0;

  while (tokenEstimate > maxContextTokens * TRIM_TARGET_RATIO && recentHistory.length > 2) {
    recentHistory = recentHistory.slice(1);
    trimmedMessages += 1;
    messages = buildModelMessages(recentHistory, memoryForPrompt);
    tokenEstimate = estimateMessagesTokens(messages);
  }

  if (tokenEstimate > maxContextTokens * TRIM_TARGET_RATIO && memoryForPrompt.conversationSummary) {
    memoryForPrompt = {
      ...memoryForPrompt,
      conversationSummary: truncateToTokenBudget(
        memoryForPrompt.conversationSummary,
        Math.floor(maxContextTokens * 0.15)
      ),
    };
    messages = buildModelMessages(recentHistory, memoryForPrompt);
    tokenEstimate = estimateMessagesTokens(messages);
  }

  if (tokenEstimate > maxContextTokens * TRIM_TARGET_RATIO && memoryForPrompt.longTermMemory.length > 3) {
    memoryForPrompt = {
      ...memoryForPrompt,
      longTermMemory: memoryForPrompt.longTermMemory.slice(-3),
    };
    messages = buildModelMessages(recentHistory, memoryForPrompt);
    tokenEstimate = estimateMessagesTokens(messages);
  }

  return {
    messages,
    tokenEstimate,
    maxContextTokens,
    recentMessageCount: recentHistory.length,
    totalMessageCount: history.length,
    summarized,
    trimmedMessages,
    memoryUsed: Boolean(
      memoryForPrompt.conversationSummary || memoryForPrompt.longTermMemory.length
    ),
  };
}
