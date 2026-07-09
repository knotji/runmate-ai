export type HistoryType = "sleep" | "meal" | "workout" | "body" | "summary" | "pain" | "strength" | "strength_template" | "health_check" | "sick";

export type LocalHistoryItem = {
  id: string;
  type: HistoryType;
  createdAt: string;
  recordedAt?: string;
  dateKey?: string;
  source?: {
    provider: "samsung_health" | "garmin_connect" | "apple_health" | "strava" | "generic_csv" | "generic_image" | "manual";
    importType: "image" | "csv" | "pdf" | "manual";
    originalFileName?: string;
    detectedFormat?: string;
    importedAt: string;
    confidence?: number;
    missingFields?: string[];
  };
  data: unknown;
};
