import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import AuthProviderLayout from "./AuthProviderLayout";
import Script from "next/script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "حساب - تتبع المصاريف المشتركة",
  description: "تطبيق لتتبع المصاريف المشتركة وتسوية الديون",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl" className="dark">
      <head>
        <Script
          src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
          strategy="beforeInteractive"
        />
        <Script id="onesignal-init" strategy="afterInteractive">
          {`
            window.OneSignalDeferred = window.OneSignalDeferred || [];
            OneSignalDeferred.push(async function(OneSignal) {
              await OneSignal.init({
                appId: "1a90a8ff-be60-49cb-8e29-e15514113e26",
              });
            });
          `}
        </Script>
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-900 text-gray-200`}
      >
        <AuthProviderLayout>
          {children}
          <Toaster
            richColors
            theme="dark"
            position="top-center"
            duration={8000}
          />
        </AuthProviderLayout>
      </body>
    </html>
  );
}
