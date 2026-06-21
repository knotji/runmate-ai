export type HistoryType = "sleep" | "meal" | "workout" | "body" | "summary" | "pain";

export type LocalHistoryItem = {
  id: string;
  type: HistoryType;
  createdAt: string;
  data: unknown;
};
