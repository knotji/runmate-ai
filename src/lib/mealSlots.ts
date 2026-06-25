export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack" | "other";

export function inferMealSlotFromTime(dateLike: Date | string | number | null | undefined): MealSlot | null {
  if (!dateLike) return null;
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;

  let hour = 0;
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Bangkok",
      hour: "numeric",
      hour12: false,
    });
    const parts = formatter.formatToParts(d);
    const hourPart = parts.find(p => p.type === 'hour');
    if (hourPart) {
      hour = Number(hourPart.value);
    } else {
      hour = new Date(d.getTime() + 7 * 60 * 60 * 1000).getUTCHours();
    }
  } catch {
    hour = new Date(d.getTime() + 7 * 60 * 60 * 1000).getUTCHours();
  }

  // 05:00–10:59 → breakfast
  // 11:00–14:59 → lunch
  // 15:00–16:59 → snack
  // 17:00–21:59 → dinner
  // otherwise → other
  if (hour >= 5 && hour <= 10) return "breakfast";
  if (hour >= 11 && hour <= 14) return "lunch";
  if (hour >= 15 && hour <= 16) return "snack";
  if (hour >= 17 && hour <= 21) return "dinner";
  return "other";
}

function extractMealData(item: unknown): Record<string, unknown> | null {
  if (!item || typeof item !== "object") return null;
  const obj = item as Record<string, unknown>;
  const d = obj.data;
  if (d && typeof d === "object") {
    const dObj = d as Record<string, unknown>;
    if (dObj.data && typeof dObj.data === "object" && !Array.isArray(dObj.data)) {
      const inner = dObj.data as Record<string, unknown>;
      if ("mealType" in inner || "nutrition" in inner || "detectedFoods" in inner) {
        return inner;
      }
    }
    return dObj;
  }
  return obj;
}

export function normalizeMealSlot(value: unknown, fallbackDate?: string | Date | number): MealSlot {
  if (!value) {
    if (fallbackDate) {
      const d = new Date(fallbackDate);
      if (!Number.isNaN(d.getTime())) {
        const mins = d.getUTCMinutes();
        const secs = d.getUTCSeconds();
        const ms = d.getUTCMilliseconds();
        const isReliable = !(mins === 0 && secs === 0 && ms === 0);
        if (isReliable) {
          const inferred = inferMealSlotFromTime(d);
          if (inferred) return inferred;
        }
      }
    }
    return "other";
  }

  let itemData: Record<string, unknown> | null = null;
  if (typeof value === "object" && value !== null) {
    const valObj = value as Record<string, unknown>;
    if ("type" in valObj && valObj.type === "meal") {
      itemData = extractMealData(valObj);
    } else if ("detectedFoods" in valObj || "mealType" in valObj) {
      itemData = valObj;
    }
  }

  let slotStr = "";
  let combinedText = "";

  if (itemData) {
    slotStr = ((itemData.mealType as string) || "").toLowerCase().trim();
    const foodsList = itemData.detectedFoods as { name?: string }[] | undefined;
    const foodNames = foodsList?.map((food) => food.name).filter(Boolean).join(" ").toLowerCase() || "";
    const mealText = ((itemData.originalMealText as string) || "").toLowerCase();
    const note = ((itemData.note as string) || "").toLowerCase();
    combinedText = `${foodNames} ${mealText} ${note}`;
  } else if (typeof value === "string") {
    slotStr = value.toLowerCase().trim();
  }

  if (slotStr) {
    if (slotStr.includes("breakfast") || slotStr.includes("morning") || slotStr.includes("เช้า") || slotStr.includes("มื้อเช้า")) {
      return "breakfast";
    }
    if (slotStr.includes("lunch") || slotStr.includes("noon") || slotStr.includes("afternoon") || slotStr.includes("กลางวัน") || slotStr.includes("เที่ยง") || slotStr.includes("มื้อกลางวัน")) {
      return "lunch";
    }
    if (slotStr.includes("dinner") || slotStr.includes("evening") || slotStr.includes("เย็น") || slotStr.includes("ค่ำ") || slotStr.includes("มื้อเย็น")) {
      return "dinner";
    }
    if (slotStr.includes("snack") || slotStr.includes("ของว่าง") || slotStr.includes("ขนม") || slotStr.includes("เครื่องดื่ม") || slotStr.includes("drink") || slotStr.includes("beverage") || slotStr.includes("pre-run") || slotStr.includes("post-run")) {
      return "snack";
    }
  }

  if (combinedText) {
    if (combinedText.includes("มื้อเช้า") || combinedText.includes("เช้า") || combinedText.includes("breakfast") || combinedText.includes("morning")) {
      return "breakfast";
    }
    if (combinedText.includes("มื้อกลางวัน") || combinedText.includes("กลางวัน") || combinedText.includes("เที่ยง") || combinedText.includes("lunch") || combinedText.includes("noon")) {
      return "lunch";
    }
    if (combinedText.includes("มื้อเย็น") || combinedText.includes("เย็น") || combinedText.includes("ค่ำ") || combinedText.includes("dinner") || combinedText.includes("evening")) {
      return "dinner";
    }
    if (combinedText.includes("ของว่าง") || combinedText.includes("ขนม") || combinedText.includes("เครื่องดื่ม") || combinedText.includes("snack") || combinedText.includes("drink") || combinedText.includes("beverage")) {
      return "snack";
    }
  }

  if (fallbackDate) {
    const d = new Date(fallbackDate);
    if (!Number.isNaN(d.getTime())) {
      const mins = d.getUTCMinutes();
      const secs = d.getUTCSeconds();
      const ms = d.getUTCMilliseconds();
      const isReliable = !(mins === 0 && secs === 0 && ms === 0);
      if (isReliable) {
        const inferred = inferMealSlotFromTime(d);
        if (inferred) return inferred;
      }
    }
  }

  return "other";
}

export function getMealSlotLabel(slot: MealSlot): string {
  switch (slot) {
    case "breakfast": return "มื้อเช้า";
    case "lunch": return "มื้อกลางวัน";
    case "dinner": return "มื้อเย็น";
    case "snack": return "ของว่าง";
    default: return "อื่น ๆ";
  }
}

export function getMealSlotIcon(slot: MealSlot): string {
  switch (slot) {
    case "breakfast": return "🍳";
    case "lunch": return "🍱";
    case "dinner": return "🌙";
    case "snack": return "🍌";
    default: return "🍽️";
  }
}

export function getMealSlotOrder(slot: MealSlot): number {
  switch (slot) {
    case "breakfast": return 1;
    case "lunch": return 2;
    case "dinner": return 3;
    case "snack": return 4;
    default: return 5;
  }
}
