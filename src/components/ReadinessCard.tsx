export function ReadinessCard({
  score = 72,
  label = "Good",
  note = "พร้อมซ้อมเบาถึงปานกลาง เน้นไม่ไล่ pace",
}: {
  score?: number;
  label?: string;
  note?: string;
}) {
  const { bg, text } = scoreColors(score);

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#6f8fa6]">ความพร้อม</p>
          <h2 className={`mt-1 text-lg font-bold ${text}`}>{label}</h2>
        </div>
        <div className={`grid h-20 w-20 place-items-center rounded-full text-2xl font-bold text-white ${bg}`}>
          {score}
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-600">{note}</p>
    </section>
  );
}

function scoreColors(score: number): { bg: string; text: string } {
  if (score >= 80) return { bg: "bg-green-500",  text: "text-green-600" };
  if (score >= 65) return { bg: "bg-[#42677f]",  text: "text-[#42677f]" };
  if (score >= 50) return { bg: "bg-amber-400",  text: "text-amber-600" };
  return              { bg: "bg-red-400",    text: "text-red-500"   };
}
