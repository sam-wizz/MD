import {
  clientReorderPoliciesTable,
  db,
  externalItemMapTable,
  integrationAuditLogTable,
  integrationConsentsTable,
  integrationScopeEnum,
  productsTable,
  profilesTable,
  reorderSuggestionItemsTable,
  reorderSuggestionsTable,
  reorderUnmappedItemsTable,
} from "@workspace/db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type {
  ActiveItemMapping,
  ReorderComputedItem,
  UnmappedExternalItem,
} from "./reorder-formula";
import type { PosAdapterKind } from "../pos/types";

type IntegrationScope = (typeof integrationScopeEnum.enumValues)[number];

export const POS_REQUIRED_SCOPES: IntegrationScope[] = [
  "branches.read",
  "stock.read",
  "consumption.read",
];

export type ReorderClientProfile = {
  userId: string;
  companyName: string;
  fullName: string;
  phone: string | null;
};

export type ReorderPolicy = {
  lookbackDays: number;
  leadTimeDays: number;
  safetyStockRatio: number;
  coverageDays: number;
  roundingStep: number;
  defaultBranchId: string | null;
};

export type ConsentRecord = {
  id: number;
  scope: IntegrationScope;
};

export type AdapterAuditOperation =
  | "listBranches"
  | "getStockLevels"
  | "getConsumptionHistory";

function parseNumeric(
  value: string | number | null | undefined,
  fallback = 0,
): number {
  if (value === null || value === undefined) return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export class ReorderSuggestionRepository {
  async getClientProfile(clientId: string): Promise<ReorderClientProfile | null> {
    const rows = await db
      .select({
        userId: profilesTable.user_id,
        companyName: profilesTable.company_name,
        fullName: profilesTable.full_name,
        phone: profilesTable.phone,
      })
      .from(profilesTable)
      .where(
        and(
          eq(profilesTable.user_id, clientId),
          eq(profilesTable.role, "business_owner"),
          eq(profilesTable.status, "approved"),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async listEligibleClientIds(): Promise<string[]> {
    const rows = await db
      .selectDistinct({ clientId: integrationConsentsTable.client_id })
      .from(integrationConsentsTable)
      .innerJoin(
        profilesTable,
        eq(profilesTable.user_id, integrationConsentsTable.client_id),
      )
      .where(
        and(
          isNull(integrationConsentsTable.revoked_at),
          eq(profilesTable.role, "business_owner"),
          eq(profilesTable.status, "approved"),
        ),
      );
    return rows.map((row) => row.clientId);
  }

  async getActiveConsents(
    clientId: string,
    scopes: IntegrationScope[],
  ): Promise<ConsentRecord[]> {
    if (!scopes.length) return [];
    const rows = await db
      .select({ id: integrationConsentsTable.id, scope: integrationConsentsTable.scope })
      .from(integrationConsentsTable)
      .where(
        and(
          eq(integrationConsentsTable.client_id, clientId),
          isNull(integrationConsentsTable.revoked_at),
          inArray(integrationConsentsTable.scope, scopes),
        ),
      );
    return rows;
  }

  async getPolicy(clientId: string): Promise<ReorderPolicy | null> {
    const rows = await db
      .select()
      .from(clientReorderPoliciesTable)
      .where(eq(clientReorderPoliciesTable.client_id, clientId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      lookbackDays: row.lookback_days,
      leadTimeDays: row.lead_time_days,
      safetyStockRatio: parseNumeric(row.safety_stock_ratio, 0.2),
      coverageDays: row.coverage_days,
      roundingStep: parseNumeric(row.rounding_step, 1),
      defaultBranchId: row.default_branch_id,
    };
  }

  async listActiveMappings(clientId: string): Promise<ActiveItemMapping[]> {
    const rows = await db
      .select({
        externalItemId: externalItemMapTable.external_item_id,
        externalItemName: externalItemMapTable.external_item_name,
        productId: productsTable.id,
        productName: productsTable.name,
        productCategory: productsTable.category,
        salesUnit: productsTable.sales_unit,
        unitConversionFactor: externalItemMapTable.unit_conversion_factor,
        unitPrice: productsTable.sell_price,
      })
      .from(externalItemMapTable)
      .innerJoin(productsTable, eq(productsTable.id, externalItemMapTable.product_id))
      .where(
        and(
          eq(externalItemMapTable.client_id, clientId),
          eq(externalItemMapTable.is_active, true),
          eq(productsTable.is_active, true),
        ),
      );

    return rows.map((row) => ({
      externalItemId: row.externalItemId,
      externalItemName: row.externalItemName,
      productId: row.productId,
      productName: row.productName,
      productCategory: row.productCategory,
      salesUnit: row.salesUnit,
      unitConversionFactor: parseNumeric(row.unitConversionFactor, 1),
      unitPrice: parseNumeric(row.unitPrice, 0),
    }));
  }

  async listProducts(): Promise<
    { id: number; name: string; category: string; salesUnit: string }[]
  > {
    const rows = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        category: productsTable.category,
        salesUnit: productsTable.sales_unit,
      })
      .from(productsTable)
      .where(eq(productsTable.is_active, true));
    return rows;
  }

  async upsertAutoMappingSuggestion(input: {
    clientId: string;
    externalItemId: string;
    externalItemName: string;
    productId: number;
    confidence: number;
  }): Promise<void> {
    const now = new Date();
    const existing = await db
      .select({ id: externalItemMapTable.id })
      .from(externalItemMapTable)
      .where(
        and(
          eq(externalItemMapTable.client_id, input.clientId),
          eq(externalItemMapTable.external_item_id, input.externalItemId),
          eq(externalItemMapTable.mapped_by, "auto"),
          eq(externalItemMapTable.is_active, false),
        ),
      )
      .limit(1);

    if (existing[0]) {
      await db
        .update(externalItemMapTable)
        .set({
          external_item_name: input.externalItemName,
          product_id: input.productId,
          confidence: input.confidence.toFixed(4),
          updated_at: now,
        })
        .where(eq(externalItemMapTable.id, existing[0].id));
      return;
    }

    await db.insert(externalItemMapTable).values({
      client_id: input.clientId,
      external_item_id: input.externalItemId,
      external_item_name: input.externalItemName,
      product_id: input.productId,
      unit_conversion_factor: "1",
      confidence: input.confidence.toFixed(4),
      mapped_by: "auto",
      is_active: false,
      created_at: now,
      updated_at: now,
    });
  }

  async createSuggestionDraft(input: {
    clientId: string;
    branchId: string;
    branchName: string;
    runSource: "manual" | "scheduled";
    missingMappingCount: number;
  }): Promise<number> {
    const now = new Date();
    const inserted = await db
      .insert(reorderSuggestionsTable)
      .values({
        client_id: input.clientId,
        branch_id: input.branchId,
        branch_name: input.branchName,
        run_source: input.runSource,
        status: "pending_review",
        generated_at: now,
        missing_mapping_count: input.missingMappingCount,
        created_at: now,
        updated_at: now,
      })
      .returning({ id: reorderSuggestionsTable.id });
    return inserted[0].id;
  }

  async insertSuggestionItems(
    suggestionId: number,
    items: ReorderComputedItem[],
  ): Promise<void> {
    if (!items.length) return;
    const now = new Date();
    await db.insert(reorderSuggestionItemsTable).values(
      items.map((item) => ({
        suggestion_id: suggestionId,
        product_id: item.productId,
        product_name_snapshot: item.productName,
        product_category_snapshot: item.productCategory,
        external_item_id: item.externalItemId,
        external_item_name: item.externalItemName,
        unit_snapshot: item.salesUnit,
        current_stock: item.currentStock.toFixed(4),
        avg_daily_consumption: item.avgDailyConsumption.toFixed(4),
        reorder_point: item.reorderPoint.toFixed(4),
        suggested_qty_raw: item.suggestedQtyRaw.toFixed(4),
        suggested_qty_rounded: item.suggestedQtyRounded.toFixed(4),
        editable_qty: item.editableQty.toFixed(4),
        editable_unit_price: item.editableUnitPrice.toFixed(2),
        created_at: now,
        updated_at: now,
      })),
    );
  }

  async insertUnmappedItems(
    suggestionId: number,
    items: UnmappedExternalItem[],
  ): Promise<void> {
    if (!items.length) return;
    await db.insert(reorderUnmappedItemsTable).values(
      items.map((item) => ({
        suggestion_id: suggestionId,
        external_item_id: item.externalItemId,
        external_item_name: item.externalItemName,
        reason: item.reason,
      })),
    );
  }

  async createAuditLog(input: {
    clientId: string;
    consentId: number | null;
    adapter: PosAdapterKind;
    operation: AdapterAuditOperation;
    scope: IntegrationScope;
    branchId?: string;
    requestMeta?: Record<string, unknown>;
    success: boolean;
    errorMessage?: string;
    durationMs: number;
  }): Promise<void> {
    await db.insert(integrationAuditLogTable).values({
      client_id: input.clientId,
      consent_id: input.consentId,
      adapter: input.adapter,
      operation: input.operation,
      scope: input.scope,
      branch_id: input.branchId ?? null,
      request_meta: input.requestMeta ?? {},
      success: input.success,
      error_message: input.errorMessage ?? null,
      duration_ms: Math.max(0, Math.round(input.durationMs)),
    });
  }

  async listPosSummary() {
    const clients = await db
      .select({
        userId: profilesTable.user_id,
        companyName: profilesTable.company_name,
      })
      .from(profilesTable)
      .where(
        and(
          eq(profilesTable.role, "business_owner"),
          eq(profilesTable.status, "approved"),
        ),
      );

    const activeConsentCounts = await db
      .select({
        clientId: integrationConsentsTable.client_id,
        count: sql<number>`count(*)::int`,
      })
      .from(integrationConsentsTable)
      .where(isNull(integrationConsentsTable.revoked_at))
      .groupBy(integrationConsentsTable.client_id);

    const consentByClient = new Map(
      activeConsentCounts.map((row) => [row.clientId, row.count]),
    );

    return clients.map((client) => ({
      user_id: client.userId,
      company_name: client.companyName,
      has_full_consent: (consentByClient.get(client.userId) ?? 0) >= 3,
    }));
  }
}
