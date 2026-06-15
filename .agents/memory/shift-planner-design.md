---
name: Shift Planner Design Decisions
description: Key architecture and design constraints for the Мои Смены personal shift planner
---

## Core constraints

- **Single-user app**: no staff, no assignees, no multi-user features
- **3 statuses**: `planned` / `confirmed` / `past`
  - Backward-compat aliases: `pending` → planned, `overdue` → past
  - `STATUS_COLORS` must be `Record<string, string>` (not `Record<EventStatus, string>`) to handle old localStorage data
- **Fixed shift time**: 9:00–21:00 (12 hours) — shown as static info, NOT editable via UI
- **No time picker** in AddEventPopup or ViewPopup

## Design palette (Home.tsx design tokens)

- BASE = #0f1219 (main background)
- PANEL = #131926 (sidebar/topbar)
- BLUE = #5b9cf6 (planned status, primary)
- GREEN = #3ecf8e (confirmed status)
- SLATE = #546070 (past status)
- FG / FG_MED / FG_DIM = #c2cfdc / #6d8396 / #374557
- BORDER = rgba(255,255,255,0.07)

## Explicitly banned design patterns

- No glassmorphism (no backdrop-filter, no glass-panel CSS class)
- No gradient text (no grad-green/violet/amber classes)
- No glow effects (no glow-pulse animation)
- No SVG progress rings in sidebar
- No staff leaderboard in sidebar

## localStorage key versioning

- Entities: `planner_entities_v4`
- Events: `planner_events_v4_YYYY-MM`
- Goals: `planner_goals_v1`
- Bump version suffix on any breaking schema change

**Why:** Old data in v1-v3 keys used assignee, "pending"/"overdue" statuses, etc. V4 keys are clean.

## EntityRow color tokens (in-component)

- BLUE_R / GREEN_R / SLATE_R replace old VIOLET_R / AMBER_R
- CELL_PLANNED_BG / CELL_CONFIRMED_BG / CELL_PAST_BG replace old CELL_CONF_BG / CELL_PEND_BG
- Cell class for today: `today-col` (replaces removed `cell-today-empty`)
