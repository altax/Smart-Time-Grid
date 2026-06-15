# Мои Смены — Personal Shift Planner

A single-user personal shift planner for managing work locations (объекты) and shift dates.

## Run & Operate

- `pnpm --filter @workspace/planner run dev` — run the planner UI (port 5000)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/db run push` — push DB schema changes
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- UI: React 19 + Vite 7 + Tailwind CSS 4
- Data: PostgreSQL via Drizzle ORM (API server at port 8080, Vite proxies `/api` to it)
- Icons: lucide-react

## Where things live

- `artifacts/planner/src/pages/Home.tsx` — entire app UI (~1600 lines, all components inline)
- `artifacts/planner/src/types.ts` — EventStatus, PlannerEvent, Goal, Expense, STATUS_COLORS/LABELS/CYCLE
- `artifacts/planner/src/hooks/use-planner.ts` — all data access via REST API (no localStorage)
- `artifacts/planner/src/index.css` — CSS variables and minimal custom classes
- `artifacts/api-server/src/routes/planner.ts` — CRUD routes for entities/events/goals/expenses
- `lib/db/src/schema/planner.ts` — Drizzle ORM schema (4 tables)

## Architecture decisions

- **Single-user, PostgreSQL DB** — no assignees, no multi-user; data persisted via REST API
- **2 statuses only**: `upcoming` (blue #5b9cf6) / `past` (slate #546070)
  - Backward compat: planned/confirmed/pending → upcoming, overdue → past (normalized in hook on load)
- **Fixed shift time 9:00–21:00 (12h)**: shown as static info, not editable
- **Work locations** (объекты): user creates named locations, grid rows = locations
- **Design**: calm blue (#5b9cf6) primary, dark navy background, NO glassmorphism/glow/gradient text
- **Vite proxy**: `/api/*` → `http://localhost:8080` in dev

## Product

- Monthly calendar grid: rows = work locations, columns = days of the month
- Sidebar: brand, clickable month name (opens month picker), shift stats (upcoming/past), upcoming shifts list, Goals section, Expenses diary
- Topbar: stat summary only (объектов / будущих / прошедших / заработок)
- Add/view shift popup: fixed time display, 2-status picker, earnings, notes
- No demo data — clean empty state with prompt to add object
- Cells: 44px height, colored fills with earnings badge (если есть)

## User preferences

- **NO**: staff/assignee features, time picker, glassmorphism, gradient text, SVG rings, glow effects
- **NO**: Finance panel tab, Timeline tab, "дублировать на день" in context menu
- **YES**: clean, balanced, readable design; cohesive and simple
- Statuses in Russian: Будущая / Прошедшая
- Goals and Expenses diary in sidebar (collapsible)

## Gotchas

- `STATUS_COLORS` uses `Record<string, string>` (not `Record<EventStatus, string>`) to support old DB rows with legacy status strings
- Marking a shift "done" sets its status to "past" (no separate done field)
- `use-planner.ts` normalizes legacy DB status strings on load (`e.status as string` cast needed to avoid TS errors)
- DB tables: `planner_entities`, `planner_events`, `planner_goals`, `planner_expenses`
- Run `pnpm --filter @workspace/db run push` after any schema change in `lib/db/src/schema/planner.ts`
- Home.tsx ~1600 lines; search by component name (e.g. `function AddEventPopup`) to navigate

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
