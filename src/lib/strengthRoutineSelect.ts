export function suggestStrengthRoutine(
  workoutType: string,
  purpose: string | null | undefined,
  adjustment: string | null | undefined,
): string {
  const text = `${workoutType} ${purpose ?? ""} ${adjustment ?? ""}`.toLowerCase();
  if (/core|abs/.test(text)) return "Core & Abs";
  if (/recovery|ฟื้น|เบา|อ่อนโยน|mobility|เจ็บ|ปวด|pain|injury|rehab/.test(text)) return "Recovery Strength";
  if (/full.?body/.test(text)) return "Full Body";
  return "Full Body";
}
