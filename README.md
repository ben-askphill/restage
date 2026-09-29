# Restage

**Restage** is Ben Rosenberg's personal AI interior designer — a lightweight web app that re-decorates your real room (same architecture, same camera) and produces a shoppable furniture list for your region and budget.

## Features

- Upload a room photo (+ optional style references and floor plan)
- Upload photos of specific pieces (sofa, lamp, rug, …) to **replace** an existing item or **add** that object to the redesign
- Structured design brief with room analysis
- AI-powered re-decoration that preserves architecture
- Before/after comparison slider
- Design rationale and shopping list with retailer search terms
- In-place refinement ("warmer", "cheaper", etc.)
- Optional quality gate with one auto-retry
- Saved **My Styles** folders (inspiration images + derived profile)

## Tech stack

- **Next.js** (App Router) + TypeScript + Tailwind + shadcn/ui
- **Vercel AI SDK** via **Vercel AI Gateway**
- **Vercel Blob** for private image storage
- **Node.js runtime** (not Edge) with 300s function timeout for image generation

## Setup

### 1. Vercel AI Gateway

1. Create a [Vercel](https://vercel.com) project and enable [AI Gateway](https://vercel.com/docs/ai-gateway).
2. Copy your gateway API key for local development.
3. On Vercel deployments, prefer [OIDC authentication](https://vercel.com/docs/ai-gateway/authentication) instead of a static key.

### 2. Vercel Blob

1. In your Vercel project, create a [Blob store](https://vercel.com/docs/storage/vercel-blob).
2. Copy the `BLOB_READ_WRITE_TOKEN` for local development.

### 3. Environment variables

Copy `.env.example` to `.env.local` and fill in:

```bash
cp .env.example .env.local
```

| Variable | Description | Default |
|----------|-------------|---------|
| `OWNER_PASSWORD` | Password for the Basic auth gate on every page and API route. **Required in production** (app returns 503 without it); optional locally | — |
| `OWNER_USER` | Username for the Basic auth gate | `owner` |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway API key (local dev) | — |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob read/write token | — |
| `DESIGNER_MODEL` | Vision + structured output LLM | `deepseek/deepseek-v4-flash-vision-exp` |
| `IMAGE_MODEL` | Image generation model | `google/gemini-3.1-flash-image` |

### 4. Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The UI loads without secrets — API routes return graceful 503 errors until `AI_GATEWAY_API_KEY` and `BLOB_READ_WRITE_TOKEN` are configured.

If `OWNER_PASSWORD` is set locally, the browser asks for the owner credentials once and reuses them for every API call.

### 5. Deploy to Vercel

```bash
vercel
```

Set the environment variables in your Vercel project settings, including `OWNER_PASSWORD`. Without it every production request returns 503, so a missing variable never leaves the app open. API routes use the Node.js runtime with `maxDuration = 300` for image generation.

## Access

Restage is single-owner. `src/proxy.ts` puts HTTP Basic auth (`OWNER_USER` / `OWNER_PASSWORD`) in front of every page and API route, and every route handler re-checks with `requireOwner()` from `src/lib/api.ts`, so a future matcher change can't silently expose a route. Unauthenticated API calls get `401`, and cross-site POST/DELETE requests get `403` so another site can't reuse cached credentials. All client fetches and images are same-origin, so the browser sends the credentials automatically after the first prompt.

## Architecture

### AI modules (`src/lib/ai/`)

| Module | Purpose |
|--------|---------|
| `analyze.ts` | Room photo + brief → structured room inventory |
| `plan.ts` | Inventory + keep list + optional piece photos → design strategy |
| `prompt.ts` | Design Brief → image instruction template |
| `render.ts` | Image instruction + room, style, and piece photos → rendered image (Blob URL) |
| `shopping.ts` | Design Brief + render → shopping list |
| `critique.ts` | Quality gate against Non-Negotiable Rules |

### API routes

| Route | Input | Output |
|-------|-------|--------|
| `POST /api/analyze` | Room images, optional floor plan, user brief | Room inventory JSON |
| `POST /api/plan` | Inventory, keep list, room photo, optional `styleId` and `pieceReferences` | Design Brief JSON |
| `POST /api/render` | Design Brief, room photo, style refs or `styleId`, optional `pieceReferences` | Render Blob URL |
| `POST /api/shopping-list` | Design Brief, render URL | Shopping List JSON |
| `POST /api/refine` | Current render, brief, instruction | Updated render |
| `GET /api/styles` | — | Saved style folder summaries |
| `POST /api/styles` | `{ name }` JSON | Create an empty style folder |
| `POST /api/styles/[id]/images` | `multipart/form-data` field `images` (files) | Append inspiration images; profile derivation is best-effort |

All JSON AI routes support `stream: true` for SSE progress updates. Style image uploads send the same flag as a form field.

### Piece references (replace vs add)

Object-level photos of a specific sofa, lamp, rug, etc. — not saved style folders. Each piece is prepared in the browser (same JPEG resize as other uploads) and sent as a data URL on plan/render/refine, like one-off style references.

- **Replace** swaps a named item already in the room for the photographed object (that item is removed from the keep list).
- **Add** places the photographed object in the redesign without removing something else.

### My Styles uploads

The manager resizes photos in the browser (max 2048px JPEG at ~0.85 quality) and uploads them as **multipart files**, not base64 JSON. That keeps phone photos under Vercel’s serverless request body limit. Images are stored on private Blob at `uploads/style/{id}/…` and served through `/api/blob`. A missing AI key does not block storing images — the derived profile stays empty until the gateway is configured.

## Models

Verified against [Vercel AI Gateway docs](https://vercel.com/docs/ai-gateway):

- **Designer:** `deepseek/deepseek-v4-flash-vision-exp` — vision + `generateObject` for structured output
- **Image:** `google/gemini-3.1-flash-image` — multimodal in, image out via `generateText` with `responseModalities: TEXT, IMAGE` → `result.files`

Swap models via environment variables without code changes.

## License

Private — personal project.
