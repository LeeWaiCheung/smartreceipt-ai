import { notFound } from "next/navigation";
import { SetupForm } from "@/components/setup-form";
export const dynamic="force-dynamic";
export default function SetupPage() {
  if(process.env.NODE_ENV!=="development"||process.env.VERCEL)notFound();
  return <SetupForm/>;
}
