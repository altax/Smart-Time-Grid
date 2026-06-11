export interface Task {
  id: string;            // uuid
  name: string;
  color: string;         // hex color
  startDate: string;     // "YYYY-MM-DD"
  endDate: string;       // "YYYY-MM-DD"
  category: "work" | "personal" | "health" | "study" | "other";
  priority: "low" | "medium" | "high";
  notes?: string;
  createdAt: string;
}

export const TASK_COLORS = [
  "#6366f1", // indigo
  "#f59e0b", // amber
  "#10b981", // emerald
  "#ef4444", // red
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#f97316", // orange
  "#ec4899"  // pink
];
