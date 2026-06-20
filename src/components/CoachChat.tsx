"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { LoadingState } from "@/components/LoadingState";
import { buildCoachContext } from "@/lib/buildCoachContext";

type ChatMessage = { role: "user" | "assistant"; content: string };

const CHAT_STORAGE_KEY = "runmate.chatHistory";
const MAX_STORED_MESSAGES = 40;

function loadChatHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  } catch { return []; }
}

function saveChatHistory(messages: ChatMessage[]) {
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)));
  } catch { /* ignore */ }
}

const suggestions = [
  "มอนิ่ง สรุปวันนี้ให้หน่อย",
  "วันนี้ควรวิ่งไหม",
  "พรุ่งนี้ long run ได้ไหม",
  "กินแบบนี้พอไหม",
  "HR สูงไปไหม",
  "นอนน้อยควรซ้อมอะไร",
];

const INITIAL_MESSAGE: ChatMessage = { role: "assistant", content: "เล่าให้โค้ชฟังได้เลย วันนี้อยากเช็กเรื่องซ้อม กิน นอน หรือ recovery?" };

const quickQuestions = [
  {
    label: "สรุปเช้านี้",
    prompt: "มอนิ่งครับ สรุปเช้านี้ให้หน่อย ขอวันที่เวลา ข้อมูลที่ใช้ประเมิน readiness, sleep, workout ล่าสุด, แปลภาษาคน และแผนวันนี้แบบมี option เบากว่าถ้าล้า",
  },
  {
    label: "วันนี้ซ้อมอะไร",
    prompt: "วันนี้ควรซ้อมอะไรดีครับ ใช้ข้อมูล sleep/readiness, workout 7 วัน, weekly load, active race goal/plan ถ้ามี และบอกสิ่งที่ยังไม่รู้ด้วย",
  },
  {
    label: "พรุ่งนี้ซ้อมอะไร",
    prompt: "พรุ่งนี้ควรซ้อมอะไรดีครับ ระบุด้วยว่าพรุ่งนี้คือวันที่เท่าไหร่ ใช้ race goal/plan ถ้ามี, weekly load, workout ล่าสุด, sleep/readiness และให้แผนหลักกับแผนเบา",
  },
  {
    label: "ซ้อมล่าสุด",
    prompt: "วิเคราะห์ซ้อมล่าสุดให้หน่อยครับ ดูว่า session นั้นหนักแค่ไหน HR สูงไปไหม pace/cadence บอกอะไร ส่งผลต่อ weekly load ยังไง และพรุ่งนี้ควรทำอะไร",
  },
  {
    label: "Long run?",
    prompt: "พรุ่งนี้ long run ได้ไหมครับ ประเมินแบบ conservative จาก weekly mileage, longest run 7 วัน, workout ล่าสุด, sleep/readiness, race goal/plan ถ้ามี และบอกข้อจำกัดข้อมูล",
  },
  {
    label: "HR สูงไหม",
    prompt: "ช่วยดูให้หน่อยว่า HR จากซ้อมล่าสุดสูงไปไหม เทียบกับชนิด workout, pace/speed, sleep/readiness และบอกว่าควรพักหรือซ้อมต่อแบบไหน",
  },
  {
    label: "กินหลังวิ่ง",
    prompt: "หลังซ้อมล่าสุดควรกินและเติมน้ำยังไงดีครับ ขอแบบ practical ตามความหนักของ session และข้อมูล sweat/calories ถ้ามี",
  },
  {
    label: "Recovery",
    prompt: "วันนี้ควร recovery ยังไงดีครับ ดูจาก sleep, readiness, workout ล่าสุด, weekly load และให้ checklist สั้นๆ สำหรับคืนนี้",
  },
];

export function CoachChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = loadChatHistory();
    if (stored.length > 0) {
      queueMicrotask(() => setMessages(stored));
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function ask(content: string) {
    if (!content.trim()) return;
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    const todayInsight = (() => {
      try {
        const TZ = 7 * 60 * 60 * 1000;
        const key = `runmate.coachInsight.${new Date(Date.now() + TZ).toISOString().slice(0, 10)}`;
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    })();
    const response = await fetch("/api/coach-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: nextMessages, context: { ...buildCoachContext(), todayInsight } }),
    });
    const result = await response.json();
    const finalMessages: ChatMessage[] = [...nextMessages, { role: "assistant", content: result.message }];
    setMessages(finalMessages);
    saveChatHistory(finalMessages);
    setLoading(false);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(input);
  }

  function clearChat() {
    const reset = [INITIAL_MESSAGE];
    setMessages(reset);
    localStorage.removeItem(CHAT_STORAGE_KEY);
  }

  return (
    <section className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {quickQuestions.map((item) => (
            <button
              key={item.label}
              className="rounded-full bg-[#17201d] px-3 py-2 text-xs font-semibold text-white"
              onClick={() => ask(item.prompt)}
            >
              {item.label}
            </button>
          ))}
          {suggestions.map((item) => (
            <button key={item} className="rounded-full bg-white/80 px-3 py-2 text-xs font-semibold text-slate-600" onClick={() => ask(item)}>
              {item}
            </button>
          ))}
        </div>
        <button type="button" onClick={clearChat} className="shrink-0 text-xs text-slate-400 hover:text-slate-600">
          ล้างแชท
        </button>
      </div>
      <div className="card flex flex-1 flex-col gap-3 p-4">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-6 ${
              message.role === "user" ? "ml-auto bg-[#17201d] text-white" : "bg-slate-50 text-slate-700"
            }`}
          >
            <FormattedCoachText text={message.content} />
          </div>
        ))}
        {loading ? <LoadingState label="โค้ชกำลังตอบ..." /> : null}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={submit} className="flex gap-2">
        <input className="control" value={input} onChange={(event) => setInput(event.target.value)} placeholder="ถามโค้ช..." />
        <button className="btn-primary shrink-0" type="submit">ส่ง</button>
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
