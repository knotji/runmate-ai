import type { Page } from "@playwright/test";

export function reportDayByDate(page: Page, dateKey: string) {
  return page.locator(`[data-testid="report-day"][data-date-key="${dateKey}"]`);
}
