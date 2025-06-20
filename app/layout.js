import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import AuthProviderLayout from "./AuthProviderLayout";

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
