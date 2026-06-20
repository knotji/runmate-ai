"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { LoadingState } from "@/components/LoadingState";
import { buildCoachContextFromSupabase } from "@/lib/buildCoachContext";

type ChatMessage = { role: "user" | "assistant"; content: string };

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
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function ask(content: string) {
    if (!content.trim()) return;
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    const context = await buildCoachContextFromSupabase();
    const response = await fetch("/api/coach-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: nextMessages, context }),
    });
    const result = await response.json();
    const finalMessages: ChatMessage[] = [...nextMessages, { role: "assistant", content: result.message }];
    setMessages(finalMessages);
    setLoading(false);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(input);
  }

  function clearChat() {
    const reset = [INITIAL_MESSAGE];
    setMessages(reset);
    // TODO: persist coach_messages in Supabase when chat history UX is needed.
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
            <FormattedCoachText text={message.content} />
          </div>
        ))}
        {loading ? <LoadingState label="โค้ชกำลังตอบ..." /> : null}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={submit} className="flex gap-2 rounded-3xl bg-white/90 p-2 shadow-sm">
        <input
          className="min-w-0 flex-1 rounded-2xl border-0 bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#17201d]/10"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="ถามโค้ช..."
        />
        <button
          className="rounded-2xl bg-[#17201d] px-5 py-3 text-sm font-bold text-white disabled:opacity-40"
          type="submit"
          disabled={loading || !input.trim()}
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
        const bullet = trimmed.match(/^[-•]\s+(.*)$/);
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
