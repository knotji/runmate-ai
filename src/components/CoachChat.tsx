"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ErrorState } from "@/components/ErrorState";
import { LoadingButton } from "@/components/LoadingButton";
import { LoadingState } from "@/components/LoadingState";
import { buildCoachContextFromSupabase } from "@/lib/buildCoachContext";
import { compressImage } from "@/lib/imageCompression";
import { fileToDataUrl } from "@/lib/storage";

type ChatMessage = { role: "user" | "assistant"; content: string; imageUrl?: string };

const INITIAL_MESSAGE: ChatMessage = {
  role: "assistant",
  content: "เล่าให้โค้ชฟังได้เลย วันนี้อยากคุยเรื่องซ้อม กิน นอน recovery หรืออะไรก็ได้",
};

type RaceQuickContext = { raceName: string | null; raceDistance: string | null; daysUntilRace: number | null };

function buildQuickQuestions(race: RaceQuickContext | null) {
  const raceTag = race
    ? [race.raceName, race.raceDistance, race.daysUntilRace != null ? `อีก ${race.daysUntilRace} วัน` : null]
        .filter(Boolean).join(" · ")
    : null;

  if (race) {
    return [
      {
        label: "ซ้อมวันนี้",
        prompt: `วันนี้ควรซ้อมอะไรดีครับ${raceTag ? ` (${raceTag})` : ""} ใช้ข้อมูล Report และแผนซ้อมช่วยดูให้หน่อย`,
      },
      {
        label: "Pace เป้าหมาย",
        prompt: `Pace เป้าหมายแข่ง${race.raceName ? ` ${race.raceName}` : ""}${race.raceDistance ? ` ${race.raceDistance}` : ""} ควรเป็นเท่าไหร่ครับ ดูจาก Report ล่าสุดด้วย`,
      },
      {
        label: "Recovery วันนี้",
        prompt: "วันนี้ควร recovery ยังไงดีครับ ดูจากข้อมูลล่าสุดด้วย",
      },
      {
        label: "โภชนาการก่อนแข่ง",
        prompt: `ควรกินยังไงในช่วง${race.daysUntilRace != null && race.daysUntilRace <= 3 ? "ก่อนแข่ง" : "ซ้อมเตรียมแข่ง"}ครับ เน้น carb และ timing ที่เหมาะสม`,
      },
    ];
  }

  return [
    {
      label: "วันนี้ควรซ้อมอะไร",
      prompt: "วันนี้ควรซ้อมอะไรดีครับ ใช้ข้อมูล Report ล่าสุดช่วยดูให้หน่อย",
    },
    {
      label: "สรุปวันนี้",
      prompt: "สรุปวันนี้ให้หน่อยครับ เอาแบบเข้าใจง่ายและใช้ข้อมูล Report ล่าสุด",
    },
    {
      label: "Recovery",
      prompt: "วันนี้ควร recovery ยังไงดีครับ",
    },
    {
      label: "กินหลังวิ่ง",
      prompt: "หลังวิ่งควรกินอะไรดีครับ ดูจากข้อมูลล่าสุดเท่าที่มี",
    },
  ];
}

const INTENT_OPTIONS = [
  { key: "อาหาร", label: "อาหาร" },
  { key: "ฉลาก", label: "ฉลาก" },
  { key: "ผลวิ่ง", label: "ผลวิ่ง" },
  { key: "Recovery/Sleep", label: "Recovery/Sleep" },
  { key: "เจ็บ/ปวด", label: "เจ็บ/ปวด" },
  { key: "อื่น ๆ", label: "อื่น ๆ" },
] as const;

type ImageIntentType = (typeof INTENT_OPTIONS)[number]["key"];

const intentDefaultQuestions: Record<ImageIntentType, string> = {
  อาหาร: "ช่วยดูอาหารในรูปนี้ให้หน่อยครับ เหมาะกับเป้าหมายซ้อมไหม",
  ฉลาก: "ช่วยอ่านฉลากนี้ให้หน่อยครับ เหมาะกับก่อน/หลังวิ่งไหม",
  ผลวิ่ง: "ช่วยดูผลวิ่งนี้และแนะนำต่อให้หน่อยครับ",
  "Recovery/Sleep": "ช่วยดู recovery/sleep ในรูปนี้ให้หน่อยครับ",
  "เจ็บ/ปวด": "ช่วยดูรูปนี้ในมุมการซ้อมอย่างปลอดภัยให้หน่อยครับ ไม่ต้องวินิจฉัยโรค",
  "อื่น ๆ": "ช่วยดูรูปนี้และแนะนำในมุมสุขภาพกับการซ้อมให้หน่อยครับ",
};

export function CoachChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [raceQuickContext, setRaceQuickContext] = useState<RaceQuickContext | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageIntent, setImageIntent] = useState<ImageIntentType | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const objectUrls = objectUrlsRef.current;
    return () => {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.clear();
    };
  }, []);

  useEffect(() => {
    buildCoachContextFromSupabase().then((ctx) => {
      if (ctx.raceGoal) {
        setRaceQuickContext({ raceName: ctx.raceName, raceDistance: ctx.raceDistance, daysUntilRace: ctx.daysUntilRace });
      }
    }).catch(() => {});
  }, []);

  function revokeObjectUrl(url: string | null | undefined) {
    if (!url?.startsWith("blob:")) return;
    URL.revokeObjectURL(url);
    objectUrlsRef.current.delete(url);
  }

  function clearImage(revokePreview = true) {
    setSelectedFile(null);
    if (revokePreview) revokeObjectUrl(previewUrl);
    setPreviewUrl(null);
    setImageIntent(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function clearChat() {
    messages.forEach((message) => revokeObjectUrl(message.imageUrl));
    setMessages([INITIAL_MESSAGE]);
    setError("");
    clearImage();
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");

    if (!file.type.startsWith("image/")) {
      setError("รองรับเฉพาะไฟล์รูปภาพครับ");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("รูปใหญ่เกินไป กรุณาใช้ไฟล์ไม่เกิน 5MB");
      return;
    }

    setSelectedFile(file);
    revokeObjectUrl(previewUrl);
    const localUrl = URL.createObjectURL(file);
    objectUrlsRef.current.add(localUrl);
    setPreviewUrl(localUrl);
    setImageIntent("อื่น ๆ");
  }

  async function ask(content: string) {
    const fileToProcess = selectedFile;
    const activeIntent = imageIntent;
    const activePreviewUrl = previewUrl;

    setInput("");
    setError("");
    clearImage(false);
    setLoading(true);

    const nextMessages: ChatMessage[] = [
      ...messages,
      {
        role: "user",
        content,
        imageUrl: activePreviewUrl || undefined,
      },
    ];
    setMessages(nextMessages);

    try {
      let base64DataUrl: string | undefined;

      if (fileToProcess) {
        const compressedBlob = await compressImage(fileToProcess);
        const compressedFile = new File([compressedBlob], fileToProcess.name, { type: "image/jpeg" });
        base64DataUrl = await fileToDataUrl(compressedFile);
      }

      const context = await buildCoachContextFromSupabase();
      if (process.env.NODE_ENV === "development") {
        console.info("[coach-context-debug]", {
          hasProfile: Boolean(context.profile),
          recentHistoryCount: context.sleep7d.length + context.workouts7d.length,
          hasActiveRace: Boolean(context.raceGoal),
          raceDate: context.raceDate,
          isRaceToday: context.isRaceToday,
          isRaceTomorrow: context.isRaceTomorrow,
          sleepAvg7dText: context.sleepAvg7dText,
          sleepNightCount7d: context.sleepNightCount7d,
          latestSleepDateKey: context.latestSleepDateKey,
        });
      }

      const response = await fetch("/api/coach-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          context,
          imageDataUrl: base64DataUrl,
          imageIntent: activeIntent || undefined,
        }),
      });

      if (!response.ok) throw new Error("coach chat api failed");
      const result = (await response.json()) as { message?: string };
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: result.message ?? "โค้ชตอบไม่สำเร็จ ลองใหม่อีกครั้ง",
        },
      ]);
    } catch (err) {
      if (process.env.NODE_ENV === "development") console.warn("[coach-page-error]", err);
      setMessages((current) => [
        ...current,
        { role: "assistant", content: "โค้ชตอบไม่สำเร็จ ลองใหม่อีกครั้ง" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!input.trim() && !previewUrl) return;
    const intent = imageIntent || "อื่น ๆ";
    const prompt = input.trim() || intentDefaultQuestions[intent] || "ช่วยดูรูปนี้ให้หน่อยครับ";
    void ask(prompt);
  }

  return (
    <section id="coach-chat" className="flex flex-1 scroll-mt-6 flex-col gap-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--foreground)]">ถามอะไรก็ได้</p>
            <p className="text-xs text-[var(--muted-text)]">โค้ชใช้ Report เป็นบริบท แต่ตอบแบบคุยกันธรรมชาติ</p>
          </div>
          <button type="button" onClick={clearChat} className="shrink-0 text-xs font-semibold text-[var(--muted-text)]/80 hover:text-[var(--foreground)]">
            ล้างแชท
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {buildQuickQuestions(raceQuickContext).map((item) => (
            <button
              key={item.label}
              className="rounded-full border border-[var(--border-warm)] bg-[var(--surface)]/85 px-3 py-2.5 text-xs font-bold text-[var(--foreground)] shadow-sm transition hover:bg-[var(--primary-soft)]"
              onClick={() => void ask(item.prompt)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 rounded-3xl border border-[var(--border-warm)] bg-[var(--surface)]/70 p-3 shadow-sm">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`max-w-[88%] rounded-3xl px-4 py-3 text-sm leading-6 ${
              message.role === "user" ? "ml-auto bg-[var(--primary)] text-white" : "bg-[var(--surface-muted)]/90 text-[var(--foreground)]"
            }`}
          >
            {message.imageUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={message.imageUrl}
                alt="Attachment"
                className="mb-2 max-h-60 max-w-full rounded-2xl border border-slate-200 object-contain"
              />
            ) : null}
            <FormattedCoachText text={message.content} />
          </div>
        ))}
        {loading ? <LoadingState label="โค้ชกำลังตอบ..." /> : null}
        <div ref={bottomRef} />
      </div>

      {previewUrl ? (
        <div className="space-y-2 rounded-2xl border border-[var(--border-warm)] bg-[var(--surface)]/85 p-3 shadow-sm">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Upload preview"
              className="h-16 w-16 rounded-2xl border border-slate-200 object-cover shadow-sm"
            />
            <div className="flex-1 text-xs">
              <p className="font-bold text-[var(--foreground)]">เลือกรูปเรียบร้อย</p>
              <p className="mt-1 text-[var(--muted-text)]">รูปนี้ใช้ตอบในแชทนี้เท่านั้น ไม่บันทึกเข้า Report</p>
              <button type="button" onClick={() => clearImage()} className="mt-1 font-bold text-[var(--status-rest)] hover:underline">
                ลบรูป
              </button>
            </div>
          </div>

          <div className="space-y-1.5 border-t border-[var(--border-warm)]/70 pt-2">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--muted-text)]">
              รูปนี้เกี่ยวกับอะไร
            </span>
            <div className="flex flex-wrap gap-1.5">
              {INTENT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setImageIntent(opt.key)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                    imageIntent === opt.key
                      ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                      : "border-[var(--border-warm)] bg-[var(--surface-muted)] text-[var(--muted-text)] hover:bg-[var(--primary-soft)]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <form onSubmit={submit} className="flex gap-2 rounded-3xl border border-[var(--border-warm)] bg-[var(--surface)]/90 p-2 shadow-sm">
        <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
        <button
          type="button"
          aria-label="แนบรูปเพื่อถามโค้ช"
          title="แนบรูปเพื่อถามโค้ช"
          onClick={() => fileInputRef.current?.click()}
          className="flex shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-muted)] p-3 text-sm text-[var(--muted-text)] transition-colors hover:bg-[var(--primary-soft)]"
        >
          📷
        </button>
        <input
          className="min-w-0 flex-1 rounded-2xl border-0 bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={previewUrl ? `ถามต่อเกี่ยวกับรูปนี้ หรือกดส่งเพื่อให้โค้ชดูรูป...` : "ถามโค้ชเรื่องซ้อม กิน นอน หรืออะไรก็ได้..."}
        />
        <LoadingButton
          className="rounded-2xl bg-[var(--primary)] px-5 py-3 text-sm font-bold text-white transition-opacity disabled:opacity-40"
          type="submit"
          loading={loading}
          loadingText="กำลังตอบ..."
          disabled={!input.trim() && !previewUrl}
        >
          ส่ง
        </LoadingButton>
      </form>
      <p className="mt-1.5 text-center text-[10px] font-medium text-[var(--muted-text)]/80">
        แชทนี้ใช้ถามชั่วคราว ไม่บันทึกเข้า Report อัตโนมัติ รูปที่แนบไม่ถูกเก็บถาวร
      </p>
      {error ? <ErrorState message={error} /> : null}
    </section>
  );
}

function FormattedCoachText({ text }: { text: string }) {
  const normalized = text
    .replace(/\\n/g, "\n")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1");

  return (
    <div className="space-y-2 whitespace-pre-wrap">
      {normalized.split("\n").map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={index} className="h-1" />;
        const bullet = trimmed.match(/^[-•*]\s+(.*)$/);
        if (bullet) {
          return (
            <div key={index} className="flex gap-2">
              <span className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" />
              <span>{bullet[1]}</span>
            </div>
          );
        }
        return <p key={index}>{trimmed}</p>;
      })}
    </div>
  );
}
