export type HistoryType = "sleep" | "meal" | "workout" | "body" | "summary" | "pain" | "strength" | "strength_template" | "health_check";

export type LocalHistoryItem = {
  id: string;
  type: HistoryType;
  createdAt: string;
  recordedAt?: string;
  dateKey?: string;
  data: unknown;
};
