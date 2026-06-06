# RecipeBank

AI-powered recipe management platform — import recipes, plan meals, build shopping lists, and search semantically.

## Tech Stack

- **Framework:** Next.js 15 (App Router) + TypeScript
- **Styling:** Tailwind CSS v4
- **Database:** PostgreSQL with [pgvector](https://github.com/pgvector/pgvector) for semantic search
- **ORM:** Prisma
- **Auth:** JWT in httpOnly cookies (jose + bcryptjs)

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 15+ with the `vector` extension

```bash
# Enable pgvector in your database
CREATE EXTENSION IF NOT EXISTS vector;
```

### Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL and JWT_SECRET

# Push schema to database
npm run db:push

# (Optional) Seed demo data
npm run db:seed

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
├── app/
│   ├── (auth)/          # Login & registration (no nav bar)
│   ├── (app)/           # Authenticated pages (with nav bar)
│   │   ├── home/
│   │   ├── recipes/
│   │   ├── calendar/
│   │   ├── shopping/
│   │   ├── settings/
│   │   └── profile/
│   └── api/             # API routes
├── components/
│   ├── layout/          # AppNav, etc.
│   ├── recipes/         # Recipe cards, drawer, import modal
│   ├── calendar/        # Calendar views
│   └── shopping/        # Shopping list components
├── lib/
│   ├── auth/            # Session, password utilities
│   ├── db.ts            # Prisma client singleton
│   ├── embeddings.ts    # pgvector semantic search
│   └── units.ts         # Unit conversion & fraction display
├── types/               # Shared TypeScript types
└── hooks/               # Client-side hooks
prisma/
├── schema.prisma        # Full data model
├── migrations/        # SQL migrations
└── seed.ts              # Demo seed data
```

## Database Schema

| Model | Purpose |
|-------|---------|
| `User` | Accounts with email/username auth |
| `Session` | JWT session tracking with remember-me |
| `Recipe` | Core recipe with AI metadata + vector embedding |
| `IngredientGroup` / `Ingredient` | Grouped ingredients with quantities |
| `RecipeStep` | Numbered steps with optional section headers |
| `RecipeNote` | User-specific notes per recipe |
| `RecipeEdit` | Audit trail of user edits |
| `CookLog` | Cooking history |
| `MealPlan` | Calendar meal assignments |
| `ShoppingList` / `ShoppingItem` | Shopping lists with pricing |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run db:push` | Push schema to database |
| `npm run db:migrate` | Run migrations |
| `npm run db:seed` | Seed demo data |
| `npm run db:studio` | Open Prisma Studio |

## Demo Credentials

After seeding:

- **Email:** demo@recipebank.app
- **Password:** demo1234!
