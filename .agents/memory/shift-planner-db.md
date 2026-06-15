---
name: Shift planner DB migration
description: Architecture for PostgreSQL persistence and legacy status normalization in Мои Смены.
---

## What changed
Migrated from localStorage to PostgreSQL (Drizzle ORM). API server at port 8080 handles CRUD; Vite proxies `/api` in dev.

## DB tables
`planner_entities`, `planner_events`, `planner_goals`, `planner_expenses` — defined in `lib/db/src/schema/planner.ts`.
Push schema with: `pnpm --filter @workspace/db run push`

## Status normalization
`EventStatus` is now `"upcoming" | "past"`. The DB may contain old rows with `"planned"/"confirmed"/"pending"` → map to `"upcoming"`; `"overdue"` → `"past"`. Done in `use-planner.ts` on load by casting `e.status as string` before comparison (avoids TS "no overlap" error since the type is already narrowed).

**Why:** TypeScript correctly flags `EventStatus === "planned"` as impossible, but old DB rows need the migration. Cast to `string` before the legacy comparisons, then cast result back to `EventStatus`.

**How to apply:** Any future schema changes that add new status values must either: (a) add them to `EventStatus` type, or (b) normalize them in the `use-planner.ts` load handler.
