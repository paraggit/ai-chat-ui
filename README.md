# HF Chat Pro

A production-grade, ChatGPT-style AI chat application powered by Hugging Face Inference API. Features streaming responses (SSE), per-session conversation memory, and a modular backend designed for future SaaS scaling.

## Features

- **Streaming chat** — Real-time token-by-token UI updates via Server-Sent Events
- **Conversation memory** — Per-session history stored in-memory (Redis-ready interface)
- **Hugging Face integration** — Retry logic, timeouts, and graceful fallback responses
- **Modular backend** — Clean separation: routes → controllers → services
- **ChatGPT-like UI** — Sidebar, streaming messages, dark mode, markdown + code highlighting
- **Bonus** — Typing indicator, copy button, auto-scroll, session persistence

## Project Structure

```
hf-chat-pro/
├── server/
│   ├── app.js                    # Express app entry point
│   ├── routes/chat.js            # API routes
│   ├── controllers/chatController.js
│   ├── services/
│   │   ├── hfService.js          # Hugging Face API client
│   │   ├── sessionStore.js       # In-memory session store
│   │   └── promptService.js      # Prompt formatting
│   ├── middleware/rateLimit.js   # Basic rate limiting
│   └── utils/stream.js           # SSE streaming helpers
├── client/                       # React + Vite frontend
│   └── src/
│       ├── components/
│       ├── hooks/useChat.js
│       └── utils/
├── .env.example
└── package.json                  # npm workspaces root
```

## Prerequisites

- Node.js 18+
- A [Hugging Face API token](https://huggingface.co/settings/tokens)
- A model with Inference API access (or use a [custom Inference Endpoint](https://huggingface.co/docs/inference-endpoints/index))

## Quick Start (Development)

1. **Clone and install**

```bash
cd AIChat
cp .env.example .env
# Optional: set server-side defaults (UI settings override these per request)
# Edit .env if you want server defaults; otherwise configure in the app sidebar
npm install
```

2. **Start dev servers** (backend + frontend concurrently)

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

## Production

```bash
# Build frontend
npm run build

# Start production server (serves API + static frontend)
NODE_ENV=production npm run start
```

Set `CLIENT_ORIGIN` to your production domain in `.env`.

## Model Configuration

You can configure the Hugging Face connection in two ways:

1. **In the UI (recommended)** — Open **Model settings** in the left sidebar and enter:
   - **API key** — your Hugging Face token (`hf_...`)
   - **Model ID** — e.g. `mistralai/Mistral-7B-Instruct-v0.2`
   - **Custom endpoint** — optional deployed Inference Endpoint URL

   Settings are saved in `localStorage` and sent with each chat request.

2. **Server environment** — Set `HF_TOKEN`, `HF_MODEL`, and optionally `HF_API_BASE` in `.env` as fallbacks when the UI does not provide values.

## Environment Variables

| Variable        | Required | Default                              | Description                    |
|-----------------|----------|--------------------------------------|--------------------------------|
| `HF_TOKEN`      | No*     | —                                    | Server fallback API token      |
| `HF_MODEL`      | No       | `mistralai/Mistral-7B-Instruct-v0.2` | Model ID on HF Hub             |
| `HF_TIMEOUT_MS` | No       | `15000`                              | API request timeout (ms)       |
| `PORT`          | No       | `3001`                               | Server port                    |
| `CLIENT_ORIGIN` | No       | `http://localhost:5173`              | CORS allowed origin            |

\*Required either in the UI settings or as `HF_TOKEN` in `.env`.

### Custom Inference Endpoint

To use a deployed HF Inference Endpoint instead of the public API, set `HF_MODEL` to your endpoint URL path or modify `hfService.js` to point at your endpoint base URL.

## API Reference

### POST `/api/chat` — Stream a message (SSE)

**Request:**

```json
{
  "message": "Hello, how are you?",
  "sessionId": "abc123"
}
```

**Response:** `text/event-stream`

```
data: {"token":"Hello"}
data: {"token":" there"}
data: [DONE]
```

### GET `/api/chat/:sessionId` — Get conversation history

**Response:**

```json
{
  "sessionId": "abc123",
  "history": [
    { "role": "user", "content": "Hi" },
    { "role": "assistant", "content": "Hello!" }
  ]
}
```

### DELETE `/api/chat` — Clear session

**Request:**

```json
{ "sessionId": "abc123" }
```

### GET `/api/health` — Health check

## Example curl Commands

**Health check:**

```bash
curl http://localhost:3001/api/health
```

**Stream a chat message:**

```bash
curl -N -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"What is machine learning?","sessionId":"test-session-1"}'
```

**Get session history:**

```bash
curl http://localhost:3001/api/chat/test-session-1
```

**Clear session:**

```bash
curl -X DELETE http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test-session-1"}'
```

## Scalability Notes

The codebase is structured for easy upgrades:

| Current (V1)              | Future upgrade                          |
|---------------------------|-----------------------------------------|
| `MemorySessionStore`    | Redis-backed `SessionStore` interface   |
| Hugging Face Inference API| OpenAI, local vLLM, or custom endpoints |
| In-memory rate limiter    | Redis rate limiter middleware           |
| No auth                   | JWT / OAuth middleware                  |
| Single model              | Multi-model routing service             |

## License

MIT
