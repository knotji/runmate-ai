import { safetyDisclaimer } from "@/lib/constants";

export function Disclaimer() {
  return (
    <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-900">
      {safetyDisclaimer}
    </p>
  );
}
