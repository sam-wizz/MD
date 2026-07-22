import { Router } from "express";
import {
  clientReorderPoliciesTable,
  db,
  externalItemMapTable,
  integrationConsentsTable,
  integrationScopeEnum,
  ordersTable,
  productsTable,
  profilesTable,
  reorderSuggestionItemsTable,
  reorderSuggestionsTable,
  reorderUnmappedItemsTable,
} from "@workspace/db";
import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { requireAdmin, requireAuth } from "../middlewares/auth";
import { MissingConsentError } from "../pos/errors";
import {
  POS_REQUIRED_SCOPES,
  getReorderSuggestionRepository,
  getReorderSuggestionService,
} from "../services/reorder-suggestion-runtime";

const router = Router();
router.use(requireAuth, requireAdmin);

const parseNumber = (
  value: unknown,
  fallback = 0,
): number => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
      ? Number(value)
      : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseId = (raw: unknown): number | null => {
  const parsed = Number.parseInt(String(raw), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const serializeSuggestion = (
  suggestion: typeof reorderSuggestionsTable.$inferSelect,
  items: (typeof reorderSuggestionItemsTable.$inferSelect)[],
  unmapped: (typeof reorderUnmappedItemsTable.$inferSelect)[],
) => ({
  ...suggestion,
  generated_at: suggestion.generated_at.toISOString(),
  reviewed_at: suggestion.reviewed_at ? suggestion.reviewed_at.toISOString() : null,
  created_at: suggestion.created_at.toISOString(),
  updated_at: suggestion.updated_at.toISOString(),
  items: items.map((item) => ({
    ...item,
    created_at: item.created_at.toISOString(),
    updated_at: item.updated_at.toISOString(),
  })),
  unmapped_items: unmapped.map((item) => ({
    ...item,
    created_at: item.created_at.toISOString(),
  })),
});

router.get("/summary", async (_req, res) => {
  const repository = getReorderSuggestionRepository();
  const summary = await repository.listPosSummary();
  return res.json(summary);
});

router.get("/policies", async (_req, res) => {
  const rows = await db
    .select()
    .from(clientReorderPoliciesTable)
    .orderBy(desc(clientReorderPoliciesTable.updated_at));
  return res.json(
    rows.map((row) => ({
      ...row,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    })),
  );
});

router.put("/policies/:clientId", async (req, res) => {
  const clientId = String(req.params.clientId ?? "");
  if (!clientId) return res.status(400).json({ error: "clientId is required" });

  const lookbackDays = Math.max(1, Math.trunc(parseNumber(req.body?.lookback_days, 7)));
  const leadTimeDays = Math.max(1, Math.trunc(parseNumber(req.body?.lead_time_days, 1)));
  const safetyStockRatio = Math.max(0, parseNumber(req.body?.safety_stock_ratio, 0.2));
  const coverageDays = Math.max(1, Math.trunc(parseNumber(req.body?.coverage_days, 3)));
  const roundingStep = Math.max(0.001, parseNumber(req.body?.rounding_step, 1));
  const defaultBranchId =
    typeof req.body?.default_branch_id === "string" && req.body.default_branch_id.trim()
      ? req.body.default_branch_id.trim()
      : null;

  const now = new Date();
  const upserted = await db
    .insert(clientReorderPoliciesTable)
    .values({
      client_id: clientId,
      lookback_days: lookbackDays,
      lead_time_days: leadTimeDays,
      safety_stock_ratio: safetyStockRatio.toFixed(4),
      coverage_days: coverageDays,
      rounding_step: roundingStep.toFixed(4),
      default_branch_id: defaultBranchId,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: clientReorderPoliciesTable.client_id,
      set: {
        lookback_days: lookbackDays,
        lead_time_days: leadTimeDays,
        safety_stock_ratio: safetyStockRatio.toFixed(4),
        coverage_days: coverageDays,
        rounding_step: roundingStep.toFixed(4),
        default_branch_id: defaultBranchId,
        updated_at: now,
      },
    })
    .returning();

  return res.json({
    ...upserted[0],
    created_at: upserted[0].created_at.toISOString(),
    updated_at: upserted[0].updated_at.toISOString(),
  });
});

router.get("/consents", async (req, res) => {
  const clientId =
    typeof req.query.client_id === "string" ? req.query.client_id : undefined;

  const base = db
    .select({
      id: integrationConsentsTable.id,
      client_id: integrationConsentsTable.client_id,
      scope: integrationConsentsTable.scope,
      granted_at: integrationConsentsTable.granted_at,
      granted_by: integrationConsentsTable.granted_by,
      revoked_at: integrationConsentsTable.revoked_at,
      revoked_by: integrationConsentsTable.revoked_by,
      created_at: integrationConsentsTable.created_at,
      updated_at: integrationConsentsTable.updated_at,
      client_company: profilesTable.company_name,
    })
    .from(integrationConsentsTable)
    .innerJoin(
      profilesTable,
      eq(profilesTable.user_id, integrationConsentsTable.client_id),
    );

  const rows = clientId
    ? await base
        .where(eq(integrationConsentsTable.client_id, clientId))
        .orderBy(desc(integrationConsentsTable.created_at))
    : await base.orderBy(desc(integrationConsentsTable.created_at));

  return res.json(
    rows.map((row) => ({
      ...row,
      granted_at: row.granted_at.toISOString(),
      revoked_at: row.revoked_at ? row.revoked_at.toISOString() : null,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    })),
  );
});

router.post("/consents", async (req, res) => {
  const clientId = String(req.body?.client_id ?? "");
  const requestedScopes = Array.isArray(req.body?.scopes)
    ? req.body.scopes
    : POS_REQUIRED_SCOPES;
  const scopes = requestedScopes.filter(
    (
      scope: unknown,
    ): scope is (typeof integrationScopeEnum.enumValues)[number] =>
      integrationScopeEnum.enumValues.includes(scope as any),
  );
  if (!clientId || !scopes.length) {
    return res.status(400).json({ error: "client_id and valid scopes are required" });
  }

  const now = new Date();
  for (const scope of scopes) {
    const active = await db
      .select({ id: integrationConsentsTable.id })
      .from(integrationConsentsTable)
      .where(
        and(
          eq(integrationConsentsTable.client_id, clientId),
          eq(integrationConsentsTable.scope, scope as any),
          isNull(integrationConsentsTable.revoked_at),
        ),
      )
      .limit(1);
    if (active[0]) continue;

    await db.insert(integrationConsentsTable).values({
      client_id: clientId,
      scope: scope as any,
      granted_by: req.userId!,
      granted_at: now,
      created_at: now,
      updated_at: now,
    });
  }

  return res.status(201).json({ status: "ok" });
});

router.post("/consents/revoke", async (req, res) => {
  const clientId = String(req.body?.client_id ?? "");
  const requestedScopes = Array.isArray(req.body?.scopes)
    ? req.body.scopes
    : POS_REQUIRED_SCOPES;
  const scopes = requestedScopes.filter(
    (
      scope: unknown,
    ): scope is (typeof integrationScopeEnum.enumValues)[number] =>
      integrationScopeEnum.enumValues.includes(scope as any),
  );
  if (!clientId || !scopes.length) {
    return res.status(400).json({ error: "client_id and valid scopes are required" });
  }

  await db
    .update(integrationConsentsTable)
    .set({
      revoked_at: new Date(),
      revoked_by: req.userId!,
      updated_at: new Date(),
    })
    .where(
      and(
        eq(integrationConsentsTable.client_id, clientId),
        isNull(integrationConsentsTable.revoked_at),
        inArray(integrationConsentsTable.scope, scopes as any),
      ),
    );

  return res.json({ status: "ok" });
});

router.get("/products", async (_req, res) => {
  const rows = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.is_active, true))
    .orderBy(productsTable.name);
  return res.json(
    rows.map((row) => ({
      ...row,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    })),
  );
});

router.post("/products", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const category = String(req.body?.category ?? "").trim();
  const salesUnit = String(req.body?.sales_unit ?? "").trim();
  const costPrice = parseNumber(req.body?.cost_price, NaN);
  const sellPrice = parseNumber(req.body?.sell_price, NaN);

  if (!name || !category || !salesUnit || !Number.isFinite(costPrice) || !Number.isFinite(sellPrice)) {
    return res.status(400).json({
      error: "name, category, sales_unit, cost_price, sell_price are required",
    });
  }

  const now = new Date();
  const inserted = await db
    .insert(productsTable)
    .values({
      name,
      category,
      sales_unit: salesUnit,
      cost_price: costPrice.toFixed(2),
      sell_price: sellPrice.toFixed(2),
      is_active: true,
      created_at: now,
      updated_at: now,
    })
    .returning();

  return res.status(201).json({
    ...inserted[0],
    created_at: inserted[0].created_at.toISOString(),
    updated_at: inserted[0].updated_at.toISOString(),
  });
});

router.get("/item-maps", async (req, res) => {
  const clientId =
    typeof req.query.client_id === "string" ? req.query.client_id : undefined;

  const base = db
    .select({
      id: externalItemMapTable.id,
      client_id: externalItemMapTable.client_id,
      client_company: profilesTable.company_name,
      external_item_id: externalItemMapTable.external_item_id,
      external_item_name: externalItemMapTable.external_item_name,
      product_id: externalItemMapTable.product_id,
      product_name: productsTable.name,
      product_category: productsTable.category,
      sales_unit: productsTable.sales_unit,
      unit_conversion_factor: externalItemMapTable.unit_conversion_factor,
      confidence: externalItemMapTable.confidence,
      mapped_by: externalItemMapTable.mapped_by,
      is_active: externalItemMapTable.is_active,
      created_at: externalItemMapTable.created_at,
      updated_at: externalItemMapTable.updated_at,
    })
    .from(externalItemMapTable)
    .leftJoin(productsTable, eq(productsTable.id, externalItemMapTable.product_id))
    .leftJoin(
      profilesTable,
      eq(profilesTable.user_id, externalItemMapTable.client_id),
    );

  const rows = clientId
    ? await base
        .where(eq(externalItemMapTable.client_id, clientId))
        .orderBy(desc(externalItemMapTable.updated_at))
    : await base.orderBy(desc(externalItemMapTable.updated_at));

  return res.json(
    rows.map((row) => ({
      ...row,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    })),
  );
});

router.post("/item-maps", async (req, res) => {
  const clientId = String(req.body?.client_id ?? "");
  const externalItemId = String(req.body?.external_item_id ?? "");
  const externalItemName = String(req.body?.external_item_name ?? "");
  const productId = parseId(req.body?.product_id);
  const unitConversionFactor = parseNumber(req.body?.unit_conversion_factor, 1);
  const confidence = parseNumber(req.body?.confidence, 1);
  const isActive = req.body?.is_active !== false;

  if (!clientId || !externalItemId || !externalItemName || productId === null) {
    return res.status(400).json({
      error:
        "client_id, external_item_id, external_item_name, product_id are required",
    });
  }

  const now = new Date();
  const created = await db.transaction(async (tx) => {
    if (isActive) {
      await tx
        .update(externalItemMapTable)
        .set({
          is_active: false,
          updated_at: now,
        })
        .where(
          and(
            eq(externalItemMapTable.client_id, clientId),
            eq(externalItemMapTable.external_item_id, externalItemId),
            eq(externalItemMapTable.is_active, true),
          ),
        );
    }

    const inserted = await tx
      .insert(externalItemMapTable)
      .values({
        client_id: clientId,
        external_item_id: externalItemId,
        external_item_name: externalItemName,
        product_id: productId,
        unit_conversion_factor: unitConversionFactor.toFixed(6),
        confidence: confidence.toFixed(4),
        mapped_by: "manual",
        is_active: isActive,
        created_at: now,
        updated_at: now,
      })
      .returning();
    return inserted[0];
  });

  return res.status(201).json({
    ...created,
    created_at: created.created_at.toISOString(),
    updated_at: created.updated_at.toISOString(),
  });
});

router.patch("/item-maps/:id", async (req, res) => {
  const mapId = parseId(req.params.id);
  if (mapId === null) return res.status(400).json({ error: "invalid id" });

  const existing = await db
    .select()
    .from(externalItemMapTable)
    .where(eq(externalItemMapTable.id, mapId))
    .limit(1);
  const row = existing[0];
  if (!row) return res.status(404).json({ error: "mapping not found" });

  const now = new Date();
  const productId = parseId(req.body?.product_id) ?? row.product_id;
  const unitConversionFactor = parseNumber(
    req.body?.unit_conversion_factor,
    Number(row.unit_conversion_factor),
  );
  const confidence = parseNumber(req.body?.confidence, Number(row.confidence));
  const isActive =
    typeof req.body?.is_active === "boolean" ? req.body.is_active : row.is_active;

  const updated = await db.transaction(async (tx) => {
    if (isActive) {
      await tx
        .update(externalItemMapTable)
        .set({
          is_active: false,
          updated_at: now,
        })
        .where(
          and(
            eq(externalItemMapTable.client_id, row.client_id),
            eq(externalItemMapTable.external_item_id, row.external_item_id),
            ne(externalItemMapTable.id, row.id),
          ),
        );
    }

    const patched = await tx
      .update(externalItemMapTable)
      .set({
        product_id: productId,
        unit_conversion_factor: unitConversionFactor.toFixed(6),
        confidence: confidence.toFixed(4),
        mapped_by: "manual",
        is_active: isActive,
        updated_at: now,
      })
      .where(eq(externalItemMapTable.id, mapId))
      .returning();

    return patched[0];
  });

  return res.json({
    ...updated,
    created_at: updated.created_at.toISOString(),
    updated_at: updated.updated_at.toISOString(),
  });
});

router.post("/reorder-suggestions/run", async (req, res) => {
  const service = getReorderSuggestionService();
  const clientId =
    typeof req.body?.client_id === "string" ? req.body.client_id : undefined;

  try {
    if (clientId) {
      const result = await service.generateForClient({
        clientId,
        runSource: "manual",
        triggeredBy: req.userId ?? null,
      });
      return res.json(result);
    }

    const result = await service.generateForEligibleClients(
      "manual",
      req.userId ?? null,
    );
    return res.json(result);
  } catch (error) {
    if (error instanceof MissingConsentError) {
      return res.status(409).json({
        error: "missing_consent",
        message: error.message,
      });
    }
    req.log.error({ err: error }, "Failed to run POS reorder suggestion");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/reorder-suggestions", async (req, res) => {
  const clientId =
    typeof req.query.client_id === "string" ? req.query.client_id : undefined;
  const limit = Math.min(
    100,
    Math.max(1, Math.trunc(parseNumber(req.query.limit, 50))),
  );

  const base = db.select().from(reorderSuggestionsTable);
  const suggestions = clientId
    ? await base
        .where(eq(reorderSuggestionsTable.client_id, clientId))
        .orderBy(desc(reorderSuggestionsTable.created_at))
        .limit(limit)
    : await base.orderBy(desc(reorderSuggestionsTable.created_at)).limit(limit);

  const suggestionIds = suggestions.map((row) => row.id);
  const items = suggestionIds.length
    ? await db
        .select()
        .from(reorderSuggestionItemsTable)
        .where(inArray(reorderSuggestionItemsTable.suggestion_id, suggestionIds))
    : [];
  const unmapped = suggestionIds.length
    ? await db
        .select()
        .from(reorderUnmappedItemsTable)
        .where(inArray(reorderUnmappedItemsTable.suggestion_id, suggestionIds))
    : [];

  const itemsBySuggestion = new Map<number, typeof items>();
  for (const item of items) {
    const group = itemsBySuggestion.get(item.suggestion_id) ?? [];
    group.push(item);
    itemsBySuggestion.set(item.suggestion_id, group);
  }

  const unmappedBySuggestion = new Map<number, typeof unmapped>();
  for (const row of unmapped) {
    const group = unmappedBySuggestion.get(row.suggestion_id) ?? [];
    group.push(row);
    unmappedBySuggestion.set(row.suggestion_id, group);
  }

  return res.json(
    suggestions.map((suggestion) =>
      serializeSuggestion(
        suggestion,
        itemsBySuggestion.get(suggestion.id) ?? [],
        unmappedBySuggestion.get(suggestion.id) ?? [],
      ),
    ),
  );
});

router.patch("/reorder-suggestions/:id/items/:itemId", async (req, res) => {
  const suggestionId = parseId(req.params.id);
  const itemId = parseId(req.params.itemId);
  if (suggestionId === null || itemId === null) {
    return res.status(400).json({ error: "invalid ids" });
  }

  const suggestion = await db
    .select({ status: reorderSuggestionsTable.status })
    .from(reorderSuggestionsTable)
    .where(eq(reorderSuggestionsTable.id, suggestionId))
    .limit(1);
  if (!suggestion[0]) return res.status(404).json({ error: "suggestion not found" });
  if (suggestion[0].status !== "pending_review") {
    return res.status(409).json({ error: "suggestion is already reviewed" });
  }

  const editableQty = parseNumber(req.body?.editable_qty, NaN);
  const editableUnitPrice = parseNumber(req.body?.editable_unit_price, NaN);
  if (!Number.isFinite(editableQty) || editableQty <= 0 || !Number.isFinite(editableUnitPrice) || editableUnitPrice < 0) {
    return res.status(400).json({ error: "editable_qty and editable_unit_price are required" });
  }

  const updated = await db
    .update(reorderSuggestionItemsTable)
    .set({
      editable_qty: editableQty.toFixed(4),
      editable_unit_price: editableUnitPrice.toFixed(2),
      updated_at: new Date(),
    })
    .where(
      and(
        eq(reorderSuggestionItemsTable.id, itemId),
        eq(reorderSuggestionItemsTable.suggestion_id, suggestionId),
      ),
    )
    .returning();

  if (!updated[0]) return res.status(404).json({ error: "item not found" });
  return res.json({
    ...updated[0],
    created_at: updated[0].created_at.toISOString(),
    updated_at: updated[0].updated_at.toISOString(),
  });
});

router.post("/reorder-suggestions/:id/reject", async (req, res) => {
  const suggestionId = parseId(req.params.id);
  if (suggestionId === null) return res.status(400).json({ error: "invalid id" });

  const updated = await db
    .update(reorderSuggestionsTable)
    .set({
      status: "rejected",
      reviewed_at: new Date(),
      reviewed_by: req.userId!,
      updated_at: new Date(),
    })
    .where(
      and(
        eq(reorderSuggestionsTable.id, suggestionId),
        eq(reorderSuggestionsTable.status, "pending_review"),
      ),
    )
    .returning();

  if (!updated[0]) {
    return res.status(409).json({ error: "suggestion is not pending_review" });
  }
  return res.json({
    ...updated[0],
    generated_at: updated[0].generated_at.toISOString(),
    reviewed_at: updated[0].reviewed_at
      ? updated[0].reviewed_at.toISOString()
      : null,
    created_at: updated[0].created_at.toISOString(),
    updated_at: updated[0].updated_at.toISOString(),
  });
});

router.post("/reorder-suggestions/:id/approve", async (req, res) => {
  const suggestionId = parseId(req.params.id);
  if (suggestionId === null) return res.status(400).json({ error: "invalid id" });

  const suggestionRows = await db
    .select()
    .from(reorderSuggestionsTable)
    .where(eq(reorderSuggestionsTable.id, suggestionId))
    .limit(1);
  const suggestion = suggestionRows[0];
  if (!suggestion) return res.status(404).json({ error: "suggestion not found" });
  if (suggestion.status !== "pending_review") {
    return res.status(409).json({ error: "suggestion is already reviewed" });
  }

  const profileRows = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.user_id, suggestion.client_id))
    .limit(1);
  const profile = profileRows[0];
  if (!profile) return res.status(404).json({ error: "client profile not found" });

  const items = await db
    .select()
    .from(reorderSuggestionItemsTable)
    .where(eq(reorderSuggestionItemsTable.suggestion_id, suggestionId));
  if (!items.length) {
    return res
      .status(422)
      .json({ error: "cannot approve suggestion without line items" });
  }

  const itemSummary = items
    .map(
      (item) =>
        `${item.product_name_snapshot}: ${item.editable_qty} ${item.unit_snapshot} × ${item.editable_unit_price} ر.س`,
    )
    .join(" | ");

  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const order = await tx
      .insert(ordersTable)
      .values({
        business_id: profile.user_id,
        business_company: profile.company_name,
        business_contact: profile.full_name,
        business_phone: profile.phone ?? null,
        product_category:
          items[0]?.product_category_snapshot ?? "إعادة طلب تكاملي",
        items: itemSummary,
        delivery_region: suggestion.branch_name,
        delivery_address: null,
        notes: `تحويل يدوي من مسودة POS #${suggestionId}`,
        status: "pending",
      })
      .returning();

    const updatedSuggestion = await tx
      .update(reorderSuggestionsTable)
      .set({
        status: "approved",
        reviewed_at: now,
        reviewed_by: req.userId!,
        approved_order_id: order[0].id,
        updated_at: now,
      })
      .where(eq(reorderSuggestionsTable.id, suggestionId))
      .returning();

    return {
      order: order[0],
      suggestion: updatedSuggestion[0],
    };
  });

  return res.json({
    suggestion: {
      ...result.suggestion,
      generated_at: result.suggestion.generated_at.toISOString(),
      reviewed_at: result.suggestion.reviewed_at
        ? result.suggestion.reviewed_at.toISOString()
        : null,
      created_at: result.suggestion.created_at.toISOString(),
      updated_at: result.suggestion.updated_at.toISOString(),
    },
    order: {
      ...result.order,
      created_at: result.order.created_at.toISOString(),
      updated_at: result.order.updated_at.toISOString(),
    },
  });
});

export default router;
