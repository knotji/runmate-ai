import type { Metadata, Viewport } from "next";
import { Chakra_Petch, IBM_Plex_Sans_Thai } from "next/font/google";
import "./globals.css";
import { LocalCleanupInit } from "@/components/LocalCleanupInit";
import { AuthGuard } from "@/components/AuthGuard";
import { PWARegistration } from "@/components/PWARegistration";
import { OfflineBanner } from "@/components/OfflineBanner";
import { GoogleHealthSyncOnOpen } from "@/components/GoogleHealthSyncOnOpen";
import { Analytics } from "@vercel/analytics/next";
import { NavigationGuardProvider } from "@/lib/navigationGuard";

// Body/UI text. Kept on the historical --font-noto-thai variable name so
// globals.css's existing references don't need to change.
const notoThai = IBM_Plex_Sans_Thai({
  variable: "--font-noto-thai",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
});

// Display face for score numbers and headlines — technical/geometric,
// reads like a data-readout against the Trust Blue palette.
const chakraPetch = Chakra_Petch({
  variable: "--font-display",
  subsets: ["thai", "latin"],
  weight: ["500", "600", "700"],
});

export const viewport: Viewport = {
  themeColor: "#3B6EF6",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "RunMate AI | โค้ชข้างทาง",
  description: "โค้ชวิ่ง กิน นอน และฟื้นตัวจากภาพถ่ายและสกรีนช็อตประจำวัน",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "RunMate AI",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" className={`${notoThai.variable} ${chakraPetch.variable}`}>
      <body>
        <AuthGuard />
        <LocalCleanupInit />
        <PWARegistration />
        <GoogleHealthSyncOnOpen />
        <OfflineBanner />
        <NavigationGuardProvider>{children}</NavigationGuardProvider>
        <Analytics />
      </body>
    </html>
  );
}
