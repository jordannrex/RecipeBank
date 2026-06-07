---
editor_options: 
  markdown: 
    wrap: 72
---

## Menus Feature — Implementation PRD

### Overview Users can create Menus — named collections of up to 10

recipes, each with a custom serving count and an optional cook date. The
primary use case is planning a week of meals: pick 3–4 recipes, set
servings per recipe, assign the day each will be cooked, and see the
total estimated cost. Menus appear on the calendar as a continuous
visual band across their scheduled date range, with individual recipe
entries pinned to their cook days.

### Stack & Conventions Framework: Next.js 15 App Router, TypeScript,

Tailwind v4 ORM: Prisma v7 with @prisma/adapter-pg; Decimal fields
serialize as strings in JSON Auth: withAuth() from \@/lib/auth; all
routes are user-scoped API helpers: apiSuccess() / apiError() from
\@/lib/api; validate with zod Drag-and-drop: @dnd-kit/core,
@dnd-kit/sortable, @dnd-kit/utilities — already installed Cost calc:
calcIngredientCost from \@/lib/units. Scale by (menuItem.servings /
recipe.currentServings) to get per-recipe cost at menu serving size.
Design tokens: text-text, text-muted, bg-card, bg-card-hover,
border-border, bg-highlight, text-highlight, bg-background,
text-destructive. Match existing calendar and shopping list styles
exactly. Modal pattern: fixed inset-0 z-40 bg-background/50
backdrop-blur-[2px] backdrop, rounded-2xl border border-border bg-card
shadow-2xl panel. See RecipePicker and EventDetailModal in
src/components/calendar/calendar-view.tsx.

### Navigation Insert Menus between Calendar and Shopping List in

NAV_LINKS in src/components/layout/app-nav.tsx:

Home \| Recipe Bank \| Calendar \| Menus \| Shopping List Route: /menus

### Data Model

Add two new models to prisma/schema.prisma. Run prisma db push after.

model Menu { id String @id @default(cuid()) userId String
@map("user_id") title String description String? @db.Text startDate
DateTime? @map("start_date") @db.Date // calendar band start; null =
unscheduled endDate DateTime? @map("end_date") @db.Date // calendar band
end; null = unscheduled createdAt DateTime @default(now())
@map("created_at") updatedAt DateTime @updatedAt @map("updated_at")

user User @relation(fields: [userId], references: [id], onDelete:
Cascade) items MenuItem[]

\@@index([userId]) \@@map("menus") }

model MenuItem { id String @id @default(cuid()) menuId String
@map("menu_id") recipeId String @map("recipe_id") servings Int //
per-menu override; defaults to recipe.currentServings sortOrder Int
@default(0) @map("sort_order") cookDate DateTime? @map("cook_date")
@db.Date // day this recipe is cooked; null = unscheduled within menu
notes String? @db.Text // "how did it go?" logged after cooking
createdAt DateTime @default(now()) @map("created_at") updatedAt DateTime
@updatedAt @map("updated_at")

menu Menu @relation(fields: [menuId], references: [id], onDelete:
Cascade) recipe Recipe @relation(fields: [recipeId], references: [id],
onDelete: Cascade)

\@@index([menuId]) \@@index([recipeId]) \@@map("menu_items") } Add
back-relations on existing models:

// Recipe model: menus MenuItem[] // User model: menus Menu[]
totalServings and totalCost are computed at query time, not stored.

### Cost Calculation

For each MenuItem, estimated cost = sum over thecrecipe's ingredients
of: calcIngredientCost(ingredient) × (menuItem.servings /
recipe.currentServings) Return null per-recipe if price data is missing.
A menu's totalCost sums what's available; if any recipe lacks price data
set isPartialCost: true and display \~\$X.XX. Show "No price data" in
muted text only when the total is fully null.

### API Routes

##### Menus Method Path Purpose

GET /api/menus List all menus (with computed totals)

POST /api/menus Create menu (title, description, optional items[],
optional startDate/endDate)

GET /api/menus/[id] Full menu with recipe details

PATCH /api/menus/[id] Update title, description, startDate, endDate

DELETE /api/menus/[id] Delete menu + items (cascade)

POST /api/menus/[id]/items Add recipe; defaults servings to
recipe.currentServings

PATCH /api/menus/[id]/items/[itemId] Update servings, sortOrder,
cookDate, notes

DELETE /api/menus/[id]/items/[itemId] Remove recipe from menu

PATCH /api/menus/[id]/items/reorder Bulk-set sortOrder via { order:
[itemId, …] }

Constraints: max 10 items per menu; servings min 1; cookDate must fall
within [startDate, endDate] when both are set.

Calendar integration GET /api/calendar?year=&month= (existing route)
must be extended to also return:

menuBands — menus whose [startDate, endDate] range overlaps the
requested month. Used to render the continuous background strip.
Menu-recipe events — MenuItem rows with a cookDate that falls within the
requested month, included in the existing events array as type:
"menu-recipe". Extended response shape:

{ "data": { "events": [ { "id": "menuItemId", "type": "menu-recipe",
"recipeId": "...", "recipeTitle": "Pasta", "recipePhotoUrl": "...",
"date": "2026-06-09", "notes": null, "menuId": "...", "menuTitle": "Week
1" } ], "menuBands": [ { "menuId": "...", "title": "Week 1",
"startDate": "2026-06-07", "endDate": "2026-06-13" } ] } } The week view
may span two months; the existing parallel-fetch pattern already handles
this — menuBands should be deduplicated by menuId the same way events
are deduplicated by id.

### Types — src/types/menu.ts export type MenuSummary = { id: string;

title: string; description: string \| null; startDate: string \| null;
// YYYY-MM-DD endDate: string \| null; totalServings: number; totalCost:
string \| null; isPartialCost: boolean; itemCount: number; updatedAt:
string; };

export type MenuRecipeItem = { id: string; // MenuItem id sortOrder:
number; servings: number; cookDate: string \| null; // YYYY-MM-DD notes:
string \| null; recipe: { id: string; title: string; photoUrl: string \|
null; currentServings: number; cuisine: string \| null; dishType: string
\| null; estimatedCost: string \| null; }; };

export type MenuDetail = MenuSummary & { items: MenuRecipeItem[] };

export type MenuBand = { menuId: string; title: string; startDate:
string; endDate: string; }; Extend src/types/calendar.ts:

// Add "menu-recipe" to the union export type CalendarEvent = { id:
string; type: "cook-log" \| "meal-plan" \| "menu-recipe"; recipeId:
string; recipeTitle: string; recipePhotoUrl: string \| null; date:
string; notes: string \| null; // Present only when type ===
"menu-recipe": menuId?: string; menuTitle?: string; }; Page: /menus —
src/app/(app)/menus/page.tsx Client component. Fetches GET /api/menus on
mount.

Empty state: centered illustration, "No menus yet", "Create your first
menu" button.

Loaded state: page header "Menus" + "New Menu" button top-right, then a
vertical stack of MenuPill components.

MenuPill — src/components/menus/menu-pill.tsx
┌─────────────────────────────────────────────┐

│ Week 1 [···] │

│ Jun 7 – Jun 13 · 14 servings · \~\$42.50 │
└─────────────────────────────────────────────┘

rounded-2xl border border-border bg-card px-5 py-4 cursor-pointer
hover:bg-card-hover Title: text-base font-bold text-text Subtitle: date
range (if scheduled) · servings · cost ··· dropdown: Edit (opens detail
modal in edit mode), Delete (inline confirm) Clicking anywhere else
opens MenuDetailModal in view mode Loading state: skeleton pills with
animate-pulse MenuDetailModal —
src/components/menus/menu-detail-modal.tsx Full-screen overlay
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
when cookDate is null Cost per row scaled to menu servings; — if null

Edit mode Activated by the Edit button. In-place, no navigation.

Menu-level fields:

Title → <input> (auto-focused) Description →

<textarea>

Date range: Two <input type="date"> fields labelled "Start" and "End".
These define the calendar band. They are not required — a menu can
remain unscheduled. If either is cleared, both clear (unschedule).
Validation: endDate \>= startDate. Header: Save + Cancel; Save fires
PATCH /api/menus/[id]. Per-recipe row additions in edit mode:

Drag handle (left) — @dnd-kit/sortable vertical. On drop: PATCH
/api/menus/[id]/items/reorder. Cook date picker — <input type="date">
constrained to [startDate, endDate] when the menu has dates. Shows "Set
cook day" placeholder. Null means unscheduled within the menu. On
change: PATCH /api/menus/[id]/items/[itemId] with cookDate. Multiple
recipes may share the same cook date (e.g. two dishes cooked together).
The same recipe can only have one cook date per menu entry. Servings
input — <input type="number" min="1">. On blur: PATCH
/api/menus/[id]/items/[itemId]. Recomputes header totals optimistically.
× delete (right) — optimistic remove + DELETE
/api/menus/[id]/items/[itemId]. Add recipe button (below list): opens
inline RecipePickerPanel (search + scrollable list, same pattern as
Calendar's RecipePicker). Selecting adds the recipe with servings =
recipe.currentServings and cookDate = null. Disabled at 10 items.

Cook log prompt: If the menu has a startDate in the past and a recipe
row has a cookDate that has passed, show a small notes area beneath it
("How did it go? Any tweaks?"). Saving that note fires PATCH
/api/menus/[id]/items/[itemId] with notes. This is the equivalent of a
cook log, scoped to the menu entry.

CreateMenuModal — src/components/menus/create-menu-modal.tsx Two-step
wizard, same overlay style.

#### Step 1 — Name & Schedule Title input (required) Description textarea

(optional) Optional date range ("Start date" / "End date") — can be
skipped and set later "Next →"

#### Step 2 — Add recipes Search bar + scrollable recipe list Selected

recipes appear in a staging list with: Servings input (pre-filled with
recipe.currentServings) Optional cook date picker (constrained to menu
range if set; hidden if no dates set yet) × remove button Live running
total: "X servings total · \~\$Y estimated" updates as recipes/servings
change Max 10 recipes "Create Menu" → POST /api/menus → closes modal,
prepends new pill

### Calendar Integration — src/components/calendar/calendar-view.tsx

Visual: Menu band A menu band is a continuous visual indicator spanning
the menu's [startDate, endDate] across calendar cells. It is rendered as
a background layer, not as a chip, so individual recipe chips sit on top
of it.

Month view (MonthCell):

If a cell's date falls within any menuBand, apply a subtle background
tint to the cell: bg-highlight/5 (or a distinct per-menu hue if multiple
menus are visible — cycle through a small palette). On the cell matching
startDate, render a small pill label at the very top of the cell: the
menu title in text-[10px] font-semibold text-highlight/70 truncate. This
label sits above the day number row. No label on continuation cells —
the shared background tint provides the visual continuity. Week view
(WeekDayColumn):

Same background tint on column headers and event areas for days within a
menu band. Menu title label appears above the day number in the column
header on the first day only. Day view (DayView):

Show a "Part of: [Menu Title]" badge below the date header when the day
falls within a band. Badge links to the /menus page or opens the
MenuDetailModal (preferred). Visual: menu-recipe event chips type:
"menu-recipe" events render with a distinct third style alongside cook
logs and meal plans:

Color: bg-highlight/20 border border-highlight/40 text-highlight
(lighter than a cook log, similar weight to a meal plan but visually
distinguishable — use a slightly different shape or label prefix if
needed) Chip label: recipe title only (same truncation rules as existing
chips) Legend entry: add "Menu Recipe" to the existing color legend row
at the top of the calendar EventChip / WeekEventBlock / MonthEventBlock
All three components already branch on event.type. Add a third branch
for "menu-recipe" that uses the color above. The expanded photo card
logic in week/month views applies to menu-recipe events the same way it
applies to cook logs.

EventDetailModal For type: "menu-recipe":

Type badge: menu icon + "Menu: [menuTitle]" (links to /menus page or
opens MenuDetailModal) Recipe photo, title, date — same layout as cook
log modal Notes section: labelled "Cook notes" if notes is set;
otherwise show "No notes yet" If cookDate is in the past: show a "Add
notes" inline textarea (same "How did it go?" prompt) that saves via
PATCH /api/menus/[id]/items/[itemId] No standalone "Remove" button —
removing a recipe from a menu is done in the menu's edit mode. Show a
"Edit menu →" link instead. "View Recipe →" link still present
loadEvents in CalendarView Extend the parallel fetch to also collect
menuBands from each month's response. Merge and deduplicate by menuId
(same pattern as deduplicating events by id). Store in a menuBands:
MenuBand[] state variable separate from events.

Pass menuBands down to MonthView, WeekView, DayView and their
cell/column sub-components.

### Scheduling Logic & Cook Date Rules Rule Detail A menu's length is set

by startDate/endDate, not by recipe count A 7-day menu can have 3
recipes; days without a recipe cook date just show the band tint A
recipe appears on the calendar only on its cookDate Leftover days are
implicit — the user understands that a 4-serving recipe feeds multiple
days. Only the cook day is shown. Multiple recipes may share a cook date
Both chips appear on that day; they stack using existing multi-event
layout rules A recipe without a cookDate exists in the menu but is
invisible on the calendar It still counts toward totals on the /menus
page Cook date must fall within [startDate, endDate] Validated in the
API (PATCH /api/menus/[id]/items/[itemId]); client date picker enforces
the range Menus without dates are valid They appear only on /menus,
never on the calendar

### File Checklist prisma/schema.prisma Add Menu, MenuItem;

back-relations on Recipe + User; startDate/endDate on Menu;
cookDate/notes on MenuItem src/types/menu.ts New — MenuSummary,
MenuRecipeItem, MenuDetail, MenuBand src/types/calendar.ts Extend
CalendarEvent union with "menu-recipe"; add menuId/menuTitle fields
src/app/(app)/menus/page.tsx New src/components/menus/menu-pill.tsx New
src/components/menus/menu-detail-modal.tsx New (view + edit mode)
src/components/menus/create-menu-modal.tsx New
src/app/api/menus/route.ts GET, POST src/app/api/menus/[id]/route.ts
GET, PATCH, DELETE src/app/api/menus/[id]/items/route.ts POST
src/app/api/menus/[id]/items/[itemId]/route.ts PATCH, DELETE
src/app/api/menus/[id]/items/reorder/route.ts PATCH
src/app/api/calendar/route.ts Extend to return menuBands + menu-recipe
events src/components/calendar/calendar-view.tsx Add MenuBand rendering;
handle menu-recipe event type src/components/layout/app-nav.tsx Insert
Menus between Calendar and Shopping List

### Edge Cases Case Behavior Recipe deleted after being added to a menu

onDelete: Cascade removes the MenuItem; re-fetch reflects it; calendar
auto-updates No price data for any ingredient estimatedCost: null;
isPartialCost: true; pill shows \~\$0.00 or "No price data" Menu with 0
items Valid — shows "0 servings · No price data"; band still renders on
calendar if dates set Duplicate recipe in menu Allowed — user may want
two separate cook days or serving counts Servings ≤ 0 Clamp to 1
client-side; API rejects with 400 Over 10 recipes API returns 400; Add
button shows "Max 10 recipes reached" cookDate outside [startDate,
endDate] API returns 400; client date picker constrains the range
Overlapping menu bands on same days Render both tints; stack the title
labels on the first day of each; use a second accent color for the
second band Week view spanning two months monthsForDates() already
fetches both months; deduplicate menuBands by menuId after merging
Decimal fields Serialize as strings; use parseFloat() only for display
arithmetic
