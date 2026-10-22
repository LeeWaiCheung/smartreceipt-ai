import { StatusScreen } from "@/components/status-screen";
export default function NotFound() {
  return <StatusScreen title="找不到頁面" message="頁面不存在或連結已失效。" action="回到總覽" href="/"/>;
}
