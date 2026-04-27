# BaseApp

`BaseApp` is a reusable Next.js starter cloned from FinFlow base layers.

Included foundations:
- Header with navigation and action buttons
- Google sign-in and sign-out via Auth.js
- Google Drive `appDataFolder` sync mechanism
- Cookie-backed local state store with dirty/synced metadata
- Sync API endpoints and a sample state module

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
