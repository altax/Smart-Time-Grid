# Мои Смены — Personal Shift Planner

A single-user personal shift planner for managing work locations (объекты) and shift dates.

## Run & Operate

- `pnpm --filter @workspace/planner run dev` — run the planner UI (port 5000)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- UI: React 19 + Vite 7 + Tailwind CSS 4
- Data: localStorage (no backend DB needed for single-user app)
- Icons: lucide-react

## Where things live

- `artifacts/planner/src/pages/Home.tsx` — entire app UI (single-file monolith with all components inline)
- `artifacts/planner/src/types.ts` — EventStatus, PlannerEvent, STATUS_COLORS/LABELS/CYCLE
- `artifacts/planner/src/hooks/use-planner.ts` — all data access via localStorage
- `artifacts/planner/src/index.css` — CSS variables and minimal custom classes

## Architecture decisions

- **Single-user, localStorage only** — no assignees, no multi-user, no backend auth required
- **3 statuses only**: `planned` / `confirmed` / `past` (+ backward-compat aliases `pending`/`overdue`)
- **Fixed shift time 9:00–21:00 (12h)**: shown as static info, not editable
- **Work locations** (объекты): user creates named locations, grid rows = locations
- **Design**: calm blue (#5b9cf6) primary, dark navy background, NO glassmorphism/glow/gradient text

## Product

- Monthly calendar grid: rows = work locations, columns = days of the month
- Sidebar: brand, month navigation, shift stats (planned/confirmed/past), upcoming shifts
- Topbar: stat summary + Finance / Timeline toggles
- Add/view shift popup: fixed time display, status picker, earnings, notes
- Demo data: 4 example locations (Ресторан на Невском, Кафе Садовая, etc.)

## User preferences

- **NO**: staff/assignee features, time picker, glassmorphism, gradient text, SVG rings, glow effects
- **YES**: clean, balanced, readable design; cohesive and simple
- Statuses in Russian: Запланировано / Подтверждено / Прошедшее

## Gotchas

- `STATUS_COLORS` uses `Record<string, string>` (not `Record<EventStatus, string>`) to support old localStorage keys with "pending"/"overdue"
- localStorage keys are versioned (`planner_entities_v4`, `planner_events_v4_YYYY-MM`) — bump version on breaking schema change
- Home.tsx is ~2200 lines single-file; search by component name (e.g. `function AddEventPopup`) to navigate

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
