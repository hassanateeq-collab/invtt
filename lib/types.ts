export type ItemType = "fresh" | "store";
export type StockStatus = "ok" | "low" | "out";
export type DeliveryMode = "central" | "direct";
export type RequestType = "department" | "branch_transfer";
export type MovementType = "in" | "out" | "adjustment" | "transfer_in" | "transfer_out";

export interface Property {
  id: string;
  code: string;
  name: string;
  is_hub: boolean;
}

export interface Department {
  id: string;
  property_id: string;
  name: string;
  sort_order: number;
}

export interface Supplier {
  id: string;
  name: string;
  contact: string | null;
  email: string | null;
  phone: string | null;
  lead_time_days: number;
  delivery_mode: DeliveryMode;
}

export interface ItemStock {
  id: string;
  property_id: string;
  department_id: string | null;
  supplier_id: string | null;
  product_id: string | null;
  name: string;
  unit: string;
  type: ItemType;
  par_level: number;
  reorder_point: number;
  delivery_override: DeliveryMode | null;
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
  request_type: RequestType;
  reject_reason: string | null;
  created_at: string;
  items: { name: string; unit: string } | null;
  properties: { code: string; name: string } | null;
}

export interface MovementRow {
  id: string;
  item_id: string;
  type: MovementType;
  quantity: number;
  reason: string | null;
  expiry_date: string | null;
  transfer_id: string | null;
  counterpart_property_id: string | null;
  created_at: string;
  items: { name: string; unit: string } | null;
}
