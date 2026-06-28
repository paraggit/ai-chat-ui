import { sessionStore } from './sessionStore.js';
import { completeMessages } from './hfService.js';
import { truncateToTokenBudget } from './tokenCounter.js';

const SUMMARY_MAX_TOKENS = Number(process.env.CONTEXT_SUMMARY_MAX_TOKENS) || 400;
const LONG_TERM_MAX_FACTS = Number(process.env.CONTEXT_LONG_TERM_MAX_FACTS) || 20;

/**
 * @param {string} text
 */
function parseSummaryResponse(text) {
  const marker = 'USER_FACTS:';
  const idx = text.indexOf(marker);
  if (idx === -1) {
    return { summary: text.trim(), facts: [] };
  }

  const summary = text.slice(0, idx).trim();
  const factsBlock = text.slice(idx + marker.length).trim();
  const facts = factsBlock
    .split('\n')
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean);

  return { summary, facts };
}

/**
 * @param {Array<{ role: string, content: string }>} messages
 */
function formatMessagesForSummary(messages) {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');
}

/**
 * Summarize older messages and merge durable user facts into session memory.
 * @param {string} sessionId
 * @param {Array<{ role: string, content: string }>} messagesToSummarize
 * @param {import('./hfService.js').HFConfig} config
 * @param {string} [existingSummary]
 */
export async function summarizeMessages(sessionId, messagesToSummarize, config, existingSummary = '') {
  if (messagesToSummarize.length === 0) return;

  const transcript = formatMessagesForSummary(messagesToSummarize);
  const summaryMessages = [
    {
      role: 'system',
      content:
        'You compress chat history for future context. Write a concise summary of the conversation excerpt. ' +
        'Preserve names, goals, decisions, and unresolved questions. ' +
        'Then add a line exactly "USER_FACTS:" followed by bullet points of stable user-specific facts worth remembering long-term ' +
        '(name, preferences, project details). Omit trivial or temporary details.',
    },
    {
      role: 'user',
      content: existingSummary
        ? `Existing summary:\n${existingSummary}\n\nNew messages to merge:\n${transcript}`
        : `Conversation excerpt:\n${transcript}`,
    },
  ];

  console.log(`[memoryService] Summarizing ${messagesToSummarize.length} messages for session ${sessionId}`);

  const result = await completeMessages(summaryMessages, config, {
    maxTokens: SUMMARY_MAX_TOKENS,
    label: 'Memory summarizer',
  });

  const { summary, facts } = parseSummaryResponse(result.content);
  const mergedSummary = truncateToTokenBudget(
    existingSummary && summary ? `${existingSummary}\n\n${summary}` : summary || existingSummary,
    SUMMARY_MAX_TOKENS * 2
  );

  sessionStore.setConversationSummary(sessionId, mergedSummary);
  sessionStore.mergeLongTermMemory(sessionId, facts.slice(0, LONG_TERM_MAX_FACTS));

  console.log(
    `[memoryService] Updated memory (${mergedSummary.length} chars, ${facts.length} new facts)`
  );
}
