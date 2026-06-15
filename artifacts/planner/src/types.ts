export type EventStatus = "planned" | "confirmed" | "past";

export interface Entity {
  id: string;
  name: string;
  color: string;
}

export type EventIcon = "none" | "briefcase" | "star" | "car" | "food";

export const EVENT_ICON_LABELS: Record<EventIcon, string> = {
  none:      "—",
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
  title?: string;
  notes?: string;
  earnings?: number;
  expenses?: number;
  done?: boolean;
  // legacy compat fields (not shown in UI):
  assignee?: string;
  startTime?: string;
  endTime?: string;
  icon?: EventIcon;
}

export interface Goal {
  id: string;
  name: string;
  amount: number;
}

export const STATUS_COLORS: Record<string, string> = {
  planned:   "#5b9cf6",
  confirmed: "#3ecf8e",
  past:      "#546070",
  // backward compat
  pending:   "#5b9cf6",
  overdue:   "#546070",
};

export const STATUS_GRADIENTS: Record<string, string> = {
  planned:   "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
  confirmed: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
  past:      "linear-gradient(135deg, #546070 0%, #3d4f5f 100%)",
};

export const STATUS_LABELS: Record<string, string> = {
  planned:   "Запланировано",
  confirmed: "Подтверждено",
  past:      "Прошедшее",
  // backward compat
  pending:   "Запланировано",
  overdue:   "Прошедшее",
};

export const STATUS_CYCLE: EventStatus[] = ["planned", "confirmed", "past"];

export const ENTITY_PALETTE = [
  "#6366f1","#3b82f6","#0ea5e9","#06b6d4","#14b8a6",
  "#22c55e","#84cc16","#eab308","#f97316","#ef4444",
  "#ec4899","#a855f7","#8b5cf6",
];

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

export function calcDurationMins(startTime: string, endTime: string): number {
  try {
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
  } catch { return 0; }
}

export function fmtTime(t: string): string {
  return t?.startsWith("0") ? t.slice(1) : t;
}

export function addMinutes(time: string, mins: number): string {
  try {
    const [h, m] = time.split(":").map(Number);
    const total = Math.max(0, Math.min(1439, h * 60 + m + mins));
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  } catch { return time; }
}

export function timeToMins(t: string): number {
  try { const [h, m] = t.split(":").map(Number); return h * 60 + m; } catch { return 0; }
}

export function hasTimeOverlap(s1: string, e1: string, s2: string, e2: string): boolean {
  return timeToMins(s1) < timeToMins(e2) && timeToMins(e1) > timeToMins(s2);
}
