# Ledgero backend

Express + MongoDB. Every user has their own account and their own data.

## Run it

```
cp .env.example .env      # then fill in MONGODB_URI and CLERK_SECRET_KEY
npm install
npm start
npm test                  # runs on an in-memory store, no database needed
```

MongoDB Atlas: Network Access must allow the server's address (Render's free plan has no fixed address,
so Atlas needs `0.0.0.0/0`; keep the database password strong). On Render set `MONGODB_URI`, `MONGODB_DB`
and `CLERK_SECRET_KEY` as environment variables, never in the code.

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
    services/             the real logic: talking to Clerk, savings vault, summaries
    utils/                small helpers: errors, input checks
  tests/                  run with `npm test`
  .env / .env.example     settings
```

A new feature usually means: a method in both `db/` files, logic in a `services/` file, a URL in `routes/`, and a test.

## Accounts

Sign-up, login, password reset and Google sign-in are handled by [Clerk](https://clerk.com). The app gets a Clerk session
token and sends it as `Authorization: Bearer <token>`; this server checks it with `CLERK_SECRET_KEY`. The first time a
Clerk user calls the API, a matching user row is created (email and name are copied from Clerk).

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/auth/me` | who am I |
| DELETE | `/auth/me` | deletes the account, all its data and the Clerk login |
| POST | `/api/import` | a guest's ledger (kept on the phone) sent once when they create an account |

Guests have no server account: their ledger lives on the phone only.

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
