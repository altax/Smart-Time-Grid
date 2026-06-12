export type EventStatus = "overdue" | "confirmed" | "pending";

export interface Entity {
  id: string;
  name: string;
  color: string;
}

export type EventIcon = "none" | "gym" | "ozon" | "briefcase" | "star" | "car" | "food";

export const EVENT_ICON_LABELS: Record<EventIcon, string> = {
  none:      "—",
  gym:       "Качалка",
  ozon:      "Озон ПВЗ",
  briefcase: "Работа",
  star:      "Важное",
  car:       "Поездка",
  food:      "Еда",
};

export interface PlannerEvent {
  id: string;
  entityId: string;
  date: string;       // YYYY-MM-DD
  status: EventStatus;
  title: string;
  assignee: string;
  notes?: string;
  startTime?: string; // "HH:MM"
  endTime?: string;   // "HH:MM"
  icon?: EventIcon;
}

export const STATUS_COLORS: Record<EventStatus, string> = {
  overdue:   "#ef4444",
  confirmed: "#22c55e",
  pending:   "#f97316",
};

export const STATUS_LABELS: Record<EventStatus, string> = {
  overdue:   "Просрочено",
  confirmed: "Подтверждено",
  pending:   "Ожидание",
};

export const STATUS_CYCLE: EventStatus[] = ["pending", "confirmed", "overdue"];

export const ENTITY_PALETTE = [
  "#6366f1","#3b82f6","#0ea5e9","#06b6d4","#14b8a6",
  "#22c55e","#84cc16","#eab308","#f97316","#ef4444",
  "#ec4899","#a855f7","#8b5cf6",
];

/** Returns "2 ч 30 мин", "45 мин", "3 ч" or "" */
export function calcDuration(startTime: string, endTime: string): string {
  try {
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const total = (eh * 60 + em) - (sh * 60 + sm);
    if (total <= 0) return "";
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h === 0) return `${m} мин`;
    if (m === 0) return `${h} ч`;
    return `${h} ч ${m} мин`;
  } catch {
    return "";
  }
}

/** "09:00" → "9:00" for compact display */
export function fmtTime(t: string): string {
  return t?.startsWith("0") ? t.slice(1) : t;
}
