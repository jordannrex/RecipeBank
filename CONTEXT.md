# RecipeBank — Project Context

> Living document for AI agents and developers. Update checkboxes and sections as features land.

## Project

RecipeBank — full-stack recipe management app

**Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS v4, PostgreSQL, Prisma, pgvector, OpenAI API

**PRD:** Full product spec covers auth, recipe bank, AI semantic search, meal calendar, shopping lists, URL import (blogs / Pinterest / TikTok), and multi-mode recipe page (view / edit / list / shopping).

---

## What's been built

### Scaffold (Phase 0) — complete

- [x] Next.js project with TypeScript, Tailwind v4, ESLint
- [x] App Router layout: `(auth)` routes (no nav) + `(app)` routes (with nav)
- [x] Placeholder pages: Home, Recipe Bank, Recipe detail, Calendar, Shopping List, Settings, Profile, Login, Register
- [x] Global navigation (`AppNav`) with desktop links + mobile drawer
- [x] Prisma schema — all PRD models (User, Session, Recipe, IngredientGroup, Ingredient, RecipeStep, RecipeNote, RecipeEdit, CookLog, MealPlan, ShoppingList, ShoppingItem + auth tokens)
- [x] Initial SQL migration with pgvector extension (`prisma/migrations/0001_init/`)
- [x] DB client singleton (`src/lib/db.ts`)
- [x] Auth utilities scaffold: password validation/hashing, JWT sign/verify (`src/lib/auth/`)
- [x] Embedding search helper + unit conversion / fraction display libs
- [x] Seed script with demo user + sample recipe
- [x] `.env.example`, `README.md`, health check route (`/api/health`)

### Auth & Account Settings — complete (Phase 1)

- [x] Register, login, logout UI
- [x] JWT via httpOnly cookie — token stored only as sha256 hash in DB (`sessions.tokenHash`); raw token travels only in signed JWT
- [x] `/api/auth/*` routes (register, login, logout, forgot-password, reset-password)
- [x] `withAuthHandler()` wrapper for API routes; `withAuth()` + `getCurrentUser()` for server components
- [x] Password reset flow (email delivery via native SMTP — see Known issues)
- [x] Account settings: update display name + avatar URL (`PATCH /api/user/profile`)
- [x] Change password (`POST /api/user/change-password`)
- [x] Schedule / cancel account deletion — 30-day grace period (`DELETE|POST /api/user/delete-account`)
- [x] Settings page (`/settings`) — profile, password, danger zone
- [x] Profile page (`/profile`) — read-only user info display

### Recipes — API complete, UI pending (Phase 2)

- [x] User model + full Recipe model (Prisma schema complete)
- [x] `GET /api/recipes` — paginated list with filters (q, favorites, cuisine, dishType, complexity)
- [x] `POST /api/recipes` — create recipe with nested ingredient groups + steps
- [x] `GET /api/recipes/[id]` — full recipe with all relations
- [x] `PATCH /api/recipes/[id]` — partial update; ingredient groups and steps replaced wholesale when provided; writes `RecipeEdit` rows for every changed field
- [x] `DELETE /api/recipes/[id]` — delete (cascades to all relations)
- [x] `PATCH /api/recipes/[id]/favorite` — toggles `isFavorite`; returns `{ id, isFavorite }`
- [x] `GET /api/recipes/[id]/notes` — list notes (newest first)
- [x] `POST /api/recipes/[id]/notes` — create a note (max 10 000 chars)
- [x] `DELETE /api/recipes/[id]/notes/[noteId]` — delete a note (ownership verified)
- [x] `GET /api/recipes/[id]/cook-log` — list cook log entries (newest first)
- [x] `POST /api/recipes/[id]/cook-log` — log a cook session; increments `cookCount`, updates `lastCookedAt`
- [x] `DELETE /api/recipes/[id]/cook-log/[logId]` — remove a log entry; recomputes `cookCount` + `lastCookedAt`
- [x] `GET /api/recipes/[id]/edits` — paginated edit history (cursor-based, newest first)
- [ ] Recipe UI: Recipe Bank grid, Recipe detail page — Phase 2
- [ ] Recipe import from URL — Phase 3
- [ ] AI embedding generation on import / edit — Phase 3
- [ ] Semantic search API (pgvector query wired at lib level only) — Phase 3

### Design system — complete (Phase 1 Styling)

- [x] Rowdies brand font loaded via `next/font/google` (`--font-rowdies` / `font-brand` utility)
- [x] CSS variable design tokens — light and dark values in `:root` / `.dark`; all mapped to Tailwind utilities via `@theme inline`
- [x] Brand colors: `brand-red` (#ff3131), `brand-pink` (#e8b8b8), `brand-black` (#000000), `brand-white` (#ffffff)
- [x] Semantic colors: `--background`, `--text`, `--banner`, `--highlight`, `--logo-accent`, `--logo-primary`
- [x] Dark mode: `.dark` class on `<html>`; localStorage persistence; anti-flash script in root layout
- [x] `<Logo />` — Rowdies wordmark, "Recipe" in brand-red, "Bank" in black/white per theme
- [x] `<Button />` — primary (brand-red fill) + secondary (outlined) + ghost variants
- [x] `<Input />` — with optional `label` prop; all colors via CSS vars
- [x] `<Label />` — CSS vars
- [x] `<Card />` — 16:9 photo slot; placeholder plate icon when no photo; CSS vars
- [x] `<Badge />` — brand-pink pill; CSS vars
- [x] `<NavLink />` — active state via brand-red only (no underline/bold/bg)
- [x] `<ThemeToggle />` — sun/moon icon button; writes to localStorage
- [x] `AppNav` updated — uses Logo, NavLink, ThemeToggle
- [ ] `RecipeCard`, `RecipeGrid`, preview drawer, import modal — Phase 2
- [ ] Calendar views (day / week / month) — Phase 4
- [ ] Shopping list tabs (General / By Recipe) — Phase 4

---

## Conventions established

### Current (scaffold)

- **Source root:** `src/` with `@/*` import alias
- **API routes:** `src/app/api/` — auth at `/api/auth/`, user settings at `/api/user/`, recipes at `/api/recipes/`
- **DB client:** singleton in `src/lib/db.ts` — import as `import { prisma } from "@/lib/db"`
- **Auth helpers:** `src/lib/auth/{constants,password,jwt,cookies,sessions,tokens,validation}.ts` + `src/lib/auth.ts` (`withAuthHandler`, `withAuth`, `getCurrentUser`)
- **Types:** `src/types/{auth,recipe,shopping}.ts`
- **Components:** grouped by domain under `src/components/{layout,recipes,calendar,shopping,ui}/`
- **Styling:** Tailwind v4 via `@import "tailwindcss"` in `globals.css`; all colors via CSS variables — no hardcoded hex or raw Tailwind color tokens in components
- **Brand font:** Rowdies (`font-brand` Tailwind utility / `--font-brand` CSS var); body text uses Geist Sans
- **Color system:** semantic vars (`--background`, `--text`, `--highlight`, `--banner`, `--logo-accent`, `--logo-primary`) + brand constants (`--brand-red` #ff3131, `--brand-pink` #e8b8b8, `--brand-black`, `--brand-white`); all mapped in `@theme inline`
- **Dark mode:** `.dark` class on `<html>`; toggled by `<ThemeToggle />` (localStorage); anti-flash script injected in root layout before hydration
- **Middleware:** `src/middleware.ts` — enforces auth; redirects unauthenticated users to `/login`

### Target (adopt as features are built)

- API routes live in `src/app/api/`; protected routes use `withAuthHandler()` from `src/lib/auth.ts`
- DB client alias: consider renaming `db.ts` → `prisma.ts` for consistency
- All API responses follow `{ data, error }` shape
- Tailwind brand color: align with PRD or switch to `green-800` if design direction changes

---

## Known issues / decisions

- **Hosting:** Chose Railway over Vercel (Vercel timeout too short for scraping) — not deployed yet
- **pgvector:** Extension declared in Prisma schema + init migration; must run `CREATE EXTENSION IF NOT EXISTS vector` on the target DB before embeddings work. IVFFlat index deferred until data exists.
- **TikTok import:** Deferred — revisit after core URL/blog import works
- **Next.js version:** Running Next.js 15 (template referenced 14; no action needed)
- **Auth middleware:** Cookie name is `recipebank_session` (`AUTH_COOKIE_NAME` in `src/lib/auth/constants.ts`)
- **Email delivery:** Password reset emails log to console when `SMTP_HOST` is not set. When set, the SMTP client in `src/lib/email.ts` handles AUTH PLAIN + STARTTLS (port 587) and direct TLS (port 465).
- **Rate limiting:** `/api/auth/login`, `/api/auth/register`, and `/api/auth/forgot-password` are guarded by an in-memory sliding window limiter (`src/lib/rate-limit.ts`). Each endpoint allows 10 hits per IP per 15-minute window (matching PRD spec) and returns HTTP 429 when the limit is exceeded. IP is read from `x-forwarded-for` (set by Railway's proxy). The store is a module-level `Map` — safe for Railway's single-process Node.js deployment but **not shared across replicas**. If horizontal scaling is ever added, replace `rateLimit()` with a Redis-backed equivalent (e.g. `ioredis` + Lua sliding window) and drop `src/lib/rate-limit.ts`.
- **Email verification:** Schema + tokens exist; verification flow not implemented (PRD Phase 1 only specifies password reset)
- **Recipe embedding field:** `Unsupported("vector(1536)")` in Prisma — raw SQL required for vector reads/writes until Prisma native vector support matures

---

## File structure (key files only)

```
src/
  app/
    (auth)/
      login/page.tsx
      register/page.tsx
      forgot-password/page.tsx
      reset-password/page.tsx
    (app)/
      home/page.tsx
      recipes/page.tsx
      recipes/[id]/page.tsx
      calendar/page.tsx
      shopping/page.tsx
      settings/page.tsx
      profile/page.tsx
      layout.tsx              # Wraps AppNav
    api/
      health/route.ts
      auth/                   # register, login, logout, forgot/reset-password, me
      user/                   # profile, change-password, delete-account
      recipes/                # GET+POST list; [id]/ GET+PATCH+DELETE
  components/
    layout/app-nav.tsx
    settings/                 # profile-form, change-password-form, delete-account-section
    recipes/                  # Phase 2: RecipeCard, RecipeGrid, drawer, import modal
    calendar/
    shopping/
    ui/
  lib/
    db.ts                     # Prisma client singleton
    auth/
      constants.ts
      password.ts
      jwt.ts                  # JWT sign/verify (session.ts re-exports for compat)
    embeddings.ts             # pgvector search helper
    units.ts                  # Conversion + fraction display
    utils.ts                  # cn() helper
  types/
    auth.ts
    recipe.ts
    shopping.ts
  hooks/
    use-debounce.ts           # 300ms — for AI search
  middleware.ts
prisma/
  schema.prisma               # Full data model
  migrations/0001_init/       # pgvector + all tables
  seed.ts                     # demo@recipebank.app / demo1234!
```

---

## Environment variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (pgvector required) |
| `JWT_SECRET` | Signs session JWT |
| `OPENAI_API_KEY` | Embeddings + recipe import AI |
| `APP_URL` | Password reset link base URL |

See `.env.example` for full list.

---

## Quick start

```bash
cp .env.example .env
npm install
npm run db:push
npm run db:seed   # optional
npm run dev
```

---

## Phase roadmap (suggested)

1. **Auth** — register/login/logout, `withAuth()`, enforce middleware
2. **Recipe CRUD** — manual create, read, update, delete + API routes
3. **pgvector** — enable extension on DB, embedding generation, search API
4. **Import** — URL scraping (blogs, Pinterest); TikTok later
5. **Recipe page modes** — view, edit, list, shopping
6. **Calendar + Shopping** — meal plans, deduplicated lists, pricing

