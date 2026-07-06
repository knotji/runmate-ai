"use client";

import { useState } from "react";

export function ReleaseNotesSection() {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="soft-panel mt-5 px-4 py-3 text-xs text-[var(--muted-text)]" data-testid="release-notes-section">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold uppercase tracking-[0.15em] text-[var(--label-color)]">ประวัติอัปเดต</p>
          {!expanded && (
            <div className="mt-1.5" data-testid="release-notes-preview">
              <p className="font-semibold text-[var(--foreground)]">v0.2</p>
              <p className="mt-0.5 text-[var(--muted-text)]">Goal-Aware Personal Running + Health Coach</p>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 rounded-full bg-[var(--surface-muted)] px-3 py-1.5 text-[11px] font-bold text-[var(--muted-text)] hover:bg-[var(--primary-soft)] transition-colors"
          data-testid="release-notes-toggle"
        >
          {expanded ? "ย่อ" : "ดูทั้งหมด"}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-4" data-testid="release-notes-expanded">
          <div>
            <p className="font-semibold text-[var(--foreground)]">v0.2 — Goal-Aware Coach</p>
            <ul className="mt-1.5 space-y-1 leading-5">
              <li>· ตั้งเป้าหมายหลักและรองในแท็บ "เป้าหมาย" — โค้ชปรับคำแนะนำให้ตรงกับเป้า</li>
              <li>· สิ่งที่ต้องระวัง (guardrail) — โค้ชจะลดความหนักอัตโนมัติเมื่อมีความเสี่ยง</li>
              <li>· Today แสดง goal strip — เห็นทันทีว่าวันนี้เป้าหมายกำหนดอะไร</li>
              <li>· Report มี goal progress insight — สรุปว่าสัปดาห์นี้เป็นยังไงกับเป้าหมาย</li>
              <li>· Coach รับรู้เป้าหมายทุก v0.2 ครั้งที่ตอบ — ไม่ต้องบอกซ้ำ</li>
              <li>· รองรับการว่ายน้ำ — แสดงระยะ ม. pace /100m และชื่อ ว่ายน้ำ/Recovery Swim</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-[var(--foreground)]">v0.1.3</p>
            <ul className="mt-1.5 space-y-1 leading-5">
              <li>· Today แสดงเหตุผลสั้น ๆ ว่าทำไมถึงแนะนำแบบนี้ — โหลดสูง, ฟื้นตัวต่ำ หรืออาการเจ็บ</li>
              <li>· Coach ได้รับข้อมูล signals ครบ (recovery, load, sleep, fuel, pain) ก่อนตอบทุกครั้ง</li>
              <li>· Report มีสรุปสั้น ๆ ของสัปดาห์นี้ — กม. วิ่ง, โหลด, การนอน และอาการเจ็บ</li>
              <li>· ช่วงเพซซ้อม คำนวณจากเป้าหมาย Race แสดงบน Race Goal และ Today</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-[var(--foreground)]">v0.1.2</p>
            <ul className="mt-1.5 space-y-1 leading-5">
              <li>· หน้า Pain มี Selector สถานะ — เลือกได้ว่าอาการตอนนี้เป็นยังไง</li>
              <li>· สถานะที่เลือกจะ override การประเมินอาการอัตโนมัติทันที ไม่ต้องรอ 48 ชม.</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-[var(--foreground)]">v0.1.0 Beta</p>
            <ul className="mt-1.5 space-y-1 leading-5">
              <li>· วันไหนฟื้นตัวต่ำหรือนอนน้อย โค้ชจะพูดนุ่ม ๆ และแนะนำลดโหลด ไม่กดดัน</li>
              <li>· Today, Coach และ Race ใช้ข้อมูล recovery เดียวกัน — คำแนะนำสอดคล้องกัน</li>
              <li>· Report มี Weekly Insight สรุปการนอน การวิ่ง และการฟื้นตัวรายสัปดาห์</li>
              <li>· Auto Sync โปรไฟล์ไม่เขียนทับค่าที่คุณแก้ไว้เอง</li>
              <li>· หน้า Upload มีคำอธิบายชัดขึ้นว่าแต่ละประเภทบันทึกอะไร</li>
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
