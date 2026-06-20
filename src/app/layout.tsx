import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import "./globals.css";
import { HistorySyncInit } from "@/components/HistorySyncInit";
import { AuthGuard } from "@/components/AuthGuard";
import { PWARegistration } from "@/components/PWARegistration";

const notoThai = Noto_Sans_Thai({
  variable: "--font-noto-thai",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "RunMate AI | โค้ชข้างทาง",
  description: "โค้ชวิ่ง กิน นอน และฟื้นตัวจากภาพถ่ายและสกรีนช็อตประจำวัน",
  appleWebApp: {
    capable: true,
    title: "RunMate AI",
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" className={notoThai.variable}>
      <body>
        <AuthGuard />
        <HistorySyncInit />
        <PWARegistration />
        {children}
      </body>
    </html>
  );
}
