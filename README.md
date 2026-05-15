# ChatThoughts

`ChatThoughts` is a private mantra-recall app built on the BaseApp auth foundation with Supabase-backed thought storage.

Included foundations:
- Passcode gate before the app can be entered
- Thought cards with `when will need this?` and `the mantra.`
- DeepSeek-powered top-3 mantra search that returns matching cards only
- Conflict capture for duplicate or contradictory thoughts
- Google sign-in and sign-out via Auth.js
- Google Drive `appDataFolder` sync foundation remains available for base state

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` from `.env.example` and fill values.

3. Run in clean mode:

```bash
npm run dev:fresh
```

## Environment Variables

- `AUTH_SECRET`
- `AUTH_URL` (local: `http://localhost:3000`)
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `CHATTHOUGHTS_PASSCODE`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_ANON_KEY`
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_MODEL` (defaults to `deepseek-v4-flash`)

Google OAuth must include:
- Authorized JavaScript origin: `http://localhost:3000`
- Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`

Drive scope used:
- `https://www.googleapis.com/auth/drive.appdata`

## Important Routes

- `GET/POST /api/auth/[...nextauth]`
- `POST /api/auth/cleanup`
- `GET/POST /api/base/state`
- `GET/POST/PUT /api/drive/sync`
- `POST /api/passcode`
- `GET/POST /api/thoughts`
- `GET /api/conflicts`
- `POST /api/conflicts/[id]/resolve`
- `POST /api/wiki/chat`

## Supabase

Apply `supabase/chatthoughts_schema.sql` to create:
- `chatthoughts.thoughts`
- `chatthoughts.thought_conflicts`

The app reads Supabase credentials only on the server.
The schema must be exposed through the Supabase Data API; `supabase/chatthoughts_schema.sql` sets `pgrst.db_schemas` to `public, chatthoughts`.
