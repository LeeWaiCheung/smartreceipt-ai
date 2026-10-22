import type { Metadata,Viewport } from "next";
import { Toaster } from "sonner";
import { LanguageProvider } from "@/components/language-provider";
import "./globals.css";
export const metadata:Metadata={
  title:{default:"SmartReceipt AI · 收據與支出管理",template:"%s · SmartReceipt AI"},
  description:"收據辨識、人工覆核、多幣種記帳、月度預算、支出看板與 CSV 匯出。",
  applicationName:"SmartReceipt AI",
  icons:{icon:"/icon.svg"}
};
export const viewport:Viewport={width:"device-width",initialScale:1,themeColor:"#087f66"};
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="zh-Hant"><body><LanguageProvider>{children}<Toaster position="top-center" richColors closeButton/></LanguageProvider></body></html>;
}
