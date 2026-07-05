"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ErrorState } from "@/components/ErrorState";
import { LoadingButton } from "@/components/LoadingButton";
import { buildCoachContextFromSupabase } from "@/lib/buildCoachContext";
import { compressImage } from "@/lib/imageCompression";
import { fileToDataUrl } from "@/lib/storage";
import { ensureSupabaseProfileSession } from "@/lib/profileStorage";
import { fetchRecentCoachMessages, clearCoachMessages } from "@/lib/coachMessages";

type ChatMessage = { role: "user" | "assistant"; content: string; imageUrl?: string };

type RaceQuickContext = { raceName: string | null; raceDistance: string | null; daysUntilRace: number | null };
type RecoveryChipContext = { isLowRecovery: boolean; hasActivePain: boolean };

function buildQuickQuestions(race: RaceQuickContext | null, recovery: RecoveryChipContext | null) {
  if (recovery?.hasActivePain) {
    return [
      { label: "เจ็บแบบนี้วิ่งได้ไหม", prompt: "มีอาการเจ็บอยู่ตอนนี้ วิ่งหรือซ้อมได้ไหมครับ ดูจากบันทึกอาการด้วย" },
      { label: "ควรพักนานแค่ไหน", prompt: "ควรพักนานแค่ไหนเพื่อให้หายก่อนกลับมาวิ่งครับ" },
      { label: "ขยับแทนวิ่งได้ไหม", prompt: "ช่วงที่เจ็บมีกิจกรรมอะไรทำได้บ้างครับ ที่ไม่ทำให้แย่ลง" },
      { label: "กินช่วยฟื้นตัว", prompt: "กินอะไรช่วยลดอาการอักเสบและฟื้นตัวเร็วขึ้นครับ" },
    ];
  }

  if (recovery?.isLowRecovery) {
    return [
      { label: "วันนี้ควรพักไหม", prompt: "Recovery และ sleep ยังต่ำอยู่ วันนี้ควรพักดีกว่าซ้อมไหมครับ ดูจากข้อมูลล่าสุดด้วย" },
      { label: "ถ้าจะวิ่งเบาแค่ไหน", prompt: "ถ้าจะวิ่งวันนี้ ควรเบาแค่ไหนครับ ดูจากข้อมูล recovery และนอนล่าสุด" },
      { label: "นอนน้อยซ้อมยังไง", prompt: "นอนน้อยแต่อยากขยับ ควรทำยังไงดีครับ ให้ได้ประโยชน์โดยไม่บาดเจ็บ" },
      { label: "กินช่วยฟื้นตัว", prompt: "กินอะไรช่วยฟื้นตัวและชาร์จพลังงานหลังนอนน้อยครับ" },
    ];
  }

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
        label: "ควรวิ่ง pace ไหน",
        prompt: `ควรวิ่ง pace ไหนดีครับ${race.raceName ? ` สำหรับ ${race.raceName}` : ""}${race.raceDistance ? ` ${race.raceDistance}` : ""} ดูจาก Report ล่าสุดและสภาพร่างกายวันนี้ด้วย`,
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

const MEAL_QUICK_QUESTIONS = [
  { label: "เช้านี้กินอะไรดี", prompt: "เช้านี้กินอะไรดีครับ ขอ 3 ตัวเลือกที่เหมาะกับข้อมูลวันนี้" },
  { label: "เที่ยงกินอะไรดี", prompt: "เที่ยงกินอะไรดีครับ ดูมื้อที่กินไปแล้ววันนี้และอย่าแนะนำซ้ำ" },
  { label: "เย็นนี้กินอะไรดี", prompt: "เย็นนี้กินอะไรดีครับ ช่วยดูมื้อก่อนหน้าวันนี้และจัดให้สมดุล" },
  { label: "กินอะไรไม่ซ้ำ", prompt: "มื้อต่อไปกินอะไรดีแบบไม่ซ้ำจากที่กินวันนี้ครับ" },
  { label: "จัดมื้อวันนี้", prompt: "ช่วยจัดมื้อวันนี้ให้สมดุลกับการซ้อมและผลตรวจสุขภาพล่าสุดถ้ามีครับ" },
] as const;

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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasLoadedHistory, setHasLoadedHistory] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [raceQuickContext, setRaceQuickContext] = useState<RaceQuickContext | null>(null);
  const [recoveryCtx, setRecoveryCtx] = useState<RecoveryChipContext | null>(null);
  const [showMealQuestions, setShowMealQuestions] = useState(false);
  const [manualCurrentPain, setManualCurrentPain] = useState(false);

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
    async function loadHistory() {
      try {
        const session = await ensureSupabaseProfileSession();
        if (session.ok) {
          const history = await fetchRecentCoachMessages(session.supabase, { userId: session.userId, limit: 20 });
          if (history && history.length > 0) {
            const mapped = history.map((m) => ({
              role: m.role,
              content: m.content,
            }));
            setMessages(mapped);
          } else {
            setMessages([]);
          }
        }
      } catch (err) {
        console.warn("[coach-chat] failed to load history:", err);
      } finally {
        setHasLoadedHistory(true);
      }
    }
    void loadHistory();
  }, []);

  useEffect(() => {
    buildCoachContextFromSupabase().then((ctx) => {
      if (ctx.raceGoal) {
        setRaceQuickContext({ raceName: ctx.raceName, raceDistance: ctx.raceDistance, daysUntilRace: ctx.daysUntilRace });
      }
      const sleepScore = ctx.recoverySystem?.axes?.sleep?.score ?? 100;
      const recoveryScore = ctx.recoverySystem?.axes?.recovery?.score ?? 100;
      setRecoveryCtx({
        isLowRecovery: sleepScore < 40 || recoveryScore < 45,
        hasActivePain: ctx.activePain,
      });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    function handleCurrentPainChange(event: Event) {
      const detail = (event as CustomEvent<{ active?: boolean }>).detail;
      setManualCurrentPain(Boolean(detail?.active));
    }
    window.addEventListener("runmate:coach-current-pain-changed", handleCurrentPainChange);
    return () => window.removeEventListener("runmate:coach-current-pain-changed", handleCurrentPainChange);
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

  async function handleClearChat() {
    const confirmClear = window.confirm("ล้างบทสนทนากับโค้ชทั้งหมดไหม?");
    if (!confirmClear) return;

    try {
      const session = await ensureSupabaseProfileSession();
      if (session.ok) {
        const success = await clearCoachMessages(session.supabase, { userId: session.userId });
        if (success) {
          messages.forEach((message) => revokeObjectUrl(message.imageUrl));
          setMessages([]);
          setError("");
          clearImage();
          showClearToast();
        } else {
          setError("ล้างบทสนทนาไม่สำเร็จ กรุณาลองใหม่");
        }
      }
    } catch (err) {
      console.warn("[coach-chat] failed to clear messages:", err);
      setError("ล้างบทสนทนาไม่สำเร็จ กรุณาลองใหม่");
    }
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

      const reportContext = await buildCoachContextFromSupabase();
      const context = {
        ...reportContext,
        manualCurrentPainOverride: manualCurrentPain,
        activePain: reportContext.activePain || manualCurrentPain,
      };
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
          activePain: context.activePain,
          recentPainHistory: context.recentPainHistory,
          painResolved: context.painResolved,
          manualCurrentPainOverride: context.manualCurrentPainOverride,
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
            <p className="text-sm font-bold text-[var(--foreground)]">คำถามที่น่าลอง</p>
            <p className="text-xs text-[var(--muted-text)]">ตอบทุกเรื่องซ้อม กิน นอน recovery · ใช้ข้อมูล Report เป็นพื้นหลัง</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {buildQuickQuestions(raceQuickContext, recoveryCtx).map((item) => (
            <button
              key={item.label}
              className="whitespace-nowrap rounded-full border border-[var(--border-warm)] bg-[var(--surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[var(--primary-soft)]"
              onClick={() => void ask(item.prompt)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setShowMealQuestions((value) => !value)}
          className="text-xs font-semibold text-[var(--muted-text)] hover:text-[var(--foreground)]"
        >
          {showMealQuestions ? "ซ่อนคำถามเรื่องอาหาร" : "คำถามเรื่องอาหาร"}
        </button>
        {showMealQuestions ? (
          <div className="flex flex-wrap gap-1.5">
            {MEAL_QUICK_QUESTIONS.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => void ask(item.prompt)}
                className="rounded-full bg-[var(--surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[var(--primary-soft)]"
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-[var(--foreground)]">บทสนทนาล่าสุด</h3>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClearChat}
              className="text-xs font-bold text-[var(--status-rest)] hover:underline"
            >
              ล้างแชท
            </button>
          )}
        </div>
        <p className="text-[11px] text-[var(--muted-text)]">
          Coach จะจำบทสนทนาล่าสุดไว้ตอบต่อเนื่อง คุณล้างได้ทุกเมื่อ
        </p>
      </div>

      <div
        data-testid="coach-chat-history"
        className="flex max-h-[55vh] min-h-[300px] flex-1 flex-col gap-4 overflow-y-auto rounded-3xl border border-[var(--border-warm)] bg-[var(--surface)]/70 p-4 pb-6 shadow-sm"
      >
        {hasLoadedHistory && messages.length === 0 ? (
          <div className="my-auto flex flex-col items-center justify-center text-center p-6" data-testid="chat-empty-state">
            <span className="text-3xl">💬</span>
            <p className="mt-2 text-sm font-bold text-[var(--foreground)]">ยังไม่มีบทสนทนากับโค้ช</p>
            <p className="mt-1 text-xs text-[var(--muted-text)]">ลองถามว่า วันนี้ควรซ้อมยังไงดี หรือ กินอะไรดีหลังวิ่ง</p>
          </div>
        ) : (
          messages.map((message, index) => {
            const isUser = message.role === "user";
            return (
              <div
                key={`${message.role}-${index}`}
                className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}
                data-testid={isUser ? "chat-message-user" : "chat-message-assistant"}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-text)]/70 px-1">
                  {isUser ? "คุณ" : "Coach"}
                </span>
                <div
                  className={`rounded-3xl px-4 py-3 text-sm leading-6 shadow-xs ${
                    isUser
                      ? "bg-[var(--primary)] text-white max-w-[85%]"
                      : "bg-[var(--surface-muted)]/90 text-[var(--foreground)] max-w-[90%]"
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
              </div>
            );
          })
        )}
        {loading ? (
          <div className="flex flex-col gap-1 items-start" data-testid="chat-loading-bubble">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-text)]/70 px-1">
              Coach
            </span>
            <div className="rounded-3xl bg-[var(--surface-muted)]/90 text-[var(--muted-text)] px-4 py-3 text-sm max-w-[90%] shadow-xs flex items-center gap-2">
              <span className="animate-pulse">Coach กำลังดูข้อมูลล่าสุด...</span>
            </div>
          </div>
        ) : null}
        <div ref={bottomRef} className="h-4 shrink-0" />
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
        <input ref={fileInputRef} type="file" aria-label="เลือกรูปเพื่อถามโค้ช" className="hidden" accept="image/*" onChange={handleFileChange} />
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
          aria-label="ถามโค้ชเรื่องซ้อม กิน นอน recovery หรืออาการเจ็บ"
          className="min-w-0 flex-1 rounded-2xl border-0 bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={previewUrl ? "ถามต่อเกี่ยวกับรูปนี้ หรือกดส่ง..." : "ถามโค้ชได้เลย..."}
        />
        <LoadingButton
          className="rounded-2xl bg-[var(--primary)] px-5 py-3 text-sm font-bold text-white transition-all disabled:bg-[var(--surface-muted)] disabled:text-[var(--muted-text)] disabled:cursor-not-allowed disabled:opacity-60"
          type="submit"
          loading={loading}
          loadingText="กำลังตอบ..."
          disabled={!input.trim() && !previewUrl}
        >
          ส่ง
        </LoadingButton>
      </form>
      <p className="mt-1.5 text-center text-[10px] font-medium text-[var(--muted-text)]/80">
        แชทนี้จะบันทึกประวัติการสนทนาล่าสุดไว้เพื่อการแนะนำที่ต่อเนื่องขึ้น คุณล้างแชทได้ทุกเมื่อ รูปที่แนบไม่ถูกเก็บถาวร
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

function showClearToast() {
  if (typeof window === "undefined") return;
  let container = document.getElementById("clear-chat-toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "clear-chat-toast-container";
    container.style.position = "fixed";
    container.style.bottom = "80px";
    container.style.left = "50%";
    container.style.transform = "translateX(-50%)";
    container.style.zIndex = "9999";
    container.style.width = "90%";
    container.style.maxWidth = "380px";
    container.style.pointerEvents = "none";
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.style.pointerEvents = "auto";
  toast.style.background = "var(--primary-strong, #4f8a78)";
  toast.style.color = "#ffffff";
  toast.style.padding = "10px 16px";
  toast.style.borderRadius = "14px";
  toast.style.fontSize = "12px";
  toast.style.fontWeight = "600";
  toast.style.boxShadow = "var(--shadow-floating)";
  toast.style.textAlign = "center";
  toast.style.opacity = "0";
  toast.style.transform = "translateY(12px)";
  toast.style.transition = "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)";
  toast.textContent = "ล้างแชทโค้ชแล้ว";
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  }, 10);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-8px)";
    setTimeout(() => {
      toast.remove();
      if (container && container.childNodes.length === 0) container.remove();
    }, 400);
  }, 3000);
}
