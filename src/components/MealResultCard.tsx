import type { MealAnalysis } from "@/types/logs";
import { DetailBlock, MetricGrid } from "@/components/ResultDetail";
import { formatCalories, formatMacro } from "@/lib/format";

export function MealResultCard({ result }: { result: MealAnalysis }) {
  const foods = getFoodNames(result);
  const coachNote = result.trainingFit?.coachNote ?? result.coach?.suggestion ?? result.coach?.aiSummary ?? "-";

  return (
    <section className="card p-5">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#6f8fa6]">ผลประเมินมื้ออาหาร</p>
      <h2 className="mt-2 text-xl font-bold">{foods || "มื้ออาหาร"}</h2>
      <MetricGrid
        items={[
          { label: "พลังงาน", value: formatCalories(result.nutrition?.caloriesKcal) },
          { label: "โปรตีน", value: formatMacro(result.nutrition?.proteinG) },
          { label: "คาร์บ", value: formatMacro(result.nutrition?.carbsG) },
          { label: "ไขมัน", value: formatMacro(result.nutrition?.fatG) },
        ]}
      />
      <DetailBlock title="ความมั่นใจของข้อมูล">{confidenceLabel(result.confidence)}</DetailBlock>
      <DetailBlock title="คำแนะนำจากโค้ช" tone="green">{coachNote}</DetailBlock>
      <DetailBlock title="หมายเหตุ" tone="amber">ตัวเลขโภชนาการเป็นการประเมินคร่าว ๆ จากรูปอาหาร อาจคลาดเคลื่อนได้</DetailBlock>
    </section>
  );
}

function confidenceLabel(value: MealAnalysis["confidence"]): string {
  if (value === "high") return "สูง";
  if (value === "medium") return "ปานกลาง";
  return "ข้อมูลอาจคลาดเคลื่อน";
}

function getFoodNames(result: MealAnalysis) {
  const names = result.detectedFoods?.map((food) => food.name).filter(Boolean).join(", ");
  return names || result.extracted?.detectedFood || "";
}
