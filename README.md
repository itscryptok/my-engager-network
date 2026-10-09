# My Engager Network (MEN)

**It's a MEN's world. Star my Engagers.**

A personal CRM for social-media engagers. Build your link list of top engagers across
TikTok, Instagram, YouTube and Facebook — add private notes for every engager, star them
whenever they impress you (no limit), rank and search by stars earned, and see who added
*you* to their list. Plus a private notepad that is never public.

## How it works

- Sign up / log in (email + password, bcrypt, DB-backed sessions).
- Pick a platform tab — every list, star, note and leaderboard is scoped to that platform.
- Add engagers by username. Clicking an engager first checks whether they claimed that
  handle on MEN: registered members open an **in-app profile** (their social links on
  every platform + total stars earned community-wide); everyone else links straight out
  to the real platform profile.
- Home shows your **Top 7 Most Starred Engagers** for the active platform.
- Claim your own handles under My Profile so others find your in-app profile.

## Stack

Node 20+ · Express · Prisma · PostgreSQL · vanilla JS frontend. No build step.

## Env

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string for the `men_db` database |
| `DB_ADMIN_URL` | Connection string to an existing DB on the same instance (build step creates `men_db` if missing) |
| `SESSION_SECRET` | (reserved) cookie/session signing |
| `SITE_URL` | Public URL, used for canonical/SEO tags |
| `PORT` | default 3000 |

## Deploy (Render, free sleepy web service)

Build command:

```
npm ci && npx prisma generate && node scripts/ensure-db.js && npx prisma migrate deploy
```

Start command: `node server.js`. Health check: `/api/health`.

The Postgres database lives as a separate `men_db` database on the shared paid
`emus-db` instance (Oregon) — no extra cost, no 30-day free-DB expiry.
