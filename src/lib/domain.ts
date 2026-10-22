import Decimal from "decimal.js";
import { z } from "zod";
import { CATEGORY_IDS, CURRENCIES, type Currency, type Transaction, type TransactionFilter } from "./types";

export function hongKongDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function monthKey(now = new Date()): string { return hongKongDate(now).slice(0, 7); }
export function previousMonths(month: string, count = 6): string[] {
  const [y, m] = month.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(Date.UTC(y, m - count + i, 1));
    return date.toISOString().slice(0, 7);
  });
}
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T00:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export const moneyString = z.string().trim().regex(/^\d{1,12}(\.\d{1,2})?$/, "請輸入最多兩位小數的正數金額")
  .pipe(z.string().refine(v => new Decimal(v).greaterThan(0), "金額必須大於 0"));
const taxString = z.string().trim().regex(/^\d{1,12}(\.\d{1,2})?$/, "稅額格式不正確");
export const transactionSchema = z.object({
  merchant: z.string().trim().min(1, "請填寫商家").max(160),
  transaction_date: z.string().refine(validDate, "請填寫有效日期")
    .refine(v => v <= hongKongDate(), "交易日期不能晚於今天"),
  amount: moneyString,
  currency: z.enum(CURRENCIES),
  tax: taxString.nullable(),
  category_id: z.enum(CATEGORY_IDS)
}).superRefine((v, ctx) => {
  if (v.tax !== null && taxString.safeParse(v.tax).success && moneyString.safeParse(v.amount).success && new Decimal(v.tax).greaterThan(v.amount)) {
    ctx.addIssue({ code: "custom", path: ["tax"], message: "稅額不能大於總金額" });
  }
});
export const extractionSchema = z.object({
  merchant: z.string().max(160).nullable(),
  transaction_date: z.string().nullable(),
  amount: z.union([z.string(), z.number()]).nullable().transform(v => v === null ? null : String(v)),
  currency: z.enum(CURRENCIES).nullable(),
  tax: z.union([z.string(), z.number()]).nullable().transform(v => v === null ? null : String(v)),
  category_id: z.enum(CATEGORY_IDS),
  warnings: z.array(z.string().max(300)).max(15).default([])
});
export function normalizeExtraction(value: unknown) {
  const result = extractionSchema.parse(value);
  if (result.transaction_date && !validDate(result.transaction_date)) {
    result.transaction_date = null;
    result.warnings.push("日期無法確認，請對照原圖填寫。");
  }
  if (result.amount && !moneyString.safeParse(result.amount).success) {
    result.amount = null;
    result.warnings.push("金額格式需要人工確認。");
  }
  if (result.tax !== null && !taxString.safeParse(result.tax).success) result.tax = null;
  return result;
}
export function convertToHkd(amount: string, rate: string): string {
  const a = new Decimal(amount), r = new Decimal(rate);
  if (!a.isFinite() || !r.isFinite() || a.lte(0) || r.lte(0)) throw new Error("金額或匯率無效");
  return a.times(r).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}
export function sumHkd(rows: Transaction[]): string {
  return rows.reduce((sum, row) => sum.plus(row.amount_hkd), new Decimal(0)).toFixed(2);
}
export function filterTransactions(rows: Transaction[], filter: TransactionFilter): Transaction[] {
  const q = filter.search.trim().toLocaleLowerCase();
  return rows.filter(row => (!q || row.merchant.toLocaleLowerCase().includes(q)) &&
    (!filter.category || row.category_id === filter.category) &&
    (!filter.start || row.transaction_date >= filter.start) &&
    (!filter.end || row.transaction_date <= filter.end))
    .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.created_at.localeCompare(a.created_at));
}
export function validateUpload(file: { name: string; size: number; type: string }) {
  const allowed: Record<string, string[]> = { "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"], "application/pdf": [".pdf"] };
  const extensions = allowed[file.type];
  if (!extensions || !extensions.some(ext => file.name.toLowerCase().endsWith(ext))) throw new Error("只支援 JPG、PNG 或 PDF 文件");
  if (file.size <= 0 || file.size > 10 * 1024 * 1024) throw new Error("每份文件需介乎 1 byte 至 10 MB");
}
export function requireCurrency(code: string): Currency {
  if (!CURRENCIES.includes(code as Currency)) throw new Error("不支援的幣種");
  return code as Currency;
}
