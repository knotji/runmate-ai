import { ReactNode } from "react";

export function MotionPage({ children }: { children: ReactNode }) {
  return (
    <div className="rm-page-in flex flex-1 flex-col gap-4">
      {children}
    </div>
  );
}
