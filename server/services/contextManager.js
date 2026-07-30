import { sessionStore } from './sessionStore.js';
import { buildModelMessages, sanitizeMemoryForPrompt } from './promptService.js';
import { summarizeMessages } from './memoryService.js';
import { estimateMessagesTokens, truncateToTokenBudget } from './tokenCounter.js';

const DEFAULT_MAX_RECENT = 16;
const DEFAULT_MAX_CONTEXT_TOKENS_HF = 16384;
const DEFAULT_MAX_CONTEXT_TOKENS_LOCAL = 32768;
const DEFAULT_SUMMARIZE_THRESHOLD = 8;
const TRIM_TARGET_RATIO = 0.85;

/**
 * @param {string} sessionId
 * @param {Array<{ role: string, content: string }>} history
 * @param {import('./hfService.js').HFConfig} config
 * @param {string} [customSystemPrompt]
 */
export async function prepareConversationContext(sessionId, history, config, customSystemPrompt) {
  const maxRecent = Number(process.env.CONTEXT_MAX_RECENT_MESSAGES) || DEFAULT_MAX_RECENT;
  const isLocal = config.provider === 'local';
  const defaultBudget = isLocal ? DEFAULT_MAX_CONTEXT_TOKENS_LOCAL : DEFAULT_MAX_CONTEXT_TOKENS_HF;
  const maxContextTokens = Number(process.env.CONTEXT_MAX_TOKENS) || defaultBudget;
  const summarizeThreshold =
    Number(process.env.CONTEXT_SUMMARIZE_THRESHOLD) || DEFAULT_SUMMARIZE_THRESHOLD;

  const rawMemory = sessionStore.getMemory(sessionId);
  let memory = sanitizeMemoryForPrompt(rawMemory);
  let summarized = false;

  const lastSummarizedIndex = rawMemory?.lastSummarizedIndex ?? 0;
  const unsummarizedCount = history.length - lastSummarizedIndex;
  const shouldSummarize =
    history.length >= summarizeThreshold && unsummarizedCount > maxRecent;

  if (shouldSummarize) {
    const summarizeEnd = history.length - maxRecent;
    const messagesToSummarize = history.slice(lastSummarizedIndex, summarizeEnd);

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

  const firstUserMsg = history.find((m) => m.role === 'user');
  const tail = history.slice(-maxRecent);
  const hasFirst = firstUserMsg && tail.includes(firstUserMsg);
  let recentHistory = hasFirst || !firstUserMsg ? tail : [firstUserMsg, ...tail];
  let memoryForPrompt = {
    conversationSummary: memory.conversationSummary,
    longTermMemory: memory.longTermMemory,
  };

  let messages = buildModelMessages(recentHistory, memoryForPrompt, customSystemPrompt);
  let tokenEstimate = estimateMessagesTokens(messages);
  let trimmedMessages = 0;

  while (tokenEstimate > maxContextTokens * TRIM_TARGET_RATIO && recentHistory.length > 2) {
    // Keep element 0 if it's the pinned first user message
    if (recentHistory[0] === firstUserMsg && recentHistory.length > 3) {
      recentHistory = [recentHistory[0], ...recentHistory.slice(2)];
    } else {
      recentHistory = recentHistory.slice(1);
    }
    trimmedMessages += 1;
    messages = buildModelMessages(recentHistory, memoryForPrompt, customSystemPrompt);
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
    messages = buildModelMessages(recentHistory, memoryForPrompt, customSystemPrompt);
    tokenEstimate = estimateMessagesTokens(messages);
  }

  if (tokenEstimate > maxContextTokens * TRIM_TARGET_RATIO && memoryForPrompt.longTermMemory.length > 3) {
    memoryForPrompt = {
      ...memoryForPrompt,
      longTermMemory: memoryForPrompt.longTermMemory.slice(-3),
    };
    messages = buildModelMessages(recentHistory, memoryForPrompt, customSystemPrompt);
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
