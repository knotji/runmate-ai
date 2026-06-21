export function polishSleepInsightText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/\b(Readiness|Energy Score|Sleep score)\s*(อยู่ที่|:)?\s*(\d+(?:\.\d+)?)/gi, (_match, label: string, connector: string | undefined, raw: string) => {
      const value = Number(raw);
      if (!Number.isFinite(value)) return `${label}${connector ? ` ${connector}` : ""} ${raw}`;
      return `${label}${connector ? ` ${connector}` : " อยู่ที่"} ${Math.round(value)}`;
    })
    .replace(/(\d+(?:\.\d+)?)\/100/g, (_match, raw: string) => {
      const value = Number(raw);
      return Number.isFinite(value) ? `${Math.round(value)}/100` : `${raw}/100`;
    })
    .replace(/\bHR\s*N\/A\b/gi, "ไม่เน้น HR วันนี้")
    .replace(/\bPace\s*N\/A\b/gi, "ไม่ต้องจับ pace")
    .replace(/แม้\s*HRV\s*จะดีมาก\s*แต่/g, "HRV ดีมาก แต่")
    .replace(/ระบบแจ้งเตือนเรื่อง\s*Sleeping HR\s*ที่ยังผันผวนอยู่/g, "ชีพจรตอนนอนยังไม่นิ่งนัก")
    .replace(/Sleeping HR\s*ยังผันผวนอยู่/g, "ชีพจรตอนนอนยังไม่นิ่งนัก")
    .replace(/Sleeping HR/g, "ชีพจรตอนนอน")
    .replace(/ยังผันผวนอยู่/g, "ยังไม่นิ่งนัก")
    .replace(/\s{2,}/g, " ")
    .trim();
}
