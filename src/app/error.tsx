"use client";
import { StatusScreen } from "@/components/status-screen";
export default function ErrorPage({reset}:{reset:()=>void}) {
  return <StatusScreen title="暫時未能載入頁面" message="請重新嘗試；已儲存的交易記錄會保留。" action="重新載入" onRetry={reset}/>;
}
