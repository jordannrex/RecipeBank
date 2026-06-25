---
editor_options: 
  markdown: 
    wrap: 72
---

## Meal Plans Feature — Implementation PRD

> Note: This feature was originally named "Menus" and was renamed to
> "Meal Plans". In code it uses the `MealPlan` / `MealPlanItem` /
> `MealPlanUsage` models. The calendar's single-recipe planning feature
> (previously `MealPlan`) was renamed to `ScheduledMeal` to free the name.

### Overview Users can create Meal Plans — named collections of up to 10

recipes, each with a custom serving count and an optional cook date. The
primary use case is planning a week of meals: pick 3–4 recipes, set
servings per recipe, assign the day each will be cooked, and see the
total estimated cost. MealPlans appear on the calendar as a continuous
visual band across their scheduled date range, with individual recipe
entries pinned to their cook days.

### Stack & Conventions Framework: Next.js 15 App Router, TypeScript,

Tailwind v4 ORM: Prisma v7 with @prisma/adapter-pg; Decimal fields
serialize as strings in JSON Auth: withAuth() from \@/lib/auth; all
routes are user-scoped API helpers: apiSuccess() / apiError() from
\@/lib/api; validate with zod Drag-and-drop: @dnd-kit/core,
@dnd-kit/sortable, @dnd-kit/utilities — already installed Cost calc:
calcIngredientCost from \@/lib/units. Scale by (mealPlanItem.servings /
recipe.currentServings) to get per-recipe cost at mealPlan serving size.
Design tokens: text-text, text-muted, bg-card, bg-card-hover,
border-border, bg-highlight, text-highlight, bg-background,
text-destructive. Match existing calendar and shopping list styles
exactly. Modal pattern: fixed inset-0 z-40 bg-background/50
backdrop-blur-[2px] backdrop, rounded-2xl border border-border bg-card
shadow-2xl panel. See RecipePicker and EventDetailModal in
src/components/calendar/calendar-view.tsx.

### Navigation Insert MealPlans between Calendar and Shopping List in

NAV_LINKS in src/components/layout/app-nav.tsx:

Home \| Recipe Bank \| Calendar \| MealPlans \| Shopping List Route: /meal-plans

### Data Model

Add two new models to prisma/schema.prisma. Run prisma db push after.

model MealPlan { id String @id @default(cuid()) userId String
@map("user_id") title String description String? @db.Text startDate
DateTime? @map("start_date") @db.Date // calendar band start; null =
unscheduled endDate DateTime? @map("end_date") @db.Date // calendar band
end; null = unscheduled createdAt DateTime @default(now())
@map("created_at") updatedAt DateTime @updatedAt @map("updated_at")

user User @relation(fields: [userId], references: [id], onDelete:
Cascade) items MealPlanItem[]

\@@index([userId]) \@@map("meal_plans") }

model MealPlanItem { id String @id @default(cuid()) mealPlanId String
@map("meal_plan_id") recipeId String @map("recipe_id") servings Int //
per-mealPlan override; defaults to recipe.currentServings sortOrder Int
@default(0) @map("sort_order") cookDate DateTime? @map("cook_date")
@db.Date // day this recipe is cooked; null = unscheduled within mealPlan
notes String? @db.Text // "how did it go?" logged after cooking
createdAt DateTime @default(now()) @map("created_at") updatedAt DateTime
@updatedAt @map("updated_at")

mealPlan MealPlan @relation(fields: [mealPlanId], references: [id], onDelete:
Cascade) recipe Recipe @relation(fields: [recipeId], references: [id],
onDelete: Cascade)

\@@index([mealPlanId]) \@@index([recipeId]) \@@map("meal_plan_items") } Add
back-relations on existing models:

// Recipe model: mealPlans MealPlanItem[] // User model: mealPlans MealPlan[]
totalServings and totalCost are computed at query time, not stored.

### Cost Calculation

For each MealPlanItem, estimated cost = sum over thecrecipe's ingredients
of: calcIngredientCost(ingredient) × (mealPlanItem.servings /
recipe.currentServings) Return null per-recipe if price data is missing.
A mealPlan's totalCost sums what's available; if any recipe lacks price data
set isPartialCost: true and display \~\$X.XX. Show "No price data" in
muted text only when the total is fully null.

### API Routes

##### MealPlans Method Path Purpose

GET /api/meal-plans List all mealPlans (with computed totals)

POST /api/meal-plans Create mealPlan (title, description, optional items[],
optional startDate/endDate)

GET /api/meal-plans/[id] Full mealPlan with recipe details

PATCH /api/meal-plans/[id] Update title, description, startDate, endDate

DELETE /api/meal-plans/[id] Delete mealPlan + items (cascade)

POST /api/meal-plans/[id]/items Add recipe; defaults servings to
recipe.currentServings

PATCH /api/meal-plans/[id]/items/[itemId] Update servings, sortOrder,
cookDate, notes

DELETE /api/meal-plans/[id]/items/[itemId] Remove recipe from mealPlan

PATCH /api/meal-plans/[id]/items/reorder Bulk-set sortOrder via { order:
[itemId, …] }

Constraints: max 10 items per mealPlan; servings min 1; cookDate must fall
within [startDate, endDate] when both are set.

Calendar integration GET /api/calendar?year=&month= (existing route)
must be extended to also return:

mealPlanBands — mealPlans whose [startDate, endDate] range overlaps the
requested month. Used to render the continuous background strip.
MealPlan-recipe events — MealPlanItem rows with a cookDate that falls within the
requested month, included in the existing events array as type:
"meal-plan-recipe". Extended response shape:

{ "data": { "events": [ { "id": "mealPlanItemId", "type": "meal-plan-recipe",
"recipeId": "...", "recipeTitle": "Pasta", "recipePhotoUrl": "...",
"date": "2026-06-09", "notes": null, "mealPlanId": "...", "mealPlanTitle": "Week
1" } ], "mealPlanBands": [ { "mealPlanId": "...", "title": "Week 1",
"startDate": "2026-06-07", "endDate": "2026-06-13" } ] } } The week view
may span two months; the existing parallel-fetch pattern already handles
this — mealPlanBands should be deduplicated by mealPlanId the same way events
are deduplicated by id.

### Types — src/types/meal-plan.ts export type MealPlanSummary = { id: string;

title: string; description: string \| null; startDate: string \| null;
// YYYY-MM-DD endDate: string \| null; totalServings: number; totalCost:
string \| null; isPartialCost: boolean; itemCount: number; updatedAt:
string; };

export type MealPlanRecipeItem = { id: string; // MealPlanItem id sortOrder:
number; servings: number; cookDate: string \| null; // YYYY-MM-DD notes:
string \| null; recipe: { id: string; title: string; photoUrl: string \|
null; currentServings: number; cuisine: string \| null; dishType: string
\| null; estimatedCost: string \| null; }; };

export type MealPlanDetail = MealPlanSummary & { items: MealPlanRecipeItem[] };

export type MealPlanBand = { mealPlanId: string; title: string; startDate:
string; endDate: string; }; Extend src/types/calendar.ts:

// Add "meal-plan-recipe" to the union export type CalendarEvent = { id:
string; type: "cook-log" \| "scheduled-meal" \| "meal-plan-recipe"; recipeId:
string; recipeTitle: string; recipePhotoUrl: string \| null; date:
string; notes: string \| null; // Present only when type ===
"meal-plan-recipe": mealPlanId?: string; mealPlanTitle?: string; }; Page: /meal-plans —
src/app/(app)/meal-plans/page.tsx Client component. Fetches GET /api/meal-plans on
mount.

Empty state: centered illustration, "No mealPlans yet", "Create your first
mealPlan" button.

Loaded state: page header "MealPlans" + "New MealPlan" button top-right, then a
vertical stack of MealPlanPill components.

MealPlanPill — src/components/meal-plans/meal-plan-pill.tsx
┌─────────────────────────────────────────────┐

│ Week 1 [···] │

│ Jun 7 – Jun 13 · 14 servings · \~\$42.50 │
└─────────────────────────────────────────────┘

rounded-2xl border border-border bg-card px-5 py-4 cursor-pointer
hover:bg-card-hover Title: text-base font-bold text-text Subtitle: date
range (if scheduled) · servings · cost ··· dropdown: Edit (opens detail
modal in edit mode), Delete (inline confirm) Clicking anywhere else
opens MealPlanDetailModal in view mode Loading state: skeleton pills with
animate-pulse MealPlanDetailModal —
src/components/meal-plans/meal-plan-detail-modal.tsx Full-screen overlay
(max-w-2xl, max-h-[85vh], scrollable body). Escape closes.

View mode

[×] Week 1 [Edit]

Jun 7 – Jun 13 · Optional description

14 servings total · \~\$42.50 estimated
─────────────────────────────────────────

[img] Pasta → Jun 9 · 4 svgs \$12.00

[img] Chicken → Jun 11 · 6 svgs \$18.00

[img] Lentil Soup → Unscheduled · 4 svgs —

Recipe title is a <Link href="/recipes/[id]"> that opens in the same tab
and closes the modal Cook date shown inline; "Unscheduled" in muted text
when cookDate is null Cost per row scaled to mealPlan servings; — if null

Edit mode Activated by the Edit button. In-place, no navigation.

MealPlan-level fields:

Title → <input> (auto-focused) Description →

<textarea>

Date range: Two <input type="date"> fields labelled "Start" and "End".
These define the calendar band. They are not required — a mealPlan can
remain unscheduled. If either is cleared, both clear (unschedule).
Validation: endDate \>= startDate. Header: Save + Cancel; Save fires
PATCH /api/meal-plans/[id]. Per-recipe row additions in edit mode:

Drag handle (left) — @dnd-kit/sortable vertical. On drop: PATCH
/api/meal-plans/[id]/items/reorder. Cook date picker — <input type="date">
constrained to [startDate, endDate] when the mealPlan has dates. Shows "Set
cook day" placeholder. Null means unscheduled within the mealPlan. On
change: PATCH /api/meal-plans/[id]/items/[itemId] with cookDate. Multiple
recipes may share the same cook date (e.g. two dishes cooked together).
The same recipe can only have one cook date per mealPlan entry. Servings
input — <input type="number" min="1">. On blur: PATCH
/api/meal-plans/[id]/items/[itemId]. Recomputes header totals optimistically.
× delete (right) — optimistic remove + DELETE
/api/meal-plans/[id]/items/[itemId]. Add recipe button (below list): opens
inline RecipePickerPanel (search + scrollable list, same pattern as
Calendar's RecipePicker). Selecting adds the recipe with servings =
recipe.currentServings and cookDate = null. Disabled at 10 items.

Cook log prompt: If the mealPlan has a startDate in the past and a recipe
row has a cookDate that has passed, show a small notes area beneath it
("How did it go? Any tweaks?"). Saving that note fires PATCH
/api/meal-plans/[id]/items/[itemId] with notes. This is the equivalent of a
cook log, scoped to the mealPlan entry.

CreateMealPlanModal — src/components/meal-plans/create-meal-plan-modal.tsx Two-step
wizard, same overlay style.

#### Step 1 — Name & Schedule Title input (required) Description textarea

(optional) Optional date range ("Start date" / "End date") — can be
skipped and set later "Next →"

#### Step 2 — Add recipes Search bar + scrollable recipe list Selected

recipes appear in a staging list with: Servings input (pre-filled with
recipe.currentServings) Optional cook date picker (constrained to mealPlan
range if set; hidden if no dates set yet) × remove button Live running
total: "X servings total · \~\$Y estimated" updates as recipes/servings
change Max 10 recipes "Create MealPlan" → POST /api/meal-plans → closes modal,
prepends new pill

### Calendar Integration — src/components/calendar/calendar-view.tsx

Visual: MealPlan band A mealPlan band is a continuous visual indicator spanning
the mealPlan's [startDate, endDate] across calendar cells. It is rendered as
a background layer, not as a chip, so individual recipe chips sit on top
of it.

Month view (MonthCell):

If a cell's date falls within any mealPlanBand, apply a subtle background
tint to the cell: bg-highlight/5 (or a distinct per-mealPlan hue if multiple
mealPlans are visible — cycle through a small palette). On the cell matching
startDate, render a small pill label at the very top of the cell: the
mealPlan title in text-[10px] font-semibold text-highlight/70 truncate. This
label sits above the day number row. No label on continuation cells —
the shared background tint provides the visual continuity. Week view
(WeekDayColumn):

Same background tint on column headers and event areas for days within a
mealPlan band. MealPlan title label appears above the day number in the column
header on the first day only. Day view (DayView):

Show a "Part of: [MealPlan Title]" badge below the date header when the day
falls within a band. Badge links to the /meal-plans page or opens the
MealPlanDetailModal (preferred). Visual: meal-plan-recipe event chips type:
"meal-plan-recipe" events render with a distinct third style alongside cook
logs and scheduled meals:

Color: bg-highlight/20 border border-highlight/40 text-highlight
(lighter than a cook log, similar weight to a scheduled meal but visually
distinguishable — use a slightly different shape or label prefix if
needed) Chip label: recipe title only (same truncation rules as existing
chips) Legend entry: add "MealPlan Recipe" to the existing color legend row
at the top of the calendar EventChip / WeekEventBlock / MonthEventBlock
All three components already branch on event.type. Add a third branch
for "meal-plan-recipe" that uses the color above. The expanded photo card
logic in week/month views applies to meal-plan-recipe events the same way it
applies to cook logs.

EventDetailModal For type: "meal-plan-recipe":

Type badge: mealPlan icon + "MealPlan: [mealPlanTitle]" (links to /meal-plans page or
opens MealPlanDetailModal) Recipe photo, title, date — same layout as cook
log modal Notes section: labelled "Cook notes" if notes is set;
otherwise show "No notes yet" If cookDate is in the past: show a "Add
notes" inline textarea (same "How did it go?" prompt) that saves via
PATCH /api/meal-plans/[id]/items/[itemId] No standalone "Remove" button —
removing a recipe from a mealPlan is done in the mealPlan's edit mode. Show a
"Edit mealPlan →" link instead. "View Recipe →" link still present
loadEvents in CalendarView Extend the parallel fetch to also collect
mealPlanBands from each month's response. Merge and deduplicate by mealPlanId
(same pattern as deduplicating events by id). Store in a mealPlanBands:
MealPlanBand[] state variable separate from events.

Pass mealPlanBands down to MonthView, WeekView, DayView and their
cell/column sub-components.

### Scheduling Logic & Cook Date Rules Rule Detail A mealPlan's length is set

by startDate/endDate, not by recipe count A 7-day mealPlan can have 3
recipes; days without a recipe cook date just show the band tint A
recipe appears on the calendar only on its cookDate Leftover days are
implicit — the user understands that a 4-serving recipe feeds multiple
days. Only the cook day is shown. Multiple recipes may share a cook date
Both chips appear on that day; they stack using existing multi-event
layout rules A recipe without a cookDate exists in the mealPlan but is
invisible on the calendar It still counts toward totals on the /meal-plans
page Cook date must fall within [startDate, endDate] Validated in the
API (PATCH /api/meal-plans/[id]/items/[itemId]); client date picker enforces
the range MealPlans without dates are valid They appear only on /meal-plans,
never on the calendar

### File Checklist prisma/schema.prisma Add MealPlan, MealPlanItem;

back-relations on Recipe + User; startDate/endDate on MealPlan;
cookDate/notes on MealPlanItem src/types/meal-plan.ts New — MealPlanSummary,
MealPlanRecipeItem, MealPlanDetail, MealPlanBand src/types/calendar.ts Extend
CalendarEvent union with "meal-plan-recipe"; add mealPlanId/mealPlanTitle fields
src/app/(app)/meal-plans/page.tsx New src/components/meal-plans/meal-plan-pill.tsx New
src/components/meal-plans/meal-plan-detail-modal.tsx New (view + edit mode)
src/components/meal-plans/create-meal-plan-modal.tsx New
src/app/api/meal-plans/route.ts GET, POST src/app/api/meal-plans/[id]/route.ts
GET, PATCH, DELETE src/app/api/meal-plans/[id]/items/route.ts POST
src/app/api/meal-plans/[id]/items/[itemId]/route.ts PATCH, DELETE
src/app/api/meal-plans/[id]/items/reorder/route.ts PATCH
src/app/api/calendar/route.ts Extend to return mealPlanBands + meal-plan-recipe
events src/components/calendar/calendar-view.tsx Add MealPlanBand rendering;
handle meal-plan-recipe event type src/components/layout/app-nav.tsx Insert
MealPlans between Calendar and Shopping List

### Edge Cases Case Behavior Recipe deleted after being added to a mealPlan

onDelete: Cascade removes the MealPlanItem; re-fetch reflects it; calendar
auto-updates No price data for any ingredient estimatedCost: null;
isPartialCost: true; pill shows \~\$0.00 or "No price data" MealPlan with 0
items Valid — shows "0 servings · No price data"; band still renders on
calendar if dates set Duplicate recipe in mealPlan Allowed — user may want
two separate cook days or serving counts Servings ≤ 0 Clamp to 1
client-side; API rejects with 400 Over 10 recipes API returns 400; Add
button shows "Max 10 recipes reached" cookDate outside [startDate,
endDate] API returns 400; client date picker constrains the range
Overlapping mealPlan bands on same days Render both tints; stack the title
labels on the first day of each; use a second accent color for the
second band Week view spanning two months monthsForDates() already
fetches both months; deduplicate mealPlanBands by mealPlanId after merging
Decimal fields Serialize as strings; use parseFloat() only for display
arithmetic
