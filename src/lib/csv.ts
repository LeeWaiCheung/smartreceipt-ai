import { CATEGORIES, type Transaction } from "./types";
import { translate,type Locale } from "./i18n";
function safeCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export function transactionsCsv(rows: Transaction[],locale:Locale="zh-Hant"): string {
  const header = ["交易日期", "商家", "分類", "原始金額", "幣種", "稅額", "匯率", "匯率日期", "匯率來源", "港幣金額"].map(label=>translate(locale,label));
  const body = rows.map(row => [
    row.transaction_date, row.merchant, translate(locale,CATEGORIES.find(c => c.id === row.category_id)?.name || row.category_id),
    row.amount, row.currency, row.tax, row.exchange_rate, row.exchange_rate_date, translate(locale,row.exchange_rate_source), row.amount_hkd
  ]);
  return "\uFEFF" + [header, ...body].map(row => row.map(safeCell).join(",")).join("\r\n") + "\r\n";
}
