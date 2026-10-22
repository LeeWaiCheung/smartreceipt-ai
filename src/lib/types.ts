export const CURRENCIES = ["HKD", "USD", "CNY"] as const;
export type Currency = typeof CURRENCIES[number];
export const CATEGORY_IDS = ["food", "transport", "office", "software", "utilities", "travel", "other"] as const;
export type CategoryId = typeof CATEGORY_IDS[number];
export const CATEGORIES = [
  { id: "food", name: "餐飲", color: "#168b70", icon: "Utensils" },
  { id: "transport", name: "交通", color: "#74c5af", icon: "TrainFront" },
  { id: "office", name: "辦公", color: "#8498d3", icon: "BriefcaseBusiness" },
  { id: "software", name: "軟件訂閱", color: "#b49bdb", icon: "Layers" },
  { id: "utilities", name: "繳費", color: "#e3b66d", icon: "Zap" },
  { id: "travel", name: "差旅", color: "#6daec8", icon: "Plane" },
  { id: "other", name: "其他", color: "#a0a9b6", icon: "MoreHorizontal" }
] as const;

export type ReceiptStatus = "uploaded" | "processing" | "needs_review" | "confirmed" | "failed";
export interface Extraction {
  merchant: string | null;
  transaction_date: string | null;
  amount: string | null;
  currency: Currency | null;
  tax: string | null;
  category_id: CategoryId;
  warnings: string[];
}
export interface Receipt {
  id: string;
  user_id: string;
  original_name: string;
  storage_path: string;
  page_paths: string[];
  file_hash: string;
  mime_type: string;
  file_size: number;
  status: ReceiptStatus;
  extraction: Extraction | null;
  model: string | null;
  error_message: string | null;
  created_at: string;
  preview_url?: string;
}
export interface Transaction {
  id: string;
  user_id: string;
  receipt_id: string;
  merchant: string;
  transaction_date: string;
  amount: string;
  currency: Currency;
  tax: string | null;
  category_id: CategoryId;
  exchange_rate: string;
  exchange_rate_date: string;
  exchange_rate_source: string;
  amount_hkd: string;
  created_at: string;
}
export interface Budget { month: string; amount_hkd: string }
export interface Snapshot {
  transactions: Transaction[];
  receipts: Receipt[];
  budgets: Budget[];
  recognizedCount: number;
  aiAttemptsToday: number;
  dailyLimit: number;
}
export interface TransactionFilter { search: string; category: string; start: string; end: string }
export interface FxQuote { rate: string; date: string; source: string }
export interface DashboardSummary {
  month:string;
  total:string;
  previous_total:string;
  categories:{id:CategoryId;amount_hkd:string}[];
  trends:{month:string;amount_hkd:string}[];
}
