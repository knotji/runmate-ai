import type { MealContextSummary, HealthCheckContext, TodayCompletedWorkoutSummary } from "@/lib/buildCoachContext";

export type NutritionStatus = "low" | "ok" | "high" | "unknown";
export type WatchStatus = "low" | "watch" | "high" | "unknown";
export type VarietyStatus = "good" | "repetitive" | "unknown";

export type DailyNutritionBalance = {
  dateKey: string;
  mealCount: number;
  mealSlots: string[];
  proteinStatus: NutritionStatus;
  carbStatus: NutritionStatus;
  veggieFiberStatus: "low" | "ok" | "unknown";
  friedFatStatus: WatchStatus;
  sugarStatus: WatchStatus;
  varietyStatus: VarietyStatus;
  repeatedItems: string[];
  nextMealHints: string[];
  healthCheckBiases: string[];
  summaryText: string;
  coachHint: string;
  confidence: "low" | "medium" | "high";
  updatedAt: string;
};

// --- Keyword matchers ---

const PROTEIN_WORDS = /ไข่|ไก่|หมู|ปลา|กุ้ง|เต้าหู้|โปรตีน|นม|โยเกิร์ต|ทูน่า|ปลากระป๋อง|อกไก่|เนื้อ|ซีฟู้ด|แซลมอน|ปลาแซลมอน|ปลานิล|ปลาหมึก|ปลาดุก|ไก่ย่าง|ไก่ต้ม|ปลาย่าง|หมูย่าง|เนื้อย่าง|เนื้อวัว|ถั่วเหลือง|เวย์|whey|protein|egg|chicken|fish|pork|tofu|yogurt|milk|tuna|beef|shrimp|prawn|seafood|salmon|tilapia/i;

const CARB_WORDS = /ข้าว|ก๋วยเตี๋ยว|บะหมี่|ขนมปัง|โอ๊ต|มันฝรั่ง|ผลไม้|แป้ง|โจ๊ก|เส้น|พาสต้า|bread|rice|noodle|oat|potato|fruit|pasta|cereal/i;

const HEAVY_CARB_WORDS = /ข้าวขาว|ข้าวมันไก่|ข้าวหมูแดง|ข้าวกะเพรา|ก๋วยเตี๋ยว|บะหมี่|เส้นใหญ่|เส้นเล็ก|ราดหน้า|ผัดซีอิ๊ว|ข้าวผัด|ข้าวมันหมู|pad thai|fried rice|noodle/i;

const VEGGIE_FIBER_WORDS = /ผัก|สลัด|สุกี้|ต้มจืด|ต้มยำ|ผลไม้|ฝักสด|ถั่ว|ผักบุ้ง|บรอกโคลี|แครอท|ผักกาด|ฟักทอง|มะเขือ|กะหล่ำ|กล้วย|ส้ม|แอปเปิ้ล|โอ๊ต|fiber|salad|vegetable|veggie|broccoli|carrot|spinach|fruit|oat|bean/i;

const FRIED_FAT_WORDS = /ทอด|กรอบ|หมูกรอบ|ไก่ทอด|เฟรนช์ฟราย|ฟาสต์ฟู้ด|น้ำมัน|แกงกะทิ|กะทิ|เนื้อแปรรูป|ไส้กรอก|เบคอน|หมูสามชั้น|ข้าวมันไก่ทอด|crispy|fried|fries|oily|butter|cream|bacon|sausage|processed meat|deep.?fry/i;

const SUGAR_WORDS = /น้ำหวาน|ชาไข่มุก|บอบา|ชานม|โซดา|น้ำอัดลม|ขนมหวาน|เค้ก|ไอศกรีม|ช็อกโกแลต|ลูกอม|คุกกี้|วาฟเฟิล|ครองแครง|ไดฟุกุ|dessert|sweet|cake|ice cream|sugar|candy|bubble tea|milk tea|soda|juice|น้ำผลไม้/i;

const NO_SUGAR_WORDS = /ไม่หวาน|unsweetened|sugar.?free|zero sugar|น้ำเปล่า|น้ำสะอาด/i;

const LIGHT_COOKING_WORDS = /ต้ม|ย่าง|อบ|นึ่ง|สุกี้|เกาเหลา|ต้มจืด|ต้มยำ|ซุป|boiled|grilled|steamed|soup|baked/i;

// --- Main builder ---

export function buildDailyNutritionBalance(input: {
  dateKey: string;
  mealsToday: MealContextSummary[];
  latestHealthCheck: HealthCheckContext | null;
  todayPrimaryWorkout: TodayCompletedWorkoutSummary | null;
  isRecoveryDay?: boolean;
}): DailyNutritionBalance {
  const { dateKey, mealsToday, latestHealthCheck, todayPrimaryWorkout, isRecoveryDay } = input;
  const updatedAt = new Date().toISOString();

  if (mealsToday.length === 0) {
    return {
      dateKey,
      mealCount: 0,
      mealSlots: [],
      proteinStatus: "unknown",
      carbStatus: "unknown",
      veggieFiberStatus: "unknown",
      friedFatStatus: "unknown",
      sugarStatus: "unknown",
      varietyStatus: "unknown",
      repeatedItems: [],
      nextMealHints: [],
      healthCheckBiases: buildHealthCheckBiases(latestHealthCheck),
      summaryText: "ยังไม่มีมื้ออาหารวันนี้",
      coachHint: "",
      confidence: "low",
      updatedAt,
    };
  }

  // Aggregate all food text across meals
  const allFoodText = mealsToday
    .flatMap((meal) => meal.foods)
    .join(" ")
    .toLowerCase();

  const mealSlots = mealsToday.map((meal) => meal.mealType);

  // --- Protein ---
  const proteinHit = PROTEIN_WORDS.test(allFoodText);
  const lightMealsOnly = !CARB_WORDS.test(allFoodText) && !proteinHit;
  let proteinStatus: NutritionStatus;
  if (!proteinHit) {
    proteinStatus = "low";
  } else if (mealsToday.length >= 2 && proteinHit) {
    proteinStatus = "ok";
  } else {
    proteinStatus = "ok";
  }

  // Check explicit macro numbers if available
  const totalProteinG = mealsToday.reduce((sum, meal) => sum + (meal.proteinG ?? 0), 0);
  if (totalProteinG > 0) {
    if (totalProteinG < 30) proteinStatus = "low";
    else if (totalProteinG > 120) proteinStatus = "high";
    else proteinStatus = "ok";
  }

  // --- Carbs ---
  const carbHit = CARB_WORDS.test(allFoodText);
  const heavyCarbCount = mealsToday.filter((meal) =>
    meal.foods.some((food) => HEAVY_CARB_WORDS.test(food.toLowerCase()))
  ).length;

  let carbStatus: NutritionStatus;
  if (!carbHit) {
    carbStatus = "low";
  } else if (heavyCarbCount >= 2) {
    carbStatus = "high";
  } else {
    carbStatus = "ok";
  }

  const totalCarbsG = mealsToday.reduce((sum, meal) => sum + (meal.carbsG ?? 0), 0);
  if (totalCarbsG > 0) {
    if (totalCarbsG < 60) carbStatus = "low";
    else if (totalCarbsG > 200) carbStatus = "high";
  }

  // --- Veggie/fiber ---
  const veggieHit = VEGGIE_FIBER_WORDS.test(allFoodText);
  const veggieFiberStatus: "low" | "ok" | "unknown" = veggieHit ? "ok" : "low";

  // --- Fried/fat ---
  const friedHit = FRIED_FAT_WORDS.test(allFoodText);
  const lightHit = LIGHT_COOKING_WORDS.test(allFoodText);
  const friedMealsCount = mealsToday.filter((meal) =>
    meal.foods.some((food) => FRIED_FAT_WORDS.test(food.toLowerCase()))
  ).length;
  const hasFatLoadHeavy = mealsToday.some((meal) => meal.fatLoad === "heavy");

  let friedFatStatus: WatchStatus;
  if (friedHit || hasFatLoadHeavy) {
    friedFatStatus = friedMealsCount >= 2 || hasFatLoadHeavy ? "high" : "watch";
  } else if (lightHit) {
    friedFatStatus = "low";
  } else {
    friedFatStatus = "unknown";
  }

  // --- Sugar ---
  const sugarHit = SUGAR_WORDS.test(allFoodText);
  const noSugarHit = NO_SUGAR_WORDS.test(allFoodText);
  const sugarMealsCount = mealsToday.filter((meal) =>
    meal.foods.some((food) => SUGAR_WORDS.test(food.toLowerCase()))
      && !meal.foods.some((food) => NO_SUGAR_WORDS.test(food.toLowerCase()))
  ).length;

  let sugarStatus: WatchStatus;
  if (sugarHit && !noSugarHit) {
    sugarStatus = sugarMealsCount >= 2 ? "high" : "watch";
  } else if (noSugarHit && !sugarHit) {
    sugarStatus = "low";
  } else {
    sugarStatus = "unknown";
  }

  // --- Variety / repeats ---
  const proteinTokens = extractProteinTokens(mealsToday);
  const seen = new Map<string, number>();
  for (const token of proteinTokens) {
    seen.set(token, (seen.get(token) ?? 0) + 1);
  }
  const repeatedItems = [...seen.entries()]
    .filter(([, count]) => count >= 2)
    .map(([token]) => token);
  const varietyStatus: VarietyStatus =
    repeatedItems.length > 0 ? "repetitive" : mealsToday.length >= 2 ? "good" : "unknown";

  // --- Health check biases ---
  const healthCheckBiases = buildHealthCheckBiases(latestHealthCheck);

  // --- Next meal hints ---
  const isHardWorkout = todayPrimaryWorkout?.kind === "run" && (todayPrimaryWorkout.distanceKm ?? 0) >= 8;
  const nextMealHints = buildNextMealHints({
    proteinStatus,
    carbStatus,
    veggieFiberStatus,
    friedFatStatus,
    sugarStatus,
    varietyStatus,
    repeatedItems,
    healthCheckBiases,
    isHardWorkout,
    isRecoveryDay: Boolean(isRecoveryDay),
    lightMealsOnly,
  });

  // --- Summary text ---
  const parts: string[] = [];
  if (proteinStatus === "low") parts.push("โปรตีนยังน้อย");
  else if (proteinStatus === "ok") parts.push("โปรตีนพอใช้");
  if (carbStatus === "high") parts.push("คาร์บค่อนข้างเยอะ");
  else if (carbStatus === "low" && isHardWorkout) parts.push("คาร์บยังน้อย (มีซ้อมหนัก)");
  if (veggieFiberStatus === "low") parts.push("ผัก/ไฟเบอร์ยังน้อย");
  if (friedFatStatus === "high") parts.push("ของทอด/มันเยอะ");
  else if (friedFatStatus === "watch") parts.push("ของทอด/มันควรระวัง");
  if (sugarStatus === "high") parts.push("ของหวาน/น้ำหวานเยอะ");
  else if (sugarStatus === "watch") parts.push("ของหวาน/น้ำหวานระวังหน่อย");
  if (varietyStatus === "repetitive") parts.push(`เมนูซ้ำ: ${repeatedItems.join(", ")}`);

  const summaryText = parts.length
    ? parts.join(" · ")
    : mealsToday.length >= 2
    ? "สมดุลดี"
    : "มีข้อมูลบางส่วน";

  // --- Coach hint ---
  const coachHint = nextMealHints.slice(0, 2).join(" / ") || "";

  // --- Confidence ---
  const confidence: "low" | "medium" | "high" =
    mealsToday.length === 0 ? "low"
    : mealsToday.length === 1 ? "low"
    : mealsToday.length >= 3 ? "high"
    : "medium";

  return {
    dateKey,
    mealCount: mealsToday.length,
    mealSlots,
    proteinStatus,
    carbStatus,
    veggieFiberStatus,
    friedFatStatus,
    sugarStatus,
    varietyStatus,
    repeatedItems,
    nextMealHints,
    healthCheckBiases,
    summaryText,
    coachHint,
    confidence,
    updatedAt,
  };
}

function extractProteinTokens(meals: MealContextSummary[]): string[] {
  const tokens: string[] = [];
  const PROTEIN_LABELS: [RegExp, string][] = [
    [/ทูน่า|tuna/i, "ทูน่า"],
    [/ไข่|egg/i, "ไข่"],
    [/ไก่|chicken/i, "ไก่"],
    [/หมู|pork/i, "หมู"],
    [/ปลา|fish|แซลมอน|นิล|ดุก|ทับทิม/i, "ปลา"],
    [/เต้าหู้|tofu/i, "เต้าหู้"],
    [/เนื้อวัว|beef/i, "เนื้อวัว"],
    [/กุ้ง|shrimp|prawn/i, "กุ้ง"],
    [/โยเกิร์ต|yogurt/i, "โยเกิร์ต"],
  ];
  for (const meal of meals) {
    for (const food of meal.foods) {
      for (const [pattern, label] of PROTEIN_LABELS) {
        if (pattern.test(food)) {
          tokens.push(label);
          break;
        }
      }
    }
  }
  return tokens;
}

function buildHealthCheckBiases(hc: HealthCheckContext | null): string[] {
  if (!hc) return [];
  const flags = hc.nutritionFlags;
  const biases: string[] = [];
  if (flags.watchLDL || flags.watchTotalCholesterol || flags.watchTriglyceride) {
    biases.push("ลดทอด/มัน/แปรรูป เพิ่มผัก/ไฟเบอร์/ปลา");
  }
  if (flags.watchLiverEnzymes) {
    biases.push("เลี่ยงมื้อหนักมันจัด เน้นอาหารเบาและน้ำ");
  }
  if (flags.watchBloodSugar) {
    biases.push("เลี่ยงน้ำหวาน/ของหวาน คาร์บควรมีโปรตีนและไฟเบอร์");
  }
  if (flags.watchUricAcid) {
    biases.push("เลี่ยงเครื่องใน/แอลกอฮอล์/พิวรีนสูง ดื่มน้ำให้พอ");
  }
  if (flags.watchKidney) {
    biases.push("ไม่แนะนำโปรตีนสูงมากโดยไม่ปรึกษาแพทย์");
  }
  return biases;
}

function buildNextMealHints(input: {
  proteinStatus: NutritionStatus;
  carbStatus: NutritionStatus;
  veggieFiberStatus: "low" | "ok" | "unknown";
  friedFatStatus: WatchStatus;
  sugarStatus: WatchStatus;
  varietyStatus: VarietyStatus;
  repeatedItems: string[];
  healthCheckBiases: string[];
  isHardWorkout: boolean;
  isRecoveryDay: boolean;
  lightMealsOnly: boolean;
}): string[] {
  const hints: string[] = [];

  if (input.veggieFiberStatus === "low") hints.push("เพิ่มผัก/ไฟเบอร์มื้อต่อไป");
  if (input.proteinStatus === "low") hints.push("เพิ่มโปรตีนไม่ทอด เช่น ไข่ต้ม/ปลา/ไก่ย่าง");
  if (input.friedFatStatus === "high") hints.push("มื้อต่อไปเอาเบาๆ เลี่ยงทอด/มัน");
  else if (input.friedFatStatus === "watch") hints.push("มื้อต่อไปลดทอด/น้ำมัน");
  if (input.sugarStatus === "high" || input.sugarStatus === "watch") hints.push("เลี่ยงน้ำหวาน/ของหวานมื้อต่อไป");
  if (input.carbStatus === "high") {
    if (input.isRecoveryDay) hints.push("วันพักควรลดคาร์บลงหน่อย");
    else hints.push("คาร์บพอแล้ว มื้อต่อไปเน้นโปรตีนและผัก");
  }
  if (input.carbStatus === "low" && input.isHardWorkout) hints.push("ซ้อมหนักวันนี้ เติมคาร์บดีๆ เช่น ข้าว/กล้วย/ขนมปังโฮลวีต");
  if (input.varietyStatus === "repetitive" && input.repeatedItems.length > 0) {
    hints.push(`เลี่ยง${input.repeatedItems.join("/")}ซ้ำมื้อต่อไป`);
  }
  if (input.healthCheckBiases.length > 0) hints.push(input.healthCheckBiases[0]);

  return hints.slice(0, 4);
}

/** Compact form for embedding in Coach context notes */
export function formatNutritionBalanceForContext(balance: DailyNutritionBalance | null): string {
  if (!balance || balance.mealCount === 0) return "";
  const lines = [
    `NUTRITION BALANCE TODAY (${balance.dateKey}, ${balance.mealCount} meals, confidence=${balance.confidence}):`,
    `- Protein: ${balance.proteinStatus}`,
    `- Carbs: ${balance.carbStatus}`,
    `- Veggie/fiber: ${balance.veggieFiberStatus}`,
    `- Fried/fat: ${balance.friedFatStatus}`,
    `- Sugar: ${balance.sugarStatus}`,
    `- Variety: ${balance.varietyStatus}${balance.repeatedItems.length ? ` (repeated: ${balance.repeatedItems.join(", ")})` : ""}`,
  ];
  if (balance.nextMealHints.length) lines.push(`- Next meal hints: ${balance.nextMealHints.join("; ")}`);
  if (balance.healthCheckBiases.length) lines.push(`- Health check biases: ${balance.healthCheckBiases.join("; ")}`);
  if (balance.summaryText) lines.push(`- Summary: ${balance.summaryText}`);
  return lines.join("\n");
}
