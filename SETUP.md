# Life of a Fish — Backend Setup

This project uses a Firebase project (`life-of-a-fish`) for community level
sharing. Config lives in `services/firebase-config.js`; security rules in
`firestore.rules`.

For local development you don't need to do anything — the app signs in
anonymously on startup and talks to the live Firestore. For deploying rules
and admin tasks, follow the steps below.

## Prerequisites

- Node 20+ and npm
- A Google account with Owner access to the `life-of-a-fish` Firebase project

## One-time setup

```bash
npm install -g firebase-tools
firebase login
firebase use life-of-a-fish
```

## Deploy Firestore rules

Whenever `firestore.rules` changes, redeploy:

```bash
firebase deploy --only firestore:rules
```

The CLI uses `firebase.json` to locate the rules file.

## Enable required services

In the Firebase console (once per project):

1. **Authentication** → Sign-in method → enable **Anonymous**.
2. **Firestore Database** → create in production mode, pick a region (eu-central recommended).
3. **App Check** (optional but strongly recommended before public launch):
   - Register the web app with reCAPTCHA v3.
   - Enable enforcement on Firestore.
   - Client-side App Check init lives in `services/firebase-backend.js` (TODO: wire in before public launch).

## Free-tier limits (Spark plan)

- Firestore: 50k reads / 20k writes / 20k deletes per day, 1 GB storage.
- Auth: unlimited anonymous/Google/Apple sign-ins (phone auth not free).
- Hosting: not used yet (we deploy via Vite `npm run build` → any static host).

If the game grows beyond Spark, upgrade to Blaze — the free grant stays the
same, so cost is $0 until you exceed it.

## Admin / moderation

V1 has no admin UI. To unflag or delete a community level, use the Firebase
console directly. Planned for #22 (Community Browser UI):

- Report threshold auto-hide (client-side filter by `reports` subcollection size).
- Dedicated admin page behind a hardcoded admin-uid list in Rules.

## Rotating / replacing config

If you ever need to swap to a different Firebase project, update
`services/firebase-config.js` — nothing else in the codebase references the
project directly.

## Swapping providers

The backend is accessed only through `services/backend.js`. To migrate to
Supabase / PocketBase / etc., implement the same shape and call
`setBackendImpl(yourImpl)` in place of `installFirebaseBackend()` in
`game.js`.
