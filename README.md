# ChatThoughts

`ChatThoughts` is a personal note-recall app built on the BaseApp auth and sync foundation.

Included foundations:
- Layer 1 raw thought cards
- Layer 2 derived problem-solution cards linked back to their source thoughts
- Layer 3 API-key-based chat that retrieves relevant cards with source tracing
- Google sign-in and sign-out via Auth.js
- Google Drive `appDataFolder` sync for the persisted note graph
- Cookie-backed local state store with dirty/synced metadata

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
- `POST /api/wiki/chat`
