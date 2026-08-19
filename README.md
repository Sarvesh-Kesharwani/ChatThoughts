# ChatThoughts

Situational mantras app. Passcode-gated. Supabase storage. DeepSeek-powered search + conflict detection.

## Stack

Next.js 15 App Router · TS · Tailwind · Supabase JS · AI SDK v6 + `@ai-sdk/deepseek` · JWT cookie auth.

## Env vars

| Key | Source |
|---|---|
| `APP_PASSCODE` | You pick |
| `AUTH_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project settings |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project settings (server-only, secret) |
| `DEEPSEEK_API_KEY` | https://platform.deepseek.com |
| `DEEPSEEK_MODEL` | DeepSeek model id, e.g. `deepseek-v4-flash` (default) |

Copy `.env.example` → `.env.local` and fill in.

## Setup

```bash
npm install

# 1. In Supabase SQL editor, run supabase/schema.sql
# 2. Fill .env.local
npm run dev
```

## Deploy (Vercel)

```bash
npm i -g vercel
vercel link
# Add each env var for production + preview + development:
vercel env add APP_PASSCODE
vercel env add AUTH_SECRET
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add DEEPSEEK_API_KEY

vercel --prod
```

## Routes

- `/login` — passcode gate
- `/` — dashboard (split: thoughts left, chat right)
- `/conflicts` — duplicate/conflict pairs + merge UI
- API: `/api/auth`, `/api/thoughts[/:id]`, `/api/search`, `/api/conflicts[/:id/resolve]`

## Schema

Two tables (`thoughts`, `conflicts`). RLS enabled, no public policies — service role only.
