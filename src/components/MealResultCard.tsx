import type { MealAnalysis } from "@/types/logs";
import { DetailBlock, MetricGrid } from "@/components/ResultDetail";
import { formatCalories, formatMacro } from "@/lib/format";

export function MealResultCard({ result }: { result: MealAnalysis }) {
  const foods = getFoodNames(result);
  const coachNote = result.trainingFit?.coachNote ?? result.coach?.suggestion ?? result.coach?.aiSummary ?? "-";

  return (
    <section className="card p-5">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#6f8fa6]">Meal Result</p>
      <h2 className="mt-2 text-xl font-bold">{foods || "มื้ออาหาร"}</h2>
      <MetricGrid
        items={[
          { label: "Calories", value: formatCalories(result.nutrition?.caloriesKcal) },
          { label: "Protein", value: formatMacro(result.nutrition?.proteinG) },
          { label: "Carbs", value: formatMacro(result.nutrition?.carbsG) },
          { label: "Fat", value: formatMacro(result.nutrition?.fatG) },
        ]}
      />
      <DetailBlock title="Confidence">{result.confidence ?? "low"}</DetailBlock>
      <DetailBlock title="Coach Note" tone="green">{coachNote}</DetailBlock>
      <DetailBlock title="Estimate Note" tone="amber">ตัวเลขโภชนาการเป็นการประเมินคร่าว ๆ จากรูปอาหาร อาจคลาดเคลื่อนได้</DetailBlock>
    </section>
  );
}

function getFoodNames(result: MealAnalysis) {
  const names = result.detectedFoods?.map((food) => food.name).filter(Boolean).join(", ");
  return names || result.extracted?.detectedFood || "";
}
