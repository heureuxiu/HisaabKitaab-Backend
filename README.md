# Hisaab Kitaab backend

Express + MongoDB. Every user has their own account and their own data.

## Run it

```
cp .env.example .env      # then fill in MONGODB_URI and JWT_SECRET
npm install
npm start
npm test                  # runs on an in-memory store, no database needed
```

MongoDB Atlas: Network Access must allow the server's address (Render's free plan has no fixed address,
so Atlas needs `0.0.0.0/0`; keep the database password strong). On Render set `MONGODB_URI`, `MONGODB_DB`
and `JWT_SECRET` as environment variables, never in the code.

## Folder structure

```
backend/
  src/
    index.js              starts the server (checks settings, connects to MongoDB, listens)
    app.js                builds the Express app and wires everything together
    config/               environment variables, read in one place
    constants/            fixed lists (entry types and categories)
    db/
      mongo.js            MongoDB store (used in real runs)
      memory.js           in-memory store with the same methods (used by tests)
    middleware/           login guard, 404 and error handling
    routes/               one file per URL group: auth, entries, reports, budgets, settings, vault
    services/             the real logic: passwords and tokens, savings vault, summaries, email
    utils/                small helpers: errors, input checks, rate limiter
  tests/                  run with `npm test`
  .env / .env.example     settings
```

A new feature usually means: a method in both `db/` files, logic in a `services/` file, a URL in `routes/`, and a test.

## Accounts

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/signup` | `{name, email, password}` (password 8+ characters) returns `{token, user}` |
| POST | `/auth/login` | `{email, password}` returns `{token, user}` |
| POST | `/auth/guest` | account without an email; no way to log back in later |
| GET | `/auth/me` | who am I (needs token) |

All `/api` routes need `Authorization: Bearer <token>` and only ever touch that user's rows.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health`, `/api/ping` | liveness check (no login) |
| GET | `/api/entries?month=2026-11` | entries for a month |
| POST | `/api/entries` | `{type, category, amount, date, note}` |
| PUT / DELETE | `/api/entries/:id` | edit / delete |
| GET | `/api/summary?month=` | income, saved, spent, remaining, byCategory |
| GET | `/api/history?month=&months=6` | month totals, oldest first |
| GET / PUT | `/api/budgets` | `{ "food": 20000 }`, 0 or null removes a limit |
| GET / PUT | `/api/settings` | `{ "savingsTarget": 40000 }` |
| GET | `/api/vault?from=2026-06-01` | savings vault balance and history |
| POST / PUT / DELETE | `/api/vault/moves(/:id)` | add or use savings by hand |

`type` is `income`, `savings` or `expense`. Amounts are whole rupees. Category ids are in `src/constants/categories.js`.


## Testing against real MongoDB

`MONGODB_TEST_URI="mongodb+srv://..." npm test` also runs the store checks on a throwaway database.

## Forgot password and Google sign-in

- `POST /auth/forgot {email}` sends a 6-digit code (valid 15 min, 5 wrong tries then locked). `POST /auth/reset {email, code, password}` sets the new password and logs in.
  Set `RESEND_API_KEY` to send real emails. Without it, the code is printed in this server's console.
- `POST /auth/google {idToken}` needs `GOOGLE_CLIENT_IDS` (comma-separated OAuth client IDs). The app side needs
  `npx expo install expo-auth-session expo-web-browser expo-crypto` and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (plus Android/iOS ones) in `app/.env`.
