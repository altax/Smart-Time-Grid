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
  earnings?: number;  // руб. за смену
  expenses?: number;  // руб. трат
  done?: boolean;     // выполнено
}

export interface Goal {
  id: string;
  name: string;
  amount: number;
}

export const STATUS_COLORS: Record<EventStatus, string> = {
  overdue:   "#f43f5e",
  confirmed: "#10b981",
  pending:   "#f59e0b",
};

export const STATUS_GRADIENTS: Record<EventStatus, string> = {
  overdue:   "linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)",
  confirmed: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
  pending:   "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
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

/** Returns duration in minutes */
export function calcDurationMins(startTime: string, endTime: string): number {
  try {
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
  } catch { return 0; }
}

/** "09:00" → "9:00" for compact display */
export function fmtTime(t: string): string {
  return t?.startsWith("0") ? t.slice(1) : t;
}

/** Add minutes to a "HH:MM" string */
export function addMinutes(time: string, mins: number): string {
  try {
    const [h, m] = time.split(":").map(Number);
    const total = Math.max(0, Math.min(1439, h * 60 + m + mins));
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  } catch { return time; }
}

/** "HH:MM" → minutes since midnight */
export function timeToMins(t: string): number {
  try { const [h, m] = t.split(":").map(Number); return h * 60 + m; } catch { return 0; }
}

/** Returns true if time intervals [s1,e1) and [s2,e2) overlap */
export function hasTimeOverlap(s1: string, e1: string, s2: string, e2: string): boolean {
  return timeToMins(s1) < timeToMins(e2) && timeToMins(e1) > timeToMins(s2);
}
