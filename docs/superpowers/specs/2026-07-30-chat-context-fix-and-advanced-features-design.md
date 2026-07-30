# AI Chat UI: Context Fix & Advanced Features

**Date:** 2026-07-30
**Approach:** Incremental fix (Approach A) — fix context system in place, add features one by one

## 1. Context Fix (Full Conversation Memory)

### Problem

The context manager drops messages too aggressively. `DEFAULT_MAX_RECENT = 16` and `DEFAULT_MAX_CONTEXT_TOKENS = 8192` combined with a high summarization threshold (`DEFAULT_SUMMARIZE_THRESHOLD = 20`) means the model loses context after just a few exchanges. The summarization can also fail silently, leaving no fallback.

### Solution

**Earlier, rolling summarization:**
- Lower `SUMMARIZE_THRESHOLD` from 20 to 8
- Every time unsummarized messages exceed the recent window, summarize the older chunk and merge into the running summary

**Provider-aware token budgets:**
- Add a `contextTokens` setting (separate from `maxTokens` which is output tokens)
- Defaults: 16384 for HF, 32768 for local models
- User-configurable in Model Settings

**Always include summary in system prompt:**
- `buildSystemPrompt()` always includes the conversation summary section when available
- Summary is never silently dropped during token trimming until all other trimming options are exhausted

**Reliable summarization:**
- Retry summarization once on failure before giving up
- Log clearly when summaries are skipped
- Never silently lose context

**Sliding window with overlap:**
- When trimming, keep the first user message plus the last N messages
- The model always sees how the conversation started

### Files Changed

- `server/services/contextManager.js` — lower thresholds, provider-aware budgets, overlap logic
- `server/services/memoryService.js` — retry on failure
- `server/services/promptService.js` — always include summary, accept custom system prompt
- `server/services/tokenCounter.js` — no changes needed

## 2. System Prompt Textbox

### UI

- Collapsible "System Prompt" textarea in the Sidebar, positioned above Model Settings
- Default value: `'You are a helpful AI assistant.'`
- Auto-saves on blur or after 500ms debounce
- Placeholder text guides the user on what to enter

### Data Flow

- Per-session: stored in `SessionData.systemPrompt` field in `sessionStore.js`
- New sessions inherit the last-used system prompt from `localStorage`
- Sent to server with each chat request via `systemPrompt` field in the API payload
- `promptService.js` uses the session's custom prompt instead of the hardcoded `SYSTEM_PROMPT` constant

### API Change

- `POST /api/chat` body: new optional `systemPrompt: string` field
- Server stores it in the session on first message and uses it for all subsequent prompts in that session
- `GET /api/chat/:sessionId` response: includes `systemPrompt` in session data

### Files Changed

- `client/src/components/Sidebar.jsx` — add SystemPrompt component
- `client/src/components/SystemPrompt.jsx` — new component (textarea with debounced save)
- `client/src/hooks/useChat.js` — pass systemPrompt through sendMessage
- `client/src/utils/modelSettings.js` — store/load last-used system prompt in localStorage
- `server/controllers/chatController.js` — accept and store systemPrompt
- `server/services/sessionStore.js` — add systemPrompt field to SessionData
- `server/services/promptService.js` — use session systemPrompt

## 3. Temperature / Top-p / Frequency Penalty Controls

### UI

- Three sliders added to the ModelSettings panel
- Temperature: range 0-2, step 0.1, default 0.7
- Top-p: range 0-1, step 0.05, default 1.0
- Frequency penalty: range 0-2, step 0.1, default 0

### Data Flow

- Stored in localStorage alongside existing model settings
- Passed through API payload with each chat request
- Server threads parameters through `buildChatRequestBody()` in `hfService.js`

### Files Changed

- `client/src/components/ModelSettings.jsx` — add slider inputs
- `client/src/utils/modelSettings.js` — add fields to settings schema
- `client/src/hooks/useModelSettings.js` — handle new fields
- `server/services/hfService.js` — accept and use temperature, topP, frequencyPenalty in request body

## 4. Conversation Export / Import

### Export

- Per-session export button in sidebar (on each chat history entry)
- "Export all" button at top of chat history section
- Two formats:
  - **JSON:** full session data (messages, metadata, system prompt, memory)
  - **Markdown:** human-readable transcript
- Implemented client-side using `Blob` and `URL.createObjectURL`

### Import

- File upload button in sidebar
- Accepts JSON format (the same format exported)
- Creates a new session from imported data via `POST /api/chat/import`

### Files Changed

- `client/src/components/ChatHistoryList.jsx` — add export buttons per session
- `client/src/components/Sidebar.jsx` — add import button, export-all button
- `client/src/utils/export.js` — new: export/import logic
- `server/controllers/chatController.js` — add import endpoint handler
- `server/routes/chat.js` — add `POST /api/chat/import` route

## 5. Message Edit / Regenerate

### Edit

- Edit icon on each user message bubble (visible on hover)
- Clicking turns the message content into an editable textarea
- On submit: conversation is truncated at that message index, edited text replaces the original, and a new chat request is sent from that point
- Cancel button to abandon the edit

### Regenerate

- Regenerate button on the last assistant message (visible on hover)
- Removes the last assistant response and re-sends the last user message
- Shows a loading state while regenerating

### API

- `POST /api/chat/edit` — body: `{ sessionId, messageIndex, newContent }`. Truncates history at `messageIndex`, replaces the user message, and triggers a new chat response.
- `POST /api/chat/regenerate` — body: `{ sessionId }`. Removes the last assistant message and re-runs the chat with the last user message.

### Files Changed

- `client/src/components/MessageBubble.jsx` — add edit/regenerate action buttons
- `client/src/hooks/useChat.js` — add `editMessage()` and `regenerateLastResponse()` methods
- `server/controllers/chatController.js` — add edit and regenerate handlers
- `server/routes/chat.js` — add new routes
- `server/services/sessionStore.js` — add `truncateAt()` method

## 6. Multi-Model Compare

### UI

- "Compare" toggle button in the chat input area (next to the send button)
- When active, a second model selector appears (dropdown of recently used models)
- Responses appear side-by-side in a split layout within the message area
- Each side is labeled with the model name
- User can click "Keep this" on either response to select it as the canonical reply for the conversation

### Data Flow

- Client sends to `POST /api/chat/compare` with `{ message, sessionId, model1, model2, ...settings }`
- Server runs two parallel `chat()` calls with different model configs
- Both streams are multiplexed over a single SSE connection with `model` labels in each event
- The "kept" response is stored in session history; the other is discarded

### Files Changed

- `client/src/components/ChatInput.jsx` — add compare toggle, second model selector
- `client/src/components/CompareView.jsx` — new: side-by-side response display
- `client/src/components/MessageBubble.jsx` — handle compare mode rendering
- `client/src/hooks/useChat.js` — add `sendCompare()` method
- `server/controllers/chatController.js` — add compare handler
- `server/routes/chat.js` — add `POST /api/chat/compare` route

## Implementation Order

1. **Context fix** — highest priority, fixes the core usability bug
2. **System prompt textbox** — quick win, high impact
3. **Temperature/top-p controls** — small addition to existing settings
4. **Message edit/regenerate** — significant UX improvement
5. **Conversation export/import** — useful but not blocking
6. **Multi-model compare** — most complex, built last
