"use client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "../language-provider";
export const Dialog=DialogPrimitive.Root;
export const DialogTrigger=DialogPrimitive.Trigger;
export function DialogContent({children,className,...props}:React.ComponentProps<typeof DialogPrimitive.Content>) {
  const {t}=useLanguage();
  return <DialogPrimitive.Portal><DialogPrimitive.Overlay className="dialog-overlay"/>
    <DialogPrimitive.Content className={cn("dialog-content",className)} {...props}>
      {children}<DialogPrimitive.Close className="dialog-close" aria-label={t("關閉")}><X size={19}/></DialogPrimitive.Close>
    </DialogPrimitive.Content></DialogPrimitive.Portal>;
}
export const DialogTitle=DialogPrimitive.Title;
export const DialogDescription=DialogPrimitive.Description;
