import { supabase } from "./supabase";

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error("جلسة المستخدم غير متاحة");
  }
  return token;
}

async function authedFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`/api/admin/pos${path}`, {
    ...init,
    headers,
  });
  const payload = (await response.json().catch(() => ({}))) as any;
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || "فشل الاتصال بالخادم");
  }
  return payload as T;
}

export type PosClientSummary = {
  user_id: string;
  company_name: string;
  has_full_consent: boolean;
};

export type PosConsent = {
  id: number;
  client_id: string;
  client_company: string;
  scope: "branches.read" | "stock.read" | "consumption.read";
  granted_at: string;
  granted_by: string;
  revoked_at: string | null;
  revoked_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PosPolicy = {
  client_id: string;
  default_branch_id: string | null;
  lookback_days: number;
  lead_time_days: number;
  safety_stock_ratio: string;
  coverage_days: number;
  rounding_step: string;
  created_at: string;
  updated_at: string;
};

export type PosProduct = {
  id: number;
  name: string;
  category: string;
  sales_unit: string;
  cost_price: string;
  sell_price: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PosItemMap = {
  id: number;
  client_id: string;
  client_company: string;
  external_item_id: string;
  external_item_name: string;
  product_id: number;
  product_name: string | null;
  product_category: string | null;
  sales_unit: string | null;
  unit_conversion_factor: string;
  confidence: string;
  mapped_by: "auto" | "manual";
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PosSuggestionItem = {
  id: number;
  suggestion_id: number;
  product_id: number;
  product_name_snapshot: string;
  product_category_snapshot: string;
  external_item_id: string;
  external_item_name: string;
  unit_snapshot: string;
  current_stock: string;
  avg_daily_consumption: string;
  reorder_point: string;
  suggested_qty_raw: string;
  suggested_qty_rounded: string;
  editable_qty: string;
  editable_unit_price: string;
  created_at: string;
  updated_at: string;
};

export type PosSuggestionUnmapped = {
  id: number;
  suggestion_id: number;
  external_item_id: string;
  external_item_name: string;
  reason: string;
  created_at: string;
};

export type PosSuggestion = {
  id: number;
  client_id: string;
  branch_id: string;
  branch_name: string;
  status: "pending_review" | "approved" | "rejected";
  run_source: "manual" | "scheduled";
  generated_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  approved_order_id: number | null;
  missing_mapping_count: number;
  created_at: string;
  updated_at: string;
  items: PosSuggestionItem[];
  unmapped_items: PosSuggestionUnmapped[];
};

export async function getPosSummary(): Promise<PosClientSummary[]> {
  return authedFetch("/summary");
}

export async function getPosConsents(clientId?: string): Promise<PosConsent[]> {
  const suffix = clientId ? `?client_id=${encodeURIComponent(clientId)}` : "";
  return authedFetch(`/consents${suffix}`);
}

export async function grantPosConsents(input: {
  client_id: string;
  scopes?: Array<"branches.read" | "stock.read" | "consumption.read">;
}): Promise<{ status: "ok" }> {
  return authedFetch("/consents", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function revokePosConsents(input: {
  client_id: string;
  scopes?: Array<"branches.read" | "stock.read" | "consumption.read">;
}): Promise<{ status: "ok" }> {
  return authedFetch("/consents/revoke", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getPosPolicies(): Promise<PosPolicy[]> {
  return authedFetch("/policies");
}

export async function upsertPosPolicy(
  clientId: string,
  body: {
    default_branch_id?: string | null;
    lookback_days: number;
    lead_time_days: number;
    safety_stock_ratio: number;
    coverage_days: number;
    rounding_step: number;
  },
): Promise<PosPolicy> {
  return authedFetch(`/policies/${encodeURIComponent(clientId)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function getPosProducts(): Promise<PosProduct[]> {
  return authedFetch("/products");
}

export async function createPosProduct(body: {
  name: string;
  category: string;
  sales_unit: string;
  cost_price: number;
  sell_price: number;
}): Promise<PosProduct> {
  return authedFetch("/products", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getPosItemMaps(clientId?: string): Promise<PosItemMap[]> {
  const suffix = clientId ? `?client_id=${encodeURIComponent(clientId)}` : "";
  return authedFetch(`/item-maps${suffix}`);
}

export async function createPosItemMap(body: {
  client_id: string;
  external_item_id: string;
  external_item_name: string;
  product_id: number;
  unit_conversion_factor?: number;
  confidence?: number;
  is_active?: boolean;
}): Promise<PosItemMap> {
  return authedFetch("/item-maps", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updatePosItemMap(
  mapId: number,
  body: {
    product_id?: number;
    unit_conversion_factor?: number;
    confidence?: number;
    is_active?: boolean;
  },
): Promise<PosItemMap> {
  return authedFetch(`/item-maps/${mapId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function runPosSuggestions(body?: {
  client_id?: string;
}): Promise<any> {
  return authedFetch("/reorder-suggestions/run", {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

export async function getPosSuggestions(clientId?: string): Promise<PosSuggestion[]> {
  const suffix = clientId ? `?client_id=${encodeURIComponent(clientId)}` : "";
  return authedFetch(`/reorder-suggestions${suffix}`);
}

export async function updatePosSuggestionItem(
  suggestionId: number,
  itemId: number,
  body: {
    editable_qty: number;
    editable_unit_price: number;
  },
): Promise<PosSuggestionItem> {
  return authedFetch(
    `/reorder-suggestions/${suggestionId}/items/${itemId}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
}

export async function rejectPosSuggestion(
  suggestionId: number,
): Promise<{ status: "rejected" }> {
  return authedFetch(`/reorder-suggestions/${suggestionId}/reject`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function approvePosSuggestion(
  suggestionId: number,
): Promise<{ suggestion: PosSuggestion; order: any }> {
  return authedFetch(`/reorder-suggestions/${suggestionId}/approve`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}
