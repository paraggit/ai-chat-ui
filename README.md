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

### HTTPS (self-signed SSL)

Generate a local certificate and run both frontend and backend over HTTPS:

```bash
npm run certs:generate   # one-time (or re-run to recreate)
npm run dev:ssl
```

- Frontend: https://localhost:5173
- Backend API: https://localhost:3001

Your browser will warn that the certificate is self-signed — that is expected for local dev. Proceed to accept it (Advanced → Continue).

For production with SSL, set in `.env`:

```env
SSL_ENABLED=true
SSL_KEY_PATH=./certs/key.pem
SSL_CERT_PATH=./certs/cert.pem
CLIENT_ORIGIN=https://your-domain.com
```

Then:

```bash
npm run build
npm run start:ssl
```

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
   - **Model ID** — e.g. `Qwen/Qwen2.5-7B-Instruct`
   - **Custom endpoint** — optional deployed Inference Endpoint URL
   - **Vision model** — e.g. `Salesforce/blip-vqa-base` (for uploaded images)
   - **Image generation model** — e.g. `stabilityai/stable-diffusion-2-1`

   Settings are saved in `localStorage` and sent with each chat request.

2. **Server environment** — Set `HF_TOKEN`, `HF_MODEL`, and optionally `HF_API_BASE` in `.env` as fallbacks when the UI does not provide values.

### Hugging Face token requirements

Hugging Face retired the legacy `api-inference.huggingface.co` endpoint. This app uses **Inference Providers** via `router.huggingface.co`.

Your token must be a **fine-grained token** with **"Make calls to Inference Providers"** enabled:

https://huggingface.co/settings/tokens

If chat fails with `404 File Not Found`, update your **Model ID** in sidebar settings to a supported model (default: `Qwen/Qwen2.5-7B-Instruct`).

## Image Chat

### Upload images (vision)

- Click the **image icon** in the chat input to attach up to 4 images (JPEG, PNG, GIF, WebP, max 5 MB each).
- Add a question like “What is in this image?” or send image-only (auto-prompt: describe the image).
- Uses the **Vision model** from settings (default: `Salesforce/blip-vqa-base`).

### Generate images in responses

Ask the model to create an image using natural language or a slash command:

- `generate an image of a cat on the moon`
- `/image a futuristic city at night`
- `/draw a watercolor landscape`

Uses the **Image generation model** from settings (default: `stabilityai/stable-diffusion-2-1`). Generated images appear inline in the assistant message.

## Environment Variables

| Variable        | Required | Default                              | Description                    |
|-----------------|----------|--------------------------------------|--------------------------------|
| `HF_TOKEN`      | No*     | —                                    | Server fallback API token      |
| `HF_MODEL`      | No       | `Qwen/Qwen2.5-7B-Instruct` | Text chat model ID             |
| `HF_VISION_MODEL` | No     | `Salesforce/blip-vqa-base`           | Vision / image Q&A model       |
| `HF_IMAGE_GEN_MODEL` | No  | `stabilityai/stable-diffusion-2-1` | Text-to-image model            |
| `HF_TIMEOUT_MS` | No       | `15000`                              | API request timeout (ms)       |
| `PORT`          | No       | `3001`                               | Server port                    |
| `CLIENT_ORIGIN` | No       | `http://localhost:5173`              | CORS allowed origin            |
| `SSL_ENABLED`   | No       | `false`                              | Enable HTTPS with local certs  |
| `SSL_KEY_PATH`  | No       | `./certs/key.pem`                    | TLS private key path           |
| `SSL_CERT_PATH` | No       | `./certs/cert.pem`                   | TLS certificate path           |

\*Required either in the UI settings or as `HF_TOKEN` in `.env`.

### Custom Inference Endpoint

To use a **dedicated Hugging Face Inference Endpoint** (e.g. `https://xxx.us-east-1.aws.endpoints.huggingface.cloud`):

1. Paste the full endpoint URL in **Custom endpoint** in sidebar settings
2. Set **Model ID** to your deployed model name (for OpenAI-compatible requests)
3. Use a token with access to that endpoint
4. **Wait 1–3 minutes** on cold start — the UI shows status updates while the model loads

The app automatically tries multiple API formats against your endpoint (`/v1/chat/completions`, TGI `inputs`, `/generate`).

Vision and image generation still use the public Inference Providers router (not your LLM endpoint).

## API Reference

### POST `/api/chat` — Stream a message (SSE)

**Request:**

```json
{
  "message": "What is in this image?",
  "sessionId": "abc123",
  "images": ["data:image/png;base64,..."],
  "hfToken": "hf_...",
  "model": "Qwen/Qwen2.5-7B-Instruct",
  "visionModel": "Salesforce/blip-vqa-base",
  "imageGenModel": "stabilityai/stable-diffusion-2-1"
}
```

**Response:** `text/event-stream`

```
data: {"token":"Hello"}
data: {"token":" there"}
data: {"image":"data:image/png;base64,..."}
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
