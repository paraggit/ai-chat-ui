# AI Chat UI Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix context loss so the model retains full conversation memory, add a system prompt textbox, and add advanced features (temperature/top-p controls, export/import, message edit/regenerate, multi-model compare).

**Architecture:** Incremental additions to the existing Express + React (Vite, Tailwind) stack. No new dependencies required. Server-side sessions are persisted as JSON files in `data/sessions/`. Client state is managed via React hooks (`useChat`, `useModelSettings`) with localStorage for settings. All chat communication uses SSE streaming over `POST /api/chat`.

**Tech Stack:** Node.js/Express (ESM), React 18, Vite, Tailwind CSS, SSE streaming

## Global Constraints

- No new npm dependencies — use built-in browser/Node APIs only
- Follow existing code style: JSDoc types (no TypeScript), ESM imports, functional React components
- All API changes must work across all three providers: HuggingFace, custom endpoint, local Ollama
- Existing Tailwind design tokens: `bg-accent`, `bg-accent-hover`, `bg-surface-secondary`, `bg-surface-dark`, `bg-surface-dark-secondary`
- Session data is persisted synchronously to `data/sessions/{id}.json` — maintain this pattern
- localStorage key prefix: `hf-chat-pro-`

---

### Task 1: Fix Context Manager — Earlier Summarization & Larger Token Budgets

**Files:**
- Modify: `server/services/contextManager.js` (full file, 96 lines)
- Modify: `server/services/memoryService.js:47-105` (summarizeMessages function)

**Interfaces:**
- Consumes: `sessionStore.getMemory()`, `buildModelMessages()`, `summarizeMessages()`, `estimateMessagesTokens()`, `truncateToTokenBudget()` — all unchanged signatures
- Produces: `prepareConversationContext(sessionId, history, config)` — same signature, same return shape, but now accepts `config.provider` to determine default context budget

- [ ] **Step 1: Lower summarization threshold and increase context budget in contextManager.js**

Open `server/services/contextManager.js` and replace the constants at the top:

```javascript
const DEFAULT_MAX_RECENT = 16;
const DEFAULT_MAX_CONTEXT_TOKENS = 8192;
const DEFAULT_SUMMARIZE_THRESHOLD = 20;
const TRIM_TARGET_RATIO = 0.85;
```

with:

```javascript
const DEFAULT_MAX_RECENT = 16;
const DEFAULT_MAX_CONTEXT_TOKENS_HF = 16384;
const DEFAULT_MAX_CONTEXT_TOKENS_LOCAL = 32768;
const DEFAULT_SUMMARIZE_THRESHOLD = 8;
const TRIM_TARGET_RATIO = 0.85;
```

Then update `prepareConversationContext` to pick the budget based on `config.provider`:

```javascript
export async function prepareConversationContext(sessionId, history, config) {
  const maxRecent = Number(process.env.CONTEXT_MAX_RECENT_MESSAGES) || DEFAULT_MAX_RECENT;
  const isLocal = config.provider === 'local';
  const defaultBudget = isLocal ? DEFAULT_MAX_CONTEXT_TOKENS_LOCAL : DEFAULT_MAX_CONTEXT_TOKENS_HF;
  const maxContextTokens = Number(process.env.CONTEXT_MAX_TOKENS) || defaultBudget;
  const summarizeThreshold =
    Number(process.env.CONTEXT_SUMMARIZE_THRESHOLD) || DEFAULT_SUMMARIZE_THRESHOLD;

  // ... rest unchanged
```

- [ ] **Step 2: Add sliding window with overlap — keep first user message**

In the same function, replace the line:

```javascript
let recentHistory = history.slice(-maxRecent);
```

with:

```javascript
const firstUserMsg = history.find((m) => m.role === 'user');
const tail = history.slice(-maxRecent);
const hasFirst = firstUserMsg && tail.includes(firstUserMsg);
let recentHistory = hasFirst || !firstUserMsg ? tail : [firstUserMsg, ...tail];
```

Also update the trimming loop to never drop the first element when it is the first user message:

```javascript
while (tokenEstimate > maxContextTokens * TRIM_TARGET_RATIO && recentHistory.length > 2) {
  // Keep element 0 if it's the pinned first user message
  if (recentHistory[0] === firstUserMsg && recentHistory.length > 3) {
    recentHistory = [recentHistory[0], ...recentHistory.slice(2)];
  } else {
    recentHistory = recentHistory.slice(1);
  }
  trimmedMessages += 1;
  messages = buildModelMessages(recentHistory, memoryForPrompt);
  tokenEstimate = estimateMessagesTokens(messages);
}
```

- [ ] **Step 3: Add retry logic to memoryService.js**

In `server/services/memoryService.js`, wrap the LLM call in `summarizeMessages` with a retry:

Replace lines 75-80:

```javascript
  const result = await completeMessages(summaryMessages, config, {
    maxTokens: SUMMARY_MAX_TOKENS,
    label: 'Memory summarizer',
  });
```

with:

```javascript
  let result;
  try {
    result = await completeMessages(summaryMessages, config, {
      maxTokens: SUMMARY_MAX_TOKENS,
      label: 'Memory summarizer',
    });
  } catch (firstError) {
    console.warn(`[memoryService] Summarization failed, retrying: ${firstError.message}`);
    try {
      result = await completeMessages(summaryMessages, config, {
        maxTokens: SUMMARY_MAX_TOKENS,
        label: 'Memory summarizer (retry)',
      });
    } catch (retryError) {
      console.error(`[memoryService] Summarization retry also failed: ${retryError.message}`);
      return;
    }
  }
```

- [ ] **Step 4: Test manually**

Start the dev server:
```bash
cd /Users/paragkamble/ai-chat-ui && npm run dev
```

Open the app, start a new chat, send 10+ messages that reference earlier context (e.g. "My name is Parag", then later "What is my name?"). Verify:
- The model remembers earlier context
- Console logs show `[memoryService] Summarizing` after ~8 unsummarized messages
- No silent failures in the terminal

- [ ] **Step 5: Commit**

```bash
git add server/services/contextManager.js server/services/memoryService.js
git commit -m "fix: earlier summarization, larger context budgets, retry on failure"
```

---

### Task 2: System Prompt Textbox — Server Side

**Files:**
- Modify: `server/services/sessionStore.js:81-93` (_normalize method), `server/services/sessionStore.js:100-114` (_ensure method)
- Modify: `server/services/promptService.js:3,31-47` (SYSTEM_PROMPT constant, buildSystemPrompt function)
- Modify: `server/controllers/chatController.js:13-55` (streamChat — accept systemPrompt from body)
- Modify: `server/controllers/chatController.js:232-250` (getHistory — return systemPrompt)

**Interfaces:**
- Consumes: `sessionStore._ensure()`, `sessionStore._persist()` — internal, unchanged signatures
- Produces:
  - `sessionStore.setSystemPrompt(sessionId: string, prompt: string): void` — new method
  - `sessionStore.getSystemPrompt(sessionId: string): string` — new method
  - `buildSystemPrompt(memory?, customSystemPrompt?: string): string` — updated signature, optional second arg
  - `buildModelMessages(recentHistory, memory?, customSystemPrompt?: string): Array` — updated signature
  - `buildChatMessages(history, newMessage, memory?, customSystemPrompt?: string): Array` — updated signature
  - `getHistory` response now includes `systemPrompt` field

- [ ] **Step 1: Add systemPrompt field to sessionStore.js**

In `server/services/sessionStore.js`, update the `SessionData` typedef (around line 23) to include `systemPrompt`:

```javascript
/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   createdAt: string,
 *   updatedAt: string,
 *   messages: SessionMessage[],
 *   conversationSummary: string,
 *   longTermMemory: string[],
 *   lastSummarizedIndex: number,
 *   systemPrompt: string,
 * }} SessionData
 */
```

In `_normalize()` (around line 82), add:

```javascript
systemPrompt: typeof data.systemPrompt === 'string' ? data.systemPrompt : '',
```

In `_ensure()` (around line 100), add `systemPrompt: '',` to the new session object.

Add two new methods to the class after `setLastSummarizedIndex`:

```javascript
/**
 * @param {string} sessionId
 * @param {string} prompt
 */
setSystemPrompt(sessionId, prompt) {
  this._ensure(sessionId).systemPrompt = prompt;
  this._persist(sessionId);
}

/**
 * @param {string} sessionId
 * @returns {string}
 */
getSystemPrompt(sessionId) {
  return this._ensure(sessionId).systemPrompt;
}
```

- [ ] **Step 2: Update promptService.js to accept a custom system prompt**

In `server/services/promptService.js`, remove the hardcoded constant:

```javascript
const SYSTEM_PROMPT = 'You are a helpful AI assistant.';
```

Replace with:

```javascript
const DEFAULT_SYSTEM_PROMPT = 'You are a helpful AI assistant.';
```

Update `buildSystemPrompt` to accept an optional custom prompt:

```javascript
export function buildSystemPrompt(memory = {}, customSystemPrompt) {
  const safeMemory = sanitizeMemoryForPrompt(memory);
  const parts = [customSystemPrompt || DEFAULT_SYSTEM_PROMPT];

  // ... rest unchanged
```

Update `buildModelMessages` signature:

```javascript
export function buildModelMessages(recentHistory, memory = {}, customSystemPrompt) {
  const messages = [{ role: 'system', content: buildSystemPrompt(memory, customSystemPrompt) }];
  // ... rest unchanged
```

Update `buildChatMessages` signature:

```javascript
export function buildChatMessages(history, newMessage, memory = {}, customSystemPrompt) {
  const recent = [...history];
  if (newMessage) {
    recent.push({ role: 'user', content: newMessage });
  }
  return buildModelMessages(recent, memory, customSystemPrompt);
}
```

Update `buildPrompt` to use `DEFAULT_SYSTEM_PROMPT`:

```javascript
export function buildPrompt(history, newMessage) {
  const historyLines = history
    .map((m) => `${capitalizeRole(m.role)}: ${m.content}`)
    .join('\n');

  return `System: ${DEFAULT_SYSTEM_PROMPT}
${historyLines ? `${historyLines}\n` : ''}User: ${newMessage}
Assistant:`;
}
```

- [ ] **Step 3: Update chatController.js to accept and thread systemPrompt**

In `server/controllers/chatController.js`, extract `systemPrompt` from the request body in `streamChat` (around line 19):

```javascript
const {
  message,
  sessionId,
  images,
  provider,
  hfToken,
  model,
  endpoint,
  visionModel,
  imageGenModel,
  maxTokens,
  systemPrompt,
} = req.body ?? {};
```

After `sessionStore.appendMessage(sessionId, { ... })` (around line 62), store the system prompt if provided and the session doesn't already have one:

```javascript
if (typeof systemPrompt === 'string' && systemPrompt.trim()) {
  const existing = sessionStore.getSystemPrompt(sessionId);
  if (!existing) {
    sessionStore.setSystemPrompt(sessionId, systemPrompt.trim());
  }
}
```

The `contextManager.js` calls `buildModelMessages` — we need to pass the system prompt through. Update the `prepareConversationContext` call to include it. In `contextManager.js`, update the function signature:

```javascript
export async function prepareConversationContext(sessionId, history, config, customSystemPrompt) {
```

And pass it through to `buildModelMessages`:

```javascript
let messages = buildModelMessages(recentHistory, memoryForPrompt, customSystemPrompt);
```

Do this for all three calls to `buildModelMessages` in that function.

Back in `chatController.js`, update the call:

```javascript
const sessionSystemPrompt = sessionStore.getSystemPrompt(sessionId) || (typeof systemPrompt === 'string' ? systemPrompt.trim() : '');

// In the prepareConversationContext call:
contextInfo = await prepareConversationContext(sessionId, fullHistory, hfConfig, sessionSystemPrompt || undefined);
```

In the `getHistory` handler, include `systemPrompt`:

```javascript
export function getHistory(req, res) {
  const { sessionId } = req.params;
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  const history = sessionStore.getHistory(sessionId);
  const memory = sessionStore.getMemory(sessionId);
  const systemPrompt = sessionStore.getSystemPrompt(sessionId);
  const sessions = sessionStore.listSessions();
  const meta = sessions.find((s) => s.id === sessionId);

  res.json({
    sessionId,
    title: meta?.title ?? 'New chat',
    history,
    memory,
    systemPrompt,
  });
}
```

- [ ] **Step 4: Test manually**

Start the dev server and use curl to test the system prompt round-trip:

```bash
# Send a chat with a custom system prompt
curl -X POST http://localhost:3001/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"Hello","sessionId":"test-sysprompt","systemPrompt":"You are a pirate. Speak only in pirate talk.","provider":"local","model":"llama3.2"}'

# Check that the session stored the system prompt
curl http://localhost:3001/api/chat/test-sysprompt | python3 -m json.tool | grep systemPrompt
```

- [ ] **Step 5: Commit**

```bash
git add server/services/sessionStore.js server/services/promptService.js server/controllers/chatController.js server/services/contextManager.js
git commit -m "feat: server-side support for custom system prompt per session"
```

---

### Task 3: System Prompt Textbox — Client Side

**Files:**
- Create: `client/src/components/SystemPrompt.jsx`
- Modify: `client/src/components/Sidebar.jsx:1-2,19-31,48-76` (add SystemPrompt import and render)
- Modify: `client/src/hooks/useChat.js:100-145` (sendMessage — pass systemPrompt, load it from server)
- Modify: `client/src/utils/modelSettings.js:1,17-25,38-67,96-114` (add systemPrompt to localStorage helpers)

**Interfaces:**
- Consumes: `apiUrl()`, `toApiPayload()`, `loadModelSettings()`, `saveModelSettings()` — existing
- Produces:
  - `<SystemPrompt value={string} onChange={fn} />` — new component
  - `loadLastSystemPrompt(): string` — new util function
  - `saveLastSystemPrompt(prompt: string): void` — new util function
  - `useChat` now accepts `(modelSettings, systemPrompt)` and sends `systemPrompt` in the API body

- [ ] **Step 1: Add localStorage helpers for system prompt**

In `client/src/utils/modelSettings.js`, add at the top after `SETTINGS_KEY`:

```javascript
const SYSTEM_PROMPT_KEY = 'hf-chat-pro-system-prompt';
const DEFAULT_SYSTEM_PROMPT = 'You are a helpful AI assistant.';
```

Add two new exported functions at the bottom of the file:

```javascript
export function loadLastSystemPrompt() {
  return localStorage.getItem(SYSTEM_PROMPT_KEY) || DEFAULT_SYSTEM_PROMPT;
}

export function saveLastSystemPrompt(prompt) {
  localStorage.setItem(SYSTEM_PROMPT_KEY, prompt);
}

export { DEFAULT_SYSTEM_PROMPT };
```

- [ ] **Step 2: Create SystemPrompt.jsx component**

Create `client/src/components/SystemPrompt.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react';

/**
 * @param {{
 *   value: string,
 *   onChange: (prompt: string) => void,
 * }} props
 */
export default function SystemPrompt({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const timerRef = useRef(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const handleChange = (e) => {
    const next = e.target.value;
    setDraft(next);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(next), 500);
  };

  const handleBlur = () => {
    clearTimeout(timerRef.current);
    onChange(draft);
  };

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-xs font-medium uppercase tracking-wide text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
      >
        <span>System prompt</span>
        <svg
          className={`h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-surface-dark">
          <textarea
            value={draft}
            onChange={handleChange}
            onBlur={handleBlur}
            rows={4}
            placeholder="You are a helpful AI assistant."
            className="w-full resize-y rounded-md border border-gray-200 bg-surface-secondary px-2.5 py-2 text-xs outline-none focus:border-accent dark:border-gray-600 dark:bg-surface-dark-secondary"
          />
          <p className="mt-1 text-[10px] leading-snug text-gray-400">
            Instructions the model follows throughout this conversation. Saved per chat session.
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire SystemPrompt into Sidebar and App**

In `client/src/components/Sidebar.jsx`, add the import:

```javascript
import SystemPrompt from './SystemPrompt.jsx';
```

Add `systemPrompt` and `onSystemPromptChange` to the destructured props:

```javascript
export default function Sidebar({
  onNewChat,
  isDark,
  onToggleDark,
  sessionId,
  sessions,
  onSelectSession,
  onDeleteSession,
  chatBusy,
  settings,
  configured,
  onSaveSettings,
  systemPrompt,
  onSystemPromptChange,
}) {
```

Render `<SystemPrompt>` right before `<ModelSettings>` inside the scrollable area:

```jsx
<SystemPrompt value={systemPrompt} onChange={onSystemPromptChange} />

<ModelSettings
  settings={settings}
  configured={configured}
  onSave={onSaveSettings}
/>
```

In `client/src/App.jsx`, add state and pass props:

```javascript
import { loadLastSystemPrompt, saveLastSystemPrompt } from './utils/modelSettings.js';
```

Inside the `App` component, add state:

```javascript
const [systemPrompt, setSystemPromptState] = useState(loadLastSystemPrompt);

const handleSystemPromptChange = (prompt) => {
  setSystemPromptState(prompt);
  saveLastSystemPrompt(prompt);
};
```

Pass to `useChat`:

```javascript
const { ... } = useChat(settings, systemPrompt);
```

Pass to `Sidebar`:

```jsx
<Sidebar
  ...existing props...
  systemPrompt={systemPrompt}
  onSystemPromptChange={handleSystemPromptChange}
/>
```

- [ ] **Step 4: Update useChat to send systemPrompt in API calls**

In `client/src/hooks/useChat.js`, update the function signature:

```javascript
export function useChat(modelSettings, systemPrompt) {
```

In `sendMessage`, add `systemPrompt` to the fetch body (around line 139):

```javascript
body: JSON.stringify({
  message: trimmed,
  sessionId,
  images,
  systemPrompt,
  ...toApiPayload(modelSettings),
}),
```

When loading history from the server, update the system prompt if the session has one. In `loadHistory`:

```javascript
const loadHistory = useCallback(
  async (sid) => {
    if (isSendingRef.current) return;
    try {
      const res = await fetch(apiUrl(`/api/chat/${sid}`));
      if (!res.ok) return;
      const data = await res.json();
      setMessages(mapHistory(sid, data.history));
      if (data.systemPrompt && onSystemPromptLoad) {
        onSystemPromptLoad(data.systemPrompt);
      }
    } catch {
      // Server may be down on first load — ignore
    }
  },
  [mapHistory, onSystemPromptLoad]
);
```

Wait — this introduces a callback dependency. Simpler approach: add a third optional parameter:

```javascript
export function useChat(modelSettings, systemPrompt, onSystemPromptLoad) {
```

And in `App.jsx`, pass a callback:

```javascript
const { ... } = useChat(settings, systemPrompt, (prompt) => {
  setSystemPromptState(prompt);
  saveLastSystemPrompt(prompt);
});
```

- [ ] **Step 5: Test manually**

Start the dev server. Open the app. Expand "System prompt" in the sidebar. Change it to "You are a pirate. Always respond in pirate speak." Send a message. Verify the model responds in pirate talk. Start a new chat — verify the last system prompt is preserved. Switch back to the pirate chat — verify it loads the pirate prompt.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/SystemPrompt.jsx client/src/components/Sidebar.jsx client/src/App.jsx client/src/hooks/useChat.js client/src/utils/modelSettings.js
git commit -m "feat: add system prompt textbox with per-session persistence"
```

---

### Task 4: Temperature, Top-p, and Frequency Penalty Controls

**Files:**
- Modify: `client/src/utils/modelSettings.js:17-25,38-67,96-114` (add new fields to DEFAULTS, loadModelSettings, toApiPayload)
- Modify: `client/src/components/ModelSettings.jsx:31-87,225-250` (add slider UI)
- Modify: `server/controllers/chatController.js:13-55` (extract new params from request body)
- Modify: `server/services/hfService.js:149-167` (use params in buildChatRequestBody)

**Interfaces:**
- Consumes: `loadModelSettings()`, `saveModelSettings()`, `toApiPayload()` — existing, updated
- Produces:
  - `loadModelSettings()` return shape gains `temperature: number`, `topP: number`, `frequencyPenalty: number`
  - `toApiPayload()` return shape gains `temperature`, `topP`, `frequencyPenalty`
  - `buildChatRequestBody()` now reads these from `config` overrides

- [ ] **Step 1: Add new fields to modelSettings.js**

In `client/src/utils/modelSettings.js`, update `DEFAULTS`:

```javascript
const DEFAULTS = {
  provider: PROVIDERS.HUGGINGFACE,
  apiKey: '',
  model: 'Qwen/Qwen2.5-7B-Instruct',
  endpoint: '',
  visionModel: 'Salesforce/blip-vqa-base',
  imageGenModel: 'stabilityai/stable-diffusion-2-1',
  maxTokens: DEFAULT_MAX_TOKENS,
  temperature: 0.7,
  topP: 1.0,
  frequencyPenalty: 0,
};
```

In `loadModelSettings`, add parsing for the new fields (after `maxTokens` parsing):

```javascript
const temperature = Number(parsed.temperature);
const topP = Number(parsed.topP);
const frequencyPenalty = Number(parsed.frequencyPenalty);

return {
  // ...existing fields...
  temperature: Number.isFinite(temperature) && temperature >= 0 && temperature <= 2
    ? temperature : DEFAULTS.temperature,
  topP: Number.isFinite(topP) && topP >= 0 && topP <= 1
    ? topP : DEFAULTS.topP,
  frequencyPenalty: Number.isFinite(frequencyPenalty) && frequencyPenalty >= 0 && frequencyPenalty <= 2
    ? frequencyPenalty : DEFAULTS.frequencyPenalty,
};
```

In `toApiPayload`, add to the return object:

```javascript
return {
  // ...existing fields...
  temperature: Number.isFinite(settings.temperature) ? settings.temperature : undefined,
  topP: Number.isFinite(settings.topP) ? settings.topP : undefined,
  frequencyPenalty: Number.isFinite(settings.frequencyPenalty) ? settings.frequencyPenalty : undefined,
};
```

- [ ] **Step 2: Add slider controls to ModelSettings.jsx**

In `client/src/components/ModelSettings.jsx`, add this JSX block after the "Max tokens" `<div>` and before the "Custom endpoint" `<div>`:

```jsx
<div>
  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
    Temperature: {draft.temperature}
  </label>
  <input
    type="range"
    min={0}
    max={2}
    step={0.1}
    value={draft.temperature}
    onChange={(e) =>
      setDraft((prev) => ({ ...prev, temperature: Number(e.target.value) }))
    }
    className="w-full accent-accent"
  />
  <p className="mt-1 text-[10px] leading-snug text-gray-400">
    Higher = more creative, lower = more focused. Default 0.7.
  </p>
</div>

<div>
  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
    Top-p: {draft.topP}
  </label>
  <input
    type="range"
    min={0}
    max={1}
    step={0.05}
    value={draft.topP}
    onChange={(e) =>
      setDraft((prev) => ({ ...prev, topP: Number(e.target.value) }))
    }
    className="w-full accent-accent"
  />
  <p className="mt-1 text-[10px] leading-snug text-gray-400">
    Nucleus sampling. Lower values focus on more likely tokens. Default 1.0.
  </p>
</div>

<div>
  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
    Frequency penalty: {draft.frequencyPenalty}
  </label>
  <input
    type="range"
    min={0}
    max={2}
    step={0.1}
    value={draft.frequencyPenalty}
    onChange={(e) =>
      setDraft((prev) => ({ ...prev, frequencyPenalty: Number(e.target.value) }))
    }
    className="w-full accent-accent"
  />
  <p className="mt-1 text-[10px] leading-snug text-gray-400">
    Penalizes repeated tokens. Higher = less repetition. Default 0.
  </p>
</div>
```

Also update `handleSave` to include the new fields:

```javascript
const handleSave = (e) => {
  e.preventDefault();
  onSave({
    // ...existing fields...
    temperature: Number.isFinite(Number(draft.temperature)) ? Number(draft.temperature) : 0.7,
    topP: Number.isFinite(Number(draft.topP)) ? Number(draft.topP) : 1.0,
    frequencyPenalty: Number.isFinite(Number(draft.frequencyPenalty)) ? Number(draft.frequencyPenalty) : 0,
  });
  setSaved(true);
  setTimeout(() => setSaved(false), 2000);
};
```

- [ ] **Step 3: Accept and use the parameters on the server**

In `server/controllers/chatController.js`, extract the new params in `streamChat`:

```javascript
const {
  message, sessionId, images, provider, hfToken, model, endpoint,
  visionModel, imageGenModel, maxTokens, systemPrompt,
  temperature, topP, frequencyPenalty,
} = req.body ?? {};
```

Pass them through as overrides. The simplest path: attach them to `hfConfig`. In `server/services/hfService.js`, update `HFConfigOverrides` typedef:

```javascript
/**
 * @typedef {Object} HFConfigOverrides
 * @property {string} [token]
 * @property {string} [model]
 * @property {string} [endpoint]
 * @property {string} [visionModel]
 * @property {string} [imageGenModel]
 * @property {string} [provider]
 * @property {number} [maxTokens]
 * @property {number} [temperature]
 * @property {number} [topP]
 * @property {number} [frequencyPenalty]
 */
```

Update `HFConfig` typedef similarly and include them in `resolveHFConfig`:

```javascript
const resolvedTemperature = Number.isFinite(Number(overrides.temperature))
  ? Number(overrides.temperature) : undefined;
const resolvedTopP = Number.isFinite(Number(overrides.topP))
  ? Number(overrides.topP) : undefined;
const resolvedFrequencyPenalty = Number.isFinite(Number(overrides.frequencyPenalty))
  ? Number(overrides.frequencyPenalty) : undefined;

return {
  // ...existing fields...
  temperature: resolvedTemperature,
  topP: resolvedTopP,
  frequencyPenalty: resolvedFrequencyPenalty,
};
```

In `chatController.js`, pass them to `resolveHFConfig`:

```javascript
hfConfig = resolveHFConfig({
  // ...existing fields...
  temperature: typeof temperature === 'number' ? temperature : undefined,
  topP: typeof topP === 'number' ? topP : undefined,
  frequencyPenalty: typeof frequencyPenalty === 'number' ? frequencyPenalty : undefined,
});
```

In `buildChatRequestBody` (hfService.js), use config values instead of hardcoded ones:

```javascript
function buildChatRequestBody(config, messages, overrides = {}) {
  const body = {
    model: config.model,
    messages,
    max_tokens: config.maxTokens,
    temperature: overrides.temperature ?? config.temperature ?? 0.5,
    top_p: config.topP,
    frequency_penalty: config.frequencyPenalty,
    stream: overrides.stream ?? false,
  };
  // Only include if defined (some APIs reject null/undefined values)
  if (body.top_p === undefined) delete body.top_p;
  if (body.frequency_penalty === undefined || body.frequency_penalty === 0) delete body.frequency_penalty;
  // ... rest unchanged
```

- [ ] **Step 4: Test manually**

Open the app. In Model Settings, adjust the temperature slider. Send a message. Verify in the server console log that the temperature value is being used. Try setting temperature to 0 — response should be very deterministic.

- [ ] **Step 5: Commit**

```bash
git add client/src/utils/modelSettings.js client/src/components/ModelSettings.jsx server/controllers/chatController.js server/services/hfService.js
git commit -m "feat: add temperature, top-p, and frequency penalty controls"
```

---

### Task 5: Message Edit and Regenerate — Server Side

**Files:**
- Modify: `server/services/sessionStore.js` (add `truncateAt` method)
- Modify: `server/controllers/chatController.js` (add `editMessage` and `regenerateLastResponse` handlers)
- Modify: `server/routes/chat.js` (add new routes)

**Interfaces:**
- Consumes: `sessionStore.getHistory()`, `sessionStore._ensure()`, `sessionStore._persist()`, `streamChat()` — existing
- Produces:
  - `sessionStore.truncateAt(sessionId: string, index: number): void` — truncates message history at `index` (keeps messages 0..index-1)
  - `POST /api/chat/edit` — body: `{ sessionId, messageIndex, newContent, ...modelSettings }` — returns SSE stream
  - `POST /api/chat/regenerate` — body: `{ sessionId, ...modelSettings }` — returns SSE stream

- [ ] **Step 1: Add truncateAt method to sessionStore.js**

In `server/services/sessionStore.js`, add this method after `clearMemory`:

```javascript
/**
 * Truncate message history at the given index (keeps messages 0..index-1).
 * Resets summarization state since the truncated messages may have been summarized.
 * @param {string} sessionId
 * @param {number} index
 */
truncateAt(sessionId, index) {
  const session = this._ensure(sessionId);
  if (index < 0 || index >= session.messages.length) return;
  session.messages = session.messages.slice(0, index);
  session.conversationSummary = '';
  session.longTermMemory = [];
  session.lastSummarizedIndex = 0;
  this._persist(sessionId);
}
```

- [ ] **Step 2: Add editMessage handler to chatController.js**

Add a new exported function in `server/controllers/chatController.js`:

```javascript
/**
 * Edit a user message and regenerate from that point.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function editMessage(req, res) {
  const { sessionId, messageIndex, newContent } = req.body ?? {};

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'sessionId is required' });
  }
  if (typeof messageIndex !== 'number' || messageIndex < 0) {
    return res.status(400).json({ error: 'messageIndex is required' });
  }
  const trimmed = typeof newContent === 'string' ? newContent.trim() : '';
  if (!trimmed) {
    return res.status(400).json({ error: 'newContent is required' });
  }

  const history = sessionStore.getHistory(sessionId);
  if (messageIndex >= history.length) {
    return res.status(400).json({ error: 'messageIndex out of range' });
  }

  sessionStore.truncateAt(sessionId, messageIndex);

  req.body = { ...req.body, message: trimmed };
  return streamChat(req, res);
}
```

- [ ] **Step 3: Add regenerateLastResponse handler to chatController.js**

```javascript
/**
 * Regenerate the last assistant response.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function regenerateLastResponse(req, res) {
  const { sessionId } = req.body ?? {};

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  const history = sessionStore.getHistory(sessionId);
  if (history.length < 2) {
    return res.status(400).json({ error: 'Not enough history to regenerate' });
  }

  const lastAssistantIndex = history.length - 1;
  if (history[lastAssistantIndex]?.role !== 'assistant') {
    return res.status(400).json({ error: 'Last message is not an assistant response' });
  }

  const lastUserMsg = history[lastAssistantIndex - 1];
  if (lastUserMsg?.role !== 'user') {
    return res.status(400).json({ error: 'Could not find the user message to regenerate from' });
  }

  sessionStore.truncateAt(sessionId, lastAssistantIndex);

  req.body = { ...req.body, message: lastUserMsg.content || '' };
  return streamChat(req, res);
}
```

- [ ] **Step 4: Add routes**

In `server/routes/chat.js`, add imports and routes:

```javascript
import { streamChat, getHistory, clearHistory, listSessions, healthCheck, editMessage, regenerateLastResponse } from '../controllers/chatController.js';

// Add after existing routes:
router.post('/chat/edit', editMessage);
router.post('/chat/regenerate', regenerateLastResponse);
```

**Important:** These new routes MUST be placed before `router.post('/chat', streamChat)` to avoid Express matching `/chat/edit` as a POST to `/chat`. Reorder the routes:

```javascript
router.get('/sessions', listSessions);
router.post('/chat/edit', editMessage);
router.post('/chat/regenerate', regenerateLastResponse);
router.post('/chat', streamChat);
router.get('/chat/:sessionId', getHistory);
router.delete('/chat', clearHistory);
router.get('/health', healthCheck);
```

- [ ] **Step 5: Test with curl**

```bash
# Start a conversation
curl -s -X POST http://localhost:3001/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"Hello my name is Parag","sessionId":"test-edit","provider":"local","model":"llama3.2"}'

# Check history
curl -s http://localhost:3001/api/chat/test-edit | python3 -m json.tool | head -20

# Regenerate
curl -s -X POST http://localhost:3001/api/chat/regenerate \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":"test-edit","provider":"local","model":"llama3.2"}'

# Edit message 0
curl -s -X POST http://localhost:3001/api/chat/edit \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":"test-edit","messageIndex":0,"newContent":"Hi, I am a developer","provider":"local","model":"llama3.2"}'
```

- [ ] **Step 6: Commit**

```bash
git add server/services/sessionStore.js server/controllers/chatController.js server/routes/chat.js
git commit -m "feat: server-side edit and regenerate endpoints"
```

---

### Task 6: Message Edit and Regenerate — Client Side

**Files:**
- Modify: `client/src/components/MessageBubble.jsx` (add edit/regenerate buttons and edit mode)
- Modify: `client/src/hooks/useChat.js` (add `editMessage` and `regenerateLastResponse` methods)

**Interfaces:**
- Consumes: `apiUrl()`, `toApiPayload()`, `sendMessage()` logic from `useChat` — existing
- Produces:
  - `useChat` return gains `editMessage(messageIndex: number, newContent: string): Promise<void>` and `regenerateLastResponse(): Promise<void>`
  - `<MessageBubble>` gains `onEdit`, `onRegenerate`, `isLast`, `isLoading` props

- [ ] **Step 1: Add editMessage and regenerateLastResponse to useChat.js**

In `client/src/hooks/useChat.js`, add after the `sendMessage` callback:

```javascript
const editMessage = useCallback(
  async (messageIndex, newContent) => {
    if (isLoading) return;
    const trimmed = newContent.trim();
    if (!trimmed) return;

    setError(null);
    setIsLoading(true);
    isSendingRef.current = true;

    // Truncate local messages and add the edited user message
    setMessages((prev) => {
      const kept = prev.slice(0, messageIndex);
      return [
        ...kept,
        { id: crypto.randomUUID(), role: 'user', content: trimmed },
        { id: crypto.randomUUID(), role: 'assistant', content: '', streaming: true, status: 'Editing…' },
      ];
    });

    const assistantId = crypto.randomUUID();
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      return prev.map((m) => (m === last ? { ...m, id: assistantId } : m));
    });
    activeAssistantIdRef.current = assistantId;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(apiUrl('/api/chat/edit'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          messageIndex,
          newContent: trimmed,
          systemPrompt,
          ...toApiPayload(modelSettings),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Edit failed (${res.status})`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m))
            );
            continue;
          }
          try {
            const parsed = JSON.parse(payload);
            if (parsed.token) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + parsed.token, status: undefined }
                    : m
                )
              );
            }
            if (parsed.message) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: parsed.message, metadata: parsed.metadata ?? m.metadata, status: undefined }
                    : m
                )
              );
            }
            if (parsed.status) {
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, status: parsed.status } : m))
              );
            }
          } catch { /* ignore malformed */ }
        }
      }

      await loadSessionList();
      isSendingRef.current = false;
      await loadHistory(sessionId);
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'Edit failed');
    } finally {
      isSendingRef.current = false;
      activeAssistantIdRef.current = null;
      setIsLoading(false);
    }
  },
  [isLoading, sessionId, modelSettings, systemPrompt, loadSessionList, loadHistory]
);

const regenerateLastResponse = useCallback(async () => {
  if (isLoading) return;

  setError(null);
  setIsLoading(true);
  isSendingRef.current = true;

  // Remove last assistant message and add a new streaming placeholder
  const assistantId = crypto.randomUUID();
  activeAssistantIdRef.current = assistantId;

  setMessages((prev) => {
    const withoutLast = prev.slice(0, -1);
    return [
      ...withoutLast,
      { id: assistantId, role: 'assistant', content: '', streaming: true, status: 'Regenerating…' },
    ];
  });

  abortRef.current?.abort();
  const controller = new AbortController();
  abortRef.current = controller;

  try {
    const res = await fetch(apiUrl('/api/chat/regenerate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        systemPrompt,
        ...toApiPayload(modelSettings),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Regenerate failed (${res.status})`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response stream');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m))
          );
          continue;
        }
        try {
          const parsed = JSON.parse(payload);
          if (parsed.token) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: m.content + parsed.token, status: undefined }
                  : m
              )
            );
          }
          if (parsed.message) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: parsed.message, metadata: parsed.metadata ?? m.metadata, status: undefined }
                  : m
              )
            );
          }
          if (parsed.status) {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, status: parsed.status } : m))
            );
          }
        } catch { /* ignore malformed */ }
      }
    }

    await loadSessionList();
    isSendingRef.current = false;
    await loadHistory(sessionId);
  } catch (err) {
    if (err.name === 'AbortError') return;
    setError(err.message || 'Regenerate failed');
  } finally {
    isSendingRef.current = false;
    activeAssistantIdRef.current = null;
    setIsLoading(false);
  }
}, [isLoading, sessionId, modelSettings, systemPrompt, loadSessionList, loadHistory]);
```

Add them to the return object:

```javascript
return {
  // ...existing...
  editMessage,
  regenerateLastResponse,
};
```

- [ ] **Step 2: Add edit/regenerate UI to MessageBubble.jsx**

Update `MessageBubble` to accept new props:

```javascript
export default function MessageBubble({ message, isDark, messageIndex, isLast, isLoading, onEdit, onRegenerate }) {
```

Add edit state at the top of the component:

```javascript
const [editing, setEditing] = useState(false);
const [editText, setEditText] = useState(message.content);
```

For user messages, add an edit button in the hover actions area. Add this block inside the outer `<div>` right after the bubble's `<div>`, visible on hover for user messages:

```jsx
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
```

When `editing` is true, replace the user message `<p>` with a textarea:

```jsx
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
) : /* ...existing assistant rendering... */
```

For the last assistant message, add a regenerate button after the existing action buttons:

```jsx
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
```

- [ ] **Step 3: Wire props through MessageList to MessageBubble**

In `client/src/components/MessageList.jsx`, pass the new props:

```jsx
{messages.map((msg, index) => (
  <MessageBubble
    key={msg.id}
    message={msg}
    isDark={isDark}
    messageIndex={index}
    isLast={index === messages.length - 1}
    isLoading={isLoading}
    onEdit={onEdit}
    onRegenerate={onRegenerate}
  />
))}
```

Update `MessageList` to accept `isLoading`, `onEdit`, `onRegenerate` props and pass them from `App.jsx`.

In `App.jsx`, pass the new methods:

```jsx
<MessageList
  messages={messages}
  isDark={isDark}
  isLoading={isLoading}
  onEdit={editMessage}
  onRegenerate={regenerateLastResponse}
/>
```

- [ ] **Step 4: Test manually**

Open the app. Send several messages. Hover over a user message — verify the "Edit" button appears. Click it, change the text, click "Save & resend" — verify the conversation is truncated and the model re-responds. On the last assistant message, verify "Regenerate" appears and works.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/MessageBubble.jsx client/src/components/MessageList.jsx client/src/hooks/useChat.js client/src/App.jsx
git commit -m "feat: add message edit and regenerate UI"
```

---

### Task 7: Conversation Export and Import

**Files:**
- Create: `client/src/utils/export.js`
- Modify: `client/src/components/ChatHistoryList.jsx` (add export button per session)
- Modify: `client/src/components/Sidebar.jsx` (add import button)
- Modify: `server/controllers/chatController.js` (add import handler)
- Modify: `server/routes/chat.js` (add import route)
- Modify: `server/services/sessionStore.js` (add importSession method)

**Interfaces:**
- Consumes: `apiUrl()`, `sessionStore._ensure()`, `sessionStore._persist()` — existing
- Produces:
  - `exportSessionAsJson(sessionId: string): Promise<void>` — downloads JSON file
  - `exportSessionAsMarkdown(sessionId: string): Promise<void>` — downloads MD file
  - `importSessionFromFile(file: File): Promise<string>` — uploads and returns new sessionId
  - `sessionStore.importSession(data: object): string` — creates session from imported data, returns sessionId
  - `POST /api/chat/import` — body: session JSON, returns `{ sessionId }`

- [ ] **Step 1: Create client/src/utils/export.js**

```javascript
import { apiUrl } from './api.js';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function sanitizeFilename(title) {
  return (title || 'chat').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
}

export async function exportSessionAsJson(sessionId) {
  const res = await fetch(apiUrl(`/api/chat/${sessionId}`));
  if (!res.ok) throw new Error('Failed to load session');
  const data = await res.json();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `${sanitizeFilename(data.title)}.json`);
}

export async function exportSessionAsMarkdown(sessionId) {
  const res = await fetch(apiUrl(`/api/chat/${sessionId}`));
  if (!res.ok) throw new Error('Failed to load session');
  const data = await res.json();

  let md = `# ${data.title || 'Chat'}\n\n`;
  for (const msg of data.history || []) {
    const role = msg.role === 'user' ? '**You**' : '**Assistant**';
    md += `${role}:\n${msg.content || ''}\n\n---\n\n`;
  }

  const blob = new Blob([md], { type: 'text/markdown' });
  downloadBlob(blob, `${sanitizeFilename(data.title)}.md`);
}

export async function importSessionFromFile(file) {
  const text = await file.text();
  const data = JSON.parse(text);

  const res = await fetch(apiUrl('/api/chat/import'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Import failed');
  }

  const result = await res.json();
  return result.sessionId;
}
```

- [ ] **Step 2: Add importSession to sessionStore.js**

In `server/services/sessionStore.js`, add a method:

```javascript
/**
 * Import a session from external data. Assigns a new ID.
 * @param {{ title?: string, history?: SessionMessage[], systemPrompt?: string }} data
 * @returns {string} the new sessionId
 */
importSession(data) {
  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();
  this.sessions.set(sessionId, {
    id: sessionId,
    title: data.title || 'Imported chat',
    createdAt: now,
    updatedAt: now,
    messages: Array.isArray(data.history) ? data.history : [],
    conversationSummary: '',
    longTermMemory: [],
    lastSummarizedIndex: 0,
    systemPrompt: typeof data.systemPrompt === 'string' ? data.systemPrompt : '',
  });
  this._persist(sessionId);
  return sessionId;
}
```

Add `import crypto from 'crypto';` at the top of the file (or use `import { randomUUID } from 'crypto'`). Actually, Node.js has `crypto.randomUUID()` globally available since v19. Check if the file already imports crypto — it doesn't. Use the global:

```javascript
const sessionId = globalThis.crypto?.randomUUID?.() || `imported-${Date.now()}`;
```

- [ ] **Step 3: Add import handler and route**

In `server/controllers/chatController.js`:

```javascript
/**
 * Import a conversation from JSON.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export function importSession(req, res) {
  const data = req.body;
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Invalid import data' });
  }

  try {
    const sessionId = sessionStore.importSession(data);
    res.json({ success: true, sessionId });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Import failed' });
  }
}
```

In `server/routes/chat.js`, add:

```javascript
import { streamChat, getHistory, clearHistory, listSessions, healthCheck, editMessage, regenerateLastResponse, importSession } from '../controllers/chatController.js';

router.post('/chat/import', importSession);
```

Place this route alongside the other `/chat/*` routes (before the base `/chat` POST).

- [ ] **Step 4: Add export button to ChatHistoryList.jsx**

In `client/src/components/ChatHistoryList.jsx`, add import:

```javascript
import { exportSessionAsJson, exportSessionAsMarkdown } from '../utils/export.js';
```

Add an export dropdown next to the delete button for each session. Add a state for tracking which session's export menu is open:

```javascript
import { useState } from 'react';
// ... at top of component:
const [exportOpen, setExportOpen] = useState(null);
```

Add export buttons next to the delete button:

```jsx
<div className="relative flex items-start gap-0.5">
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      setExportOpen(exportOpen === session.id ? null : session.id);
    }}
    disabled={disabled}
    className="rounded p-1 text-gray-400 opacity-0 transition hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100 dark:hover:bg-gray-700"
    title="Export chat"
    aria-label={`Export ${session.title}`}
  >
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  </button>

  {exportOpen === session.id && (
    <div className="absolute right-0 top-7 z-10 rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-600 dark:bg-surface-dark">
      <button
        type="button"
        onClick={() => { exportSessionAsJson(session.id); setExportOpen(null); }}
        className="block w-full px-3 py-1 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        Export as JSON
      </button>
      <button
        type="button"
        onClick={() => { exportSessionAsMarkdown(session.id); setExportOpen(null); }}
        className="block w-full px-3 py-1 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        Export as Markdown
      </button>
    </div>
  )}

  {/* existing delete button */}
  <button ...>
```

- [ ] **Step 5: Add import button to Sidebar.jsx**

In `client/src/components/Sidebar.jsx`, add an import button below "New chat" and above the chat history list. Add `onImport` prop:

```jsx
// Add to destructured props: onImport
// Add a hidden file input and import button:

<div className="mt-2">
  <input
    ref={importRef}
    type="file"
    accept=".json"
    className="hidden"
    onChange={async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const newId = await onImport(file);
        if (newId) onSelectSession(newId);
      } catch (err) {
        console.error('Import failed:', err);
      }
      if (importRef.current) importRef.current.value = '';
    }}
  />
  <button
    type="button"
    onClick={() => importRef.current?.click()}
    disabled={chatBusy}
    className="flex w-full items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium transition hover:bg-white disabled:opacity-50 dark:border-gray-600 dark:hover:bg-surface-dark"
  >
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
    Import chat
  </button>
</div>
```

Add `useRef` import and `const importRef = useRef(null);` in the component.

In `App.jsx`, pass the import handler:

```jsx
import { importSessionFromFile } from './utils/export.js';

// Inside App:
const handleImport = async (file) => {
  const newId = await importSessionFromFile(file);
  selectSession(newId);
  return newId;
};

<Sidebar
  ...
  onImport={handleImport}
/>
```

- [ ] **Step 6: Test manually**

Open the app. Start a conversation with a few messages. Click the export icon on the session — export as JSON. Start a new chat. Click "Import chat" and select the exported file. Verify the conversation is restored.

- [ ] **Step 7: Commit**

```bash
git add client/src/utils/export.js client/src/components/ChatHistoryList.jsx client/src/components/Sidebar.jsx client/src/App.jsx server/controllers/chatController.js server/routes/chat.js server/services/sessionStore.js
git commit -m "feat: add conversation export (JSON/Markdown) and import"
```

---

### Task 8: Multi-Model Compare

**Files:**
- Create: `client/src/components/CompareView.jsx`
- Modify: `client/src/components/ChatInput.jsx` (add compare toggle and second model input)
- Modify: `client/src/hooks/useChat.js` (add `sendCompare` method)
- Modify: `client/src/components/MessageList.jsx` (render CompareView for compare messages)
- Modify: `server/controllers/chatController.js` (add `compareChat` handler)
- Modify: `server/routes/chat.js` (add compare route)

**Interfaces:**
- Consumes: `chat()` from `hfService.js`, `resolveHFConfig()`, `sessionStore`, SSE utils — existing
- Produces:
  - `POST /api/chat/compare` — body: `{ message, sessionId, model2, ...settings }` — SSE stream with `{model: string}` labels on each event
  - `useChat` return gains `sendCompare(text: string, model2: string): Promise<void>`
  - `<CompareView responses={[{model, content}]} onKeep={fn} />` — new component

- [ ] **Step 1: Add compare handler on the server**

In `server/controllers/chatController.js`, add:

```javascript
/**
 * Compare responses from two models side-by-side.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function compareChat(req, res) {
  const {
    message, sessionId, model2, provider, hfToken, model, endpoint,
    visionModel, imageGenModel, maxTokens, systemPrompt,
    temperature, topP, frequencyPenalty,
  } = req.body ?? {};

  const trimmed = typeof message === 'string' ? message.trim() : '';
  if (!trimmed) return res.status(400).json({ error: 'message is required' });
  if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
  if (!model2 || typeof model2 !== 'string') return res.status(400).json({ error: 'model2 is required' });

  let config1, config2;
  try {
    const base = {
      provider: typeof provider === 'string' ? provider.trim() : undefined,
      token: typeof hfToken === 'string' ? hfToken.trim() : undefined,
      endpoint: typeof endpoint === 'string' ? endpoint.trim() : undefined,
      visionModel: typeof visionModel === 'string' ? visionModel.trim() : undefined,
      imageGenModel: typeof imageGenModel === 'string' ? imageGenModel.trim() : undefined,
      maxTokens: maxTokens !== undefined ? Number(maxTokens) : undefined,
      temperature: typeof temperature === 'number' ? temperature : undefined,
      topP: typeof topP === 'number' ? topP : undefined,
      frequencyPenalty: typeof frequencyPenalty === 'number' ? frequencyPenalty : undefined,
    };
    config1 = resolveHFConfig({ ...base, model: typeof model === 'string' ? model.trim() : undefined });
    config2 = resolveHFConfig({ ...base, model: model2.trim() });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  sessionStore.appendMessage(sessionId, { role: 'user', content: trimmed });
  const fullHistory = sessionStore.getHistory(sessionId);
  const history = fullHistory.slice(0, -1);

  const sessionSystemPrompt = sessionStore.getSystemPrompt(sessionId) || (typeof systemPrompt === 'string' ? systemPrompt.trim() : '');

  initSSE(res);
  sendStatus(res, 'Comparing models…');

  const sendModelToken = (modelLabel, token) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ model: modelLabel, token })}\n\n`);
      res.flush?.();
    }
  };

  const responses = { model1: '', model2: '' };

  try {
    await Promise.all([
      chat(history, trimmed, config1, [], {
        onToken: (t) => { responses.model1 += t; sendModelToken(config1.model, t); },
      }).then((r) => { responses.model1 = r.text || responses.model1; }),
      chat(history, trimmed, config2, [], {
        onToken: (t) => { responses.model2 += t; sendModelToken(config2.model, t); },
      }).then((r) => { responses.model2 = r.text || responses.model2; }),
    ]);

    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({
        compare: true,
        responses: [
          { model: config1.model, content: responses.model1 },
          { model: config2.model, content: responses.model2 },
        ],
      })}\n\n`);
    }

    sendDone(res);
  } catch (error) {
    if (!res.writableEnded) {
      sendError(res, error.message);
      sendDone(res);
    }
  }
}
```

Add the required imports at the top of `chatController.js`:

```javascript
import { chat, resolveHFConfig } from '../services/hfService.js';
```

Wait — `resolveHFConfig` is already imported via the `hfService.js` destructured import. And `chat` is too. Check the existing import line:

```javascript
import { chat, getFallbackResponse, resolveHFConfig } from '../services/hfService.js';
```

Good — already imported.

Add the route in `server/routes/chat.js`:

```javascript
import { streamChat, getHistory, clearHistory, listSessions, healthCheck, editMessage, regenerateLastResponse, importSession, compareChat } from '../controllers/chatController.js';

router.post('/chat/compare', compareChat);
```

Place this before the base `/chat` POST.

- [ ] **Step 2: Create CompareView.jsx**

Create `client/src/components/CompareView.jsx`:

```jsx
import MarkdownContent from './MarkdownContent.jsx';

/**
 * @param {{
 *   responses: Array<{ model: string, content: string }>,
 *   onKeep: (index: number) => void,
 *   isDark: boolean,
 *   streaming: boolean,
 * }} props
 */
export default function CompareView({ responses, onKeep, isDark, streaming }) {
  return (
    <div className="flex w-full gap-3">
      {responses.map((r, i) => (
        <div
          key={r.model}
          className="flex-1 min-w-0 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-surface-dark"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              {r.model}
            </span>
            {!streaming && (
              <button
                type="button"
                onClick={() => onKeep(i)}
                className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white transition hover:bg-accent-hover"
              >
                Keep this
              </button>
            )}
          </div>
          {r.content ? (
            <MarkdownContent content={r.content} isDark={isDark} />
          ) : (
            <p className="text-sm text-gray-400 italic">Generating…</p>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Add compare toggle to ChatInput.jsx**

In `client/src/components/ChatInput.jsx`, add props: `compareMode`, `onToggleCompare`, `compareModel`, `onCompareModelChange`.

Add a compare toggle button next to the send button. When compare mode is active, show a second model input:

```jsx
// Add before the send button:
<button
  type="button"
  onClick={onToggleCompare}
  disabled={disabled || !configured}
  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition ${
    compareMode
      ? 'bg-accent text-white'
      : 'text-gray-500 hover:bg-white dark:hover:bg-surface-dark'
  } disabled:cursor-not-allowed disabled:opacity-40`}
  aria-label="Compare models"
  title="Compare two models"
>
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM21 16c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
  </svg>
</button>
```

Actually, let me use a better icon — a columns/split icon:

```jsx
<button
  type="button"
  onClick={onToggleCompare}
  disabled={disabled || !configured}
  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition ${
    compareMode
      ? 'bg-accent text-white'
      : 'text-gray-500 hover:bg-white dark:hover:bg-surface-dark'
  } disabled:cursor-not-allowed disabled:opacity-40`}
  aria-label="Compare models"
  title="Compare two models side-by-side"
>
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
  </svg>
</button>
```

When compare mode is on, show a model-2 input above the main form:

```jsx
{compareMode && (
  <div className="mx-auto mb-2 max-w-3xl">
    <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
      Compare with model:
    </label>
    <input
      type="text"
      value={compareModel}
      onChange={(e) => onCompareModelChange(e.target.value)}
      placeholder="Enter second model name (e.g. meta-llama/Llama-3-8B-Instruct)"
      className="w-full rounded-lg border border-gray-200 bg-surface-secondary px-3 py-2 text-xs font-mono outline-none focus:border-accent dark:border-gray-700 dark:bg-surface-dark-secondary"
    />
  </div>
)}
```

Update `handleSubmit` to call compare when in compare mode:

```javascript
const handleSubmit = (e) => {
  e.preventDefault();
  if (isGenerating) return;
  const text = inputRef.current?.value ?? '';
  if (!text.trim() && attachments.length === 0) return;

  if (compareMode && onCompare) {
    onCompare(text, compareModel);
  } else {
    onSend(text, attachments);
  }
  if (inputRef.current) inputRef.current.value = '';
  setAttachments([]);
  setUploadError(null);
};
```

Add `onCompare` to the destructured props.

- [ ] **Step 4: Add sendCompare to useChat.js and wire state in App.jsx**

In `App.jsx`, add compare state:

```javascript
const [compareMode, setCompareMode] = useState(false);
const [compareModel, setCompareModel] = useState('');
```

In `useChat.js`, add `sendCompare`:

```javascript
const sendCompare = useCallback(
  async (text, model2) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading || !model2?.trim()) return;

    setError(null);
    setIsLoading(true);
    isSendingRef.current = true;

    const userMsg = { id: crypto.randomUUID(), role: 'user', content: trimmed };
    const compareMsg = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      streaming: true,
      status: 'Comparing models…',
      compare: true,
      compareResponses: [
        { model: modelSettings.model, content: '' },
        { model: model2.trim(), content: '' },
      ],
    };

    setMessages((prev) => [...prev, userMsg, compareMsg]);
    const compareId = compareMsg.id;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(apiUrl('/api/chat/compare'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          sessionId,
          model2: model2.trim(),
          systemPrompt,
          ...toApiPayload(modelSettings),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Compare failed (${res.status})`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') {
            setMessages((prev) =>
              prev.map((m) => (m.id === compareId ? { ...m, streaming: false, status: undefined } : m))
            );
            continue;
          }
          try {
            const parsed = JSON.parse(payload);
            if (parsed.model && parsed.token) {
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== compareId) return m;
                  const updated = (m.compareResponses || []).map((r) =>
                    r.model === parsed.model
                      ? { ...r, content: r.content + parsed.token }
                      : r
                  );
                  return { ...m, compareResponses: updated, status: undefined };
                })
              );
            }
            if (parsed.compare && parsed.responses) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === compareId
                    ? { ...m, compareResponses: parsed.responses, streaming: false }
                    : m
                )
              );
            }
            if (parsed.status) {
              setMessages((prev) =>
                prev.map((m) => (m.id === compareId ? { ...m, status: parsed.status } : m))
              );
            }
          } catch { /* ignore */ }
        }
      }

      await loadSessionList();
      isSendingRef.current = false;
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'Compare failed');
    } finally {
      isSendingRef.current = false;
      activeAssistantIdRef.current = null;
      setIsLoading(false);
    }
  },
  [isLoading, sessionId, modelSettings, systemPrompt, loadSessionList]
);
```

Add a `keepCompareResponse` method to select a winner and persist it:

```javascript
const keepCompareResponse = useCallback(
  async (messageId, responseIndex) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId || !m.compareResponses) return m;
        const kept = m.compareResponses[responseIndex];
        return {
          ...m,
          content: kept?.content || '',
          compare: false,
          compareResponses: undefined,
          metadata: { ...(m.metadata || {}), comparedWith: m.compareResponses.map((r) => r.model) },
        };
      })
    );
    // Reload from server to sync — the server stored the user message already
    // We just need to store the chosen assistant message
    const msg = messages.find((m) => m.id === messageId);
    if (msg?.compareResponses?.[responseIndex]) {
      await fetch(apiUrl('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: '',
          sessionId,
          keepResponse: msg.compareResponses[responseIndex].content,
        }),
      }).catch(() => {});
    }
  },
  [messages, sessionId]
);
```

Actually, the keep logic is simpler: the compare endpoint didn't store an assistant message. We can just call `sessionStore.appendMessage` via a small endpoint, or handle it more simply by having the compare endpoint NOT store the assistant message, and then the client calls the regular chat endpoint or a new "keep" endpoint. Let's keep it simple — add a `POST /api/chat/keep` endpoint:

In `server/controllers/chatController.js`:

```javascript
/**
 * Store a chosen response from a compare operation.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export function keepResponse(req, res) {
  const { sessionId, content } = req.body ?? {};
  if (!sessionId || typeof content !== 'string') {
    return res.status(400).json({ error: 'sessionId and content required' });
  }
  sessionStore.appendMessage(sessionId, { role: 'assistant', content });
  res.json({ success: true });
}
```

Add route: `router.post('/chat/keep', keepResponse);`

Update the client `keepCompareResponse`:

```javascript
const keepCompareResponse = useCallback(
  async (messageId, responseIndex) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId || !m.compareResponses) return m;
        const kept = m.compareResponses[responseIndex];
        return {
          ...m,
          content: kept?.content || '',
          compare: false,
          compareResponses: undefined,
        };
      })
    );

    const msg = messages.find((m) => m.id === messageId);
    const kept = msg?.compareResponses?.[responseIndex];
    if (kept) {
      await fetch(apiUrl('/api/chat/keep'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, content: kept.content }),
      }).catch(() => {});
    }
  },
  [messages, sessionId]
);
```

Return both from useChat:

```javascript
return {
  // ...existing...
  sendCompare,
  keepCompareResponse,
};
```

- [ ] **Step 5: Render CompareView in MessageBubble/MessageList**

In `MessageBubble.jsx`, detect compare mode and render `CompareView`:

Add import:

```javascript
import CompareView from './CompareView.jsx';
```

In the rendering logic, before the normal assistant rendering, check for compare:

```jsx
{!isUser && message.compare && message.compareResponses ? (
  <CompareView
    responses={message.compareResponses}
    onKeep={(i) => onKeepCompare(message.id, i)}
    isDark={isDark}
    streaming={message.streaming}
  />
) : /* existing rendering */}
```

Add `onKeepCompare` to the `MessageBubble` props and thread it through from `MessageList` and `App.jsx`.

- [ ] **Step 6: Wire everything in App.jsx**

Pass compare props to `ChatInput`:

```jsx
<ChatInput
  ...existing props...
  compareMode={compareMode}
  onToggleCompare={() => setCompareMode((p) => !p)}
  compareModel={compareModel}
  onCompareModelChange={setCompareModel}
  onCompare={sendCompare}
/>
```

Pass `onKeepCompare` to `MessageList`:

```jsx
<MessageList
  ...
  onKeepCompare={keepCompareResponse}
/>
```

- [ ] **Step 7: Test manually**

Open the app. Click the compare toggle (columns icon) next to the send button. Enter a second model name. Send a message. Verify both responses appear side-by-side. Click "Keep this" on one — verify it becomes the canonical response.

- [ ] **Step 8: Commit**

```bash
git add client/src/components/CompareView.jsx client/src/components/ChatInput.jsx client/src/components/MessageBubble.jsx client/src/components/MessageList.jsx client/src/hooks/useChat.js client/src/App.jsx server/controllers/chatController.js server/routes/chat.js
git commit -m "feat: add multi-model compare with side-by-side responses"
```
