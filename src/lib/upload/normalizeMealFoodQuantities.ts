import type { MealAnalysis } from "@/types/logs";

/**
 * Ensures every detected food item has a positive integer quantity and a string unit,
 * defaulting to quantity 1 / unit "" when the AI (or a user edit) omits them.
 */
export function normalizeMealFoodQuantities(
  foods: MealAnalysis["detectedFoods"] | undefined,
): MealAnalysis["detectedFoods"] {
  if (!Array.isArray(foods)) return [];
  return foods.map((food) => ({
    ...food,
    quantity: Number.isFinite(food.quantity) && Number(food.quantity) > 0 ? Math.round(Number(food.quantity)) : 1,
    unit: typeof food.unit === "string" ? food.unit : "",
  }));
}
