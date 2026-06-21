"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { LoadingState } from "@/components/LoadingState";
import { buildCoachContextFromSupabase } from "@/lib/buildCoachContext";
import { fileToDataUrl } from "@/lib/storage";
import { compressImage } from "@/lib/imageCompression";

type ChatMessage = { role: "user" | "assistant"; content: string; imageUrl?: string };

const INITIAL_MESSAGE: ChatMessage = {
  role: "assistant",
  content: "เล่าให้โค้ชฟังได้เลย วันนี้อยากเช็กเรื่องซ้อม กิน นอน หรือ recovery?",
};

const quickQuestions = [
  {
    label: "วันนี้ควรซ้อมอะไร",
    prompt: "วันนี้ควรซ้อมอะไรดีครับ ใช้ข้อมูล sleep/readiness, workout 7 วัน, weekly load, active race goal/plan ถ้ามี และบอกสิ่งที่ยังไม่รู้ด้วย",
  },
  {
    label: "สรุปวันนี้",
    prompt: "สรุปวันนี้ให้หน่อยครับ ขอวันที่เวลา ข้อมูลที่ใช้ประเมิน readiness, sleep, workout ล่าสุด, แปลภาษาคน และแผนวันนี้แบบมี option เบากว่าถ้าล้า",
  },
  {
    label: "ควรพักไหม",
    prompt: "วันนี้ควร recovery ยังไงดีครับ ดูจาก sleep, readiness, workout ล่าสุด, weekly load และให้ checklist สั้นๆ สำหรับคืนนี้",
  },
  {
    label: "กินหลังวิ่ง",
    prompt: "หลังซ้อมล่าสุดควรกินและเติมน้ำยังไงดีครับ ขอแบบ practical ตามความหนักของ session และข้อมูล sweat/calories ถ้ามี",
  },
];

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
  "อาหาร": "อันนี้กินได้มั้ยครับ สำหรับเป้าหมายวิ่ง/ลดไขมัน",
  "ฉลาก": "ช่วยดูฉลากนี้ให้หน่อยครับ เหมาะกับก่อน/หลังวิ่งไหม",
  "ผลวิ่ง": "ช่วยวิเคราะห์ผลวิ่งนี้และแนะนำซ้อมถัดไปครับ",
  "Recovery/Sleep": "ช่วยดู recovery วันนี้ว่าควรซ้อมยังไงครับ",
  "เจ็บ/ปวด": "ช่วยประเมินเชิงการซ้อมจากรูปนี้ครับ ไม่ต้องวินิจฉัยโรค",
  "อื่น ๆ": "ช่วยวิเคราะห์รูปนี้ในมุมการซ้อมและสุขภาพให้หน่อยครับ",
};

export function CoachChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Memory-efficient preview state
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

  function revokeObjectUrl(url: string | null | undefined) {
    if (!url?.startsWith("blob:")) return;
    URL.revokeObjectURL(url);
    objectUrlsRef.current.delete(url);
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        alert("รองรับเฉพาะไฟล์รูปภาพครับ");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        alert("รูปใหญ่เกินไป กรุณาใช้ไฟล์ไม่เกิน 5MB");
        return;
      }
      setSelectedFile(file);
      if (previewUrl) {
        revokeObjectUrl(previewUrl);
      }
      const localUrl = URL.createObjectURL(file);
      objectUrlsRef.current.add(localUrl);
      setPreviewUrl(localUrl);
      setImageIntent("อื่น ๆ"); // Default intent
    }
  };

  const clearImage = (revokePreview = true) => {
    setSelectedFile(null);
    if (revokePreview) {
      revokeObjectUrl(previewUrl);
    }
    setPreviewUrl(null);
    setImageIntent(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  async function ask(content: string) {
    const fileToProcess = selectedFile;
    const activeIntent = imageIntent;
    const activePreviewUrl = previewUrl;

    // Clear input states early so UI feels responsive
    setInput("");
    clearImage(false);
    setLoading(true);

    try {
      let base64DataUrl: string | undefined = undefined;

      if (fileToProcess) {
        try {
          // 1. Compress image client-side before sending
          const compressedBlob = await compressImage(fileToProcess);
          const compressedFile = new File([compressedBlob], fileToProcess.name, {
            type: "image/jpeg",
          });

          // 2. Convert compressed file to base64 dynamically for current request
          base64DataUrl = await fileToDataUrl(compressedFile);
        } catch (err) {
          console.error("Failed to compress image", err);
        }
      }

      // Add a session-only preview URL, avoiding persisted image storage.
      const nextMessages: ChatMessage[] = [
        ...messages,
        {
          role: "user",
          content,
          imageUrl: activePreviewUrl || undefined,
        },
      ];
      setMessages(nextMessages);

      const context = await buildCoachContextFromSupabase();
      if (process.env.NODE_ENV === "development") {
        console.info("[coach-context-debug]", {
          hasProfile: Boolean(context.profile),
          recentHistoryCount: context.sleep7d.length + context.workouts7d.length,
          hasActiveRace: Boolean(context.raceGoal),
          raceDate: context.raceDate,
          isRaceToday: context.isRaceToday,
          isRaceTomorrow: context.isRaceTomorrow,
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
      const result = await response.json();
      const finalMessages: ChatMessage[] = [
        ...nextMessages,
        {
          role: "assistant",
          content: result.message ?? "โค้ชตอบไม่สำเร็จ ลองใหม่อีกครั้ง",
        },
      ];
      setMessages(finalMessages);
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[coach-page-error]", error);
      }
      setMessages((prev) => [
        ...prev,
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
    const prompt = input.trim() || intentDefaultQuestions[intent] || "ช่วยวิเคราะห์รูปนี้หน่อยครับ";
    void ask(prompt);
  }

  function clearChat() {
    messages.forEach((message) => revokeObjectUrl(message.imageUrl));
    const reset = [INITIAL_MESSAGE];
    setMessages(reset);
    clearImage();
  }

  return (
    <section id="coach-chat" className="flex flex-1 flex-col gap-3 scroll-mt-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-600">ถามเร็ว</p>
          <button type="button" onClick={clearChat} className="shrink-0 text-xs font-semibold text-slate-400 hover:text-slate-600">
            ล้างแชท
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {quickQuestions.map((item) => (
            <button
              key={item.label}
              className="rounded-full bg-white/85 px-3 py-2.5 text-xs font-bold text-[#17201d] shadow-sm transition hover:bg-[#e7efea]"
              onClick={() => ask(item.prompt)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 rounded-3xl bg-white/70 p-3 shadow-sm">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`max-w-[88%] rounded-3xl px-4 py-3 text-sm leading-6 ${
              message.role === "user" ? "ml-auto bg-[#17201d] text-white" : "bg-slate-50/90 text-slate-700"
            }`}
          >
            {message.imageUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={message.imageUrl}
                alt="Attachment"
                className="max-w-full max-h-60 object-contain rounded-2xl mb-2 border border-slate-200"
              />
            )}
            <FormattedCoachText text={message.content} />
          </div>
        ))}
        {loading ? <LoadingState label="โค้ชกำลังตอบ..." /> : null}
        <div ref={bottomRef} />
      </div>

      {/* Image Preview & Intent Chips */}
      {previewUrl && (
        <div className="space-y-2 rounded-2xl bg-white/85 p-3 shadow-sm border border-slate-100/50">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Upload preview"
              className="h-16 w-16 object-cover rounded-2xl border border-slate-200 shadow-sm"
            />
            <div className="text-xs flex-1">
              <p className="font-bold text-[#17201d]">เลือกรูปภาพเรียบร้อย</p>
              <button
                type="button"
                onClick={() => clearImage()}
                className="mt-1 text-red-500 font-bold hover:underline"
              >
                ลบรูปภาพ
              </button>
            </div>
          </div>
          
          <div className="space-y-1.5 border-t border-slate-100 pt-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              แท็กประเภทรูปภาพเพื่อแนะนำคำถามและปรับบทวิเคราะห์:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {INTENT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setImageIntent(opt.key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition-all ${
                    imageIntent === opt.key
                      ? "bg-[#42677f] text-white border-[#42677f]"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="flex gap-2 rounded-3xl bg-white/90 p-2 shadow-sm">
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*"
          onChange={handleFileChange}
        />
        <button
          type="button"
          aria-label="แนบรูปเพื่อถามโค้ช"
          title="แนบรูปเพื่อถามโค้ช"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-2xl bg-slate-100 hover:bg-slate-200 p-3 text-sm transition-colors text-slate-600 shrink-0 flex items-center justify-center"
        >
          📷
        </button>
        <input
          className="min-w-0 flex-1 rounded-2xl border-0 bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#17201d]/10"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={previewUrl ? `แท็ก "${imageIntent}": พิมพ์ถาม หรือกด "ส่ง" เพื่อใช้คำถามแนะนำ...` : "ถามโค้ชเรื่องวันนี้..."}
        />
        <button
          className="rounded-2xl bg-[#17201d] px-5 py-3 text-sm font-bold text-white disabled:opacity-40 transition-opacity"
          type="submit"
          disabled={loading || (!input.trim() && !previewUrl)}
        >
          ส่ง
        </button>
      </form>
      <p className="text-center text-[10px] text-slate-400/80 mt-1.5 font-medium">
        รูปที่ส่งในแชทใช้ถามชั่วคราว ไม่บันทึกเข้า Report หรือคลังรูป
      </p>
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
