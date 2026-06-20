"use client";

import { useState } from "react";
import { invalidateCoachCache } from "@/lib/invalidateCoachCache";
import { createHistoryItem, saveHistoryItems } from "@/lib/cloudHistory";
import { saveRaceGoalAndPlan } from "@/lib/raceStorage";
import { sub25CoachMemory, sub25RaceGoal, sub25RacePlan } from "@/lib/sub25Goal";

export function SetSub25GoalButton() {
  const [status, setStatus] = useState("");

  async function setGoal() {
    setStatus("กำลังบันทึก...");
    const raceResult = await saveRaceGoalAndPlan(sub25RaceGoal, sub25RacePlan);
    const saved = createHistoryItem("summary", sub25CoachMemory.data);
    const historyResult = await saveHistoryItems([saved]);
    if (!raceResult.ok || !historyResult.ok) {
      setStatus("บันทึกไม่สำเร็จ กรุณาลองใหม่");
      return;
    }
    invalidateCoachCache();
    setStatus("ตั้งเป้าหมาย 5K Sub 25 สำหรับพรุ่งนี้แล้ว");
  }

  return (
    <div className="rounded-2xl bg-[#e7efea] p-4">
      <p className="text-sm font-bold text-[#17201d]">Race Goal ด่วน</p>
      <p className="mt-1 text-xs leading-5 text-slate-700">
        ตั้งบริบทให้โค้ชจำว่า พรุ่งนี้มีแข่ง 5K เป้าหมาย Sub 25 และวันนี้ต้องเน้นสด ไม่ซ้อมหนัก
      </p>
      <button className="btn-primary mt-3 w-full" onClick={() => void setGoal()} type="button">
        Set 5K Sub 25 goal
      </button>
      {status ? <p className="mt-2 text-xs font-semibold text-[#42677f]">{status}</p> : null}
    </div>
  );
}
