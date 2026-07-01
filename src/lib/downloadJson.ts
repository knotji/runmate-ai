export function downloadJsonFile(data: unknown, filename: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("downloadJsonFile is only available in the browser");
  }

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

export function buildRunMateExportFilename(args: {
  periodType: "week" | "month";
  startDateKey: string;
  endDateKey: string;
}): string {
  return `runmate-report-${args.periodType}-${args.startDateKey}_to_${args.endDateKey}.json`;
}
