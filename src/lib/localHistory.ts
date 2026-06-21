export type HistoryType = "sleep" | "meal" | "workout" | "body" | "summary" | "pain" | "strength" | "strength_template";

export type LocalHistoryItem = {
  id: string;
  type: HistoryType;
  createdAt: string;
  data: unknown;
};
