import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
export function hkd(value: string | number, decimals = 2) {
  return new Intl.NumberFormat("en-HK", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Number(value));
}
export function currencyName(code: string) { return code === "CNY" ? "CNY · 人民幣" : code; }
