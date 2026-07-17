import { describe, it, expect } from "vitest";
import { buildMessage } from "@/app/api/push/send-trend-alerts/route";

describe("buildMessage", () => {
  it("includes the streak length, latest reading, and total rise", () => {
    const message = buildMessage(5, 68, 8);
    expect(message).toContain("5 วัน");
    expect(message).toContain("68 bpm");
    expect(message).toContain("8 bpm");
  });

  it("uses calm coaching language, not alarming wording", () => {
    const message = buildMessage(3, 60, 4);
    expect(message).toContain("ลองพักเพิ่ม");
    expect(message).not.toMatch(/อันตราย|ผิดปกติร้ายแรง|เร่งด่วน/);
  });
});
