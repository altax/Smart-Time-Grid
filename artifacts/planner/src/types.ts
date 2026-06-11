export type EventStatus = "overdue" | "confirmed" | "pending";

export interface Entity {
  id: string;
  name: string;
  color: string;
}

export interface PlannerEvent {
  id: string;
  entityId: string;
  date: string; // YYYY-MM-DD
  status: EventStatus;
  title: string;
  assignee: string;
  notes?: string;
}

export const STATUS_COLORS: Record<EventStatus, string> = {
  overdue: "#ef4444",
  confirmed: "#22c55e",
  pending: "#f97316",
};

export const STATUS_LABELS: Record<EventStatus, string> = {
  overdue: "Просрочено",
  confirmed: "Подтверждено",
  pending: "Ожидание",
};

export const STATUS_CYCLE: EventStatus[] = ["pending", "confirmed", "overdue"];

export const ENTITY_PALETTE = [
  "#6366f1", "#3b82f6", "#0ea5e9", "#06b6d4", "#14b8a6",
  "#22c55e", "#84cc16", "#eab308", "#f97316", "#ef4444",
  "#ec4899", "#a855f7", "#8b5cf6",
];
