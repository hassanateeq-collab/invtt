export type ItemType = "fresh" | "store";
export type StockStatus = "ok" | "low" | "out";

export interface Property {
  id: string;
  code: string;
  name: string;
}

export interface ItemStock {
  id: string;
  property_id: string;
  supplier_id: string | null;
  name: string;
  unit: string;
  type: ItemType;
  par_level: number;
  reorder_point: number;
  created_at: string;
  current_stock: number;
  status: StockStatus;
  used_7d: number;
  buy_qty: number;
  nearest_expiry: string | null;
}

export interface RequestRow {
  id: string;
  property_id: string;
  item_id: string;
  quantity: number;
  department: string;
  status: "pending" | "done" | "cancelled";
  source: "slack" | "portal";
  created_at: string;
  items: { name: string; unit: string } | null;
}

export interface MovementRow {
  id: string;
  item_id: string;
  type: "in" | "out" | "adjustment";
  quantity: number;
  reason: string | null;
  expiry_date: string | null;
  created_at: string;
  items: { name: string; unit: string } | null;
}
