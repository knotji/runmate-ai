"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { LoadingState } from "@/components/LoadingState";
import { buildCoachContextFromSupabase } from "@/lib/buildCoachContext";
import { fileToDataUrl, uploadImage } from "@/lib/storage";

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
    label: "Recovery",
    prompt: "วันนี้ควร recovery ยังไงดีครับ ดูจาก sleep, readiness, workout ล่าสุด, weekly load และให้ checklist สั้นๆ สำหรับคืนนี้",
  },
  {
    label: "กินหลังวิ่ง",
    prompt: "หลังซ้อมล่าสุดควรกินและเติมน้ำยังไงดีครับ ขอแบบ practical ตามความหนักของ session และข้อมูล sweat/calories ถ้ามี",
  },
];

export function CoachChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Image Upload states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

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
      try {
        const url = await fileToDataUrl(file);
        setImageDataUrl(url);
      } catch (err) {
        console.error("Failed to convert file to data URL", err);
      }
    }
  };

  const clearImage = () => {
    setSelectedFile(null);
    setImageDataUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  async function ask(content: string, customImageDataUrl?: string | null) {
    const activeDataUrl = customImageDataUrl !== undefined ? customImageDataUrl : imageDataUrl;
    const fileToUpload = selectedFile;

    // Clear input states early so UI feels responsive
    setInput("");
    clearImage();
    setLoading(true);

    try {
      let uploadedUrl: string | null = null;
      if (fileToUpload) {
        try {
          uploadedUrl = await uploadImage("workout", fileToUpload);
        } catch (err) {
          console.error("Failed to upload image to Supabase", err);
        }
      }

      const nextMessages: ChatMessage[] = [
        ...messages,
        {
          role: "user",
          content,
          imageUrl: uploadedUrl || activeDataUrl || undefined,
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
          imageDataUrl: activeDataUrl || undefined,
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
    if (!input.trim() && !imageDataUrl) return;
    const prompt = input.trim() || "ช่วยวิเคราะห์รูปนี้หน่อยครับ";
    void ask(prompt);
  }

  function clearChat() {
    const reset = [INITIAL_MESSAGE];
    setMessages(reset);
    clearImage();
  }

  return (
    <section className="flex flex-1 flex-col gap-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-600">อยากถามเรื่องไหนก่อน?</p>
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

      {imageDataUrl && (
        <div className="relative inline-block ml-2 mb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageDataUrl}
            alt="Upload preview"
            className="h-20 w-20 object-cover rounded-2xl border border-slate-200 shadow-sm"
          />
          <button
            type="button"
            onClick={clearImage}
            className="absolute -top-1.5 -right-1.5 h-6 w-6 bg-slate-800 hover:bg-slate-900 text-white rounded-full flex items-center justify-center text-sm font-bold shadow-md transition-colors"
          >
            ×
          </button>
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
          onClick={() => fileInputRef.current?.click()}
          className="rounded-2xl bg-slate-100 hover:bg-slate-200 p-3 text-sm transition-colors text-slate-600 shrink-0 flex items-center justify-center"
        >
          📷
        </button>
        <input
          className="min-w-0 flex-1 rounded-2xl border-0 bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#17201d]/10"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={imageDataUrl ? "พิมพ์ถามคำถามเกี่ยวกับรูปนี้..." : "ถามโค้ช..."}
        />
        <button
          className="rounded-2xl bg-[#17201d] px-5 py-3 text-sm font-bold text-white disabled:opacity-40 transition-opacity"
          type="submit"
          disabled={loading || (!input.trim() && !imageDataUrl)}
        >
          ส่ง
        </button>
      </form>
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
