import type { MealAnalysis } from "@/types/logs";
import { DetailBlock, MetricGrid } from "@/components/ResultDetail";

export function MealResultCard({ result }: { result: MealAnalysis }) {
  return (
    <section className="card p-5">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#6f8fa6]">Meal Result</p>
      <h2 className="mt-2 text-xl font-bold">{result.extracted.detectedFood}</h2>
      <MetricGrid
        items={[
          { label: "Protein", value: result.extracted.proteinLevel },
          { label: "Carb", value: result.extracted.carbLevel },
          { label: "Fat", value: result.extracted.fatLevel },
        ]}
      />
      <DetailBlock title="AI Summary">{result.coach.aiSummary}</DetailBlock>
      <DetailBlock title="Training Fit">{result.extracted.trainingFit}</DetailBlock>
      <DetailBlock title="Hydration">{result.extracted.hydrationSuggestion}</DetailBlock>
      <DetailBlock title="Suggestion" tone="green">{result.coach.suggestion}</DetailBlock>
      <DetailBlock title="Estimate Note" tone="amber">นี่เป็นการประเมินคร่าว ๆ จากรูป ไม่ใช่การนับแคลอรี่หรือสารอาหารแบบแม่นยำ</DetailBlock>
    </section>
  );
}
