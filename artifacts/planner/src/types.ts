export type EventStatus = "overdue" | "confirmed" | "pending";

export interface Entity {
  id: string;
  name: string;
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
