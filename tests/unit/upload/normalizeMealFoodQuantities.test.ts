import { describe, expect, it } from "vitest";
import { normalizeMealFoodQuantities } from "@/lib/upload/normalizeMealFoodQuantities";

describe("normalizeMealFoodQuantities", () => {
  it("returns an empty array for non-array input", () => {
    expect(normalizeMealFoodQuantities(undefined)).toEqual([]);
  });

  it("keeps a valid positive integer quantity and unit as-is", () => {
    const result = normalizeMealFoodQuantities([
      { name: "ไข่ต้ม", quantity: 2, unit: "ฟอง", confidence: "high" },
    ]);
    expect(result).toEqual([{ name: "ไข่ต้ม", quantity: 2, unit: "ฟอง", confidence: "high" }]);
  });

  it("defaults quantity to 1 when missing", () => {
    const result = normalizeMealFoodQuantities([{ name: "ข้าวเหนียว" }]);
    expect(result[0].quantity).toBe(1);
    expect(result[0].unit).toBe("");
  });

  it("defaults quantity to 1 when zero, negative, or non-finite", () => {
    for (const bad of [0, -1, NaN, Infinity]) {
      const result = normalizeMealFoodQuantities([{ name: "ไก่ย่าง", quantity: bad }]);
      expect(result[0].quantity).toBe(1);
    }
  });

  it("rounds non-integer quantities", () => {
    const result = normalizeMealFoodQuantities([{ name: "ไม้ปิ้ง", quantity: 2.6, unit: "ไม้" }]);
    expect(result[0].quantity).toBe(3);
  });

  it("defaults unit to an empty string when missing or non-string", () => {
    const result = normalizeMealFoodQuantities([
      { name: "ข้าวผัด", quantity: 1, unit: undefined },
      { name: "ต้มยำ", quantity: 1, unit: 5 as unknown as string },
    ]);
    expect(result[0].unit).toBe("");
    expect(result[1].unit).toBe("");
  });
});
