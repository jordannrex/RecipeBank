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

### Auth — complete

- [x] Register, login, logout UI
- [x] JWT via httpOnly cookie
- [x] `/api/auth/*` routes
- [x] `withAuth()` middleware wrapper
- [x] Password reset flow (email verification deferred — see Known issues)

### Recipes — schema only

- [x] User model + full Recipe model (Prisma schema complete)
- [ ] Recipe CRUD: create (manual), read, update, delete
- [ ] Recipe import from URL — not started
- [ ] AI embedding generation on import / edit
- [ ] Semantic search API (pgvector query wired at lib level only)

### UI components — not started

- [ ] `RecipeCard`, `RecipeGrid`, preview drawer, import modal
- [ ] Calendar views (day / week / month)
- [ ] Shopping list tabs (General / By Recipe)

---

## Conventions established

### Current (scaffold)

- **Source root:** `src/` with `@/*` import alias
- **API routes:** `src/app/api/` (only `/api/health` exists today)
- **DB client:** singleton in `src/lib/db.ts` — import as `import { prisma } from "@/lib/db"`
- **Auth helpers:** `src/lib/auth/{constants,password,session,cookies,sessions,tokens,validation}.ts` + `src/lib/auth.ts` (`withAuth`, `getCurrentUser`)
- **Types:** `src/types/{auth,recipe,shopping}.ts`
- **Components:** grouped by domain under `src/components/{layout,recipes,calendar,shopping,ui}/`
- **Styling:** Tailwind v4 via `@import "tailwindcss"` in `globals.css`; brand primary is amber (`--primary: #b45309`), not green-800
- **Middleware:** `src/middleware.ts` — enforces auth; redirects unauthenticated users to `/login`

### Target (adopt as features are built)

- API routes live in `src/app/api/`; protected routes use `withAuth()` from `src/lib/auth.ts`
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
- **Email delivery:** Password reset emails log to console until `SMTP_*` env vars are configured (`src/lib/email.ts`)
- **Email verification:** Schema + tokens exist; verification flow not implemented (PRD Phase 1 only specifies password reset)
- **Recipe embedding field:** `Unsupported("vector(1536)")` in Prisma — raw SQL required for vector reads/writes until Prisma native vector support matures

---

## File structure (key files only)

```
src/
  app/
    (auth)/
      login/page.tsx          # Placeholder
      register/page.tsx       # Placeholder
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
      health/route.ts         # Only API route so far
      auth/                   # register, login, logout, forgot/reset-password, me
      recipes/                # TODO: CRUD routes
  components/
    layout/app-nav.tsx
    recipes/                  # TODO: RecipeCard, RecipeGrid, drawer, import modal
    calendar/
    shopping/
    ui/
  lib/
    db.ts                     # Prisma client singleton
    auth/
      constants.ts
      password.ts
      session.ts              # JWT sign/verify
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

