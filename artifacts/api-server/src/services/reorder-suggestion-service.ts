import { MissingConsentError } from "../pos/errors";
import type { PosAdapter, PosAdapterKind } from "../pos/types";
import {
  computeReorderSuggestions,
  type ActiveItemMapping,
  type ReorderComputationResult,
  type ReorderComputedItem,
  type ReorderPolicyConfig,
  type UnmappedExternalItem,
} from "./reorder-formula";

export type ReorderRunSource = "manual" | "scheduled";

const POS_REQUIRED_SCOPES = [
  "branches.read",
  "stock.read",
  "consumption.read",
] as const;

type PosScope = (typeof POS_REQUIRED_SCOPES)[number];

type ConsentRecord = {
  id: number;
  scope: PosScope;
};

type AdapterAuditOperation =
  | "listBranches"
  | "getStockLevels"
  | "getConsumptionHistory";

const DEFAULT_POLICY: ReorderPolicyConfig = {
  lookbackDays: 7,
  leadTimeDays: 1,
  safetyStockRatio: 0.2,
  coverageDays: 3,
  roundingStep: 1,
};

function normalizeArabicText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[إأآ]/g, "ا")
    .replace(/[ة]/g, "ه")
    .replace(/[ى]/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSimilarityScore(left: string, right: string): number {
  const leftTokens = new Set(normalizeArabicText(left).split(" ").filter(Boolean));
  const rightTokens = new Set(normalizeArabicText(right).split(" ").filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) return 0;

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }

  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

export type GenerateForClientResult =
  | {
      status: "created";
      suggestionId: number;
      itemCount: number;
      unmappedCount: number;
    }
  | {
      status:
        | "skipped_client_missing"
        | "skipped_no_branch"
        | "skipped_insufficient_history"
        | "skipped_nothing_to_suggest";
      observedHistoryDays?: number;
      unmappedCount?: number;
    };

type RepositoryLike = {
  getClientProfile(clientId: string): Promise<{
    userId: string;
    companyName: string;
    fullName: string;
    phone: string | null;
  } | null>;
  listEligibleClientIds(): Promise<string[]>;
  getActiveConsents(
    clientId: string,
    scopes: readonly PosScope[],
  ): Promise<ConsentRecord[]>;
  getPolicy(clientId: string): Promise<{
    lookbackDays: number;
    leadTimeDays: number;
    safetyStockRatio: number;
    coverageDays: number;
    roundingStep: number;
    defaultBranchId: string | null;
  } | null>;
  listActiveMappings(clientId: string): Promise<ActiveItemMapping[]>;
  listProducts(): Promise<
    { id: number; name: string; category: string; salesUnit: string }[]
  >;
  upsertAutoMappingSuggestion(input: {
    clientId: string;
    externalItemId: string;
    externalItemName: string;
    productId: number;
    confidence: number;
  }): Promise<void>;
  createSuggestionDraft(input: {
    clientId: string;
    branchId: string;
    branchName: string;
    runSource: "manual" | "scheduled";
    missingMappingCount: number;
  }): Promise<number>;
  insertSuggestionItems(
    suggestionId: number,
    items: ReorderComputedItem[],
  ): Promise<void>;
  insertUnmappedItems(
    suggestionId: number,
    items: UnmappedExternalItem[],
  ): Promise<void>;
  createAuditLog(input: {
    clientId: string;
    consentId: number | null;
    adapter: PosAdapterKind;
    operation: AdapterAuditOperation;
    scope: PosScope;
    branchId?: string;
    requestMeta?: Record<string, unknown>;
    success: boolean;
    errorMessage?: string;
    durationMs: number;
  }): Promise<void>;
};

export class ReorderSuggestionService {
  constructor(
    private readonly repository: RepositoryLike,
    private readonly adapter: PosAdapter,
    private readonly adapterKind: PosAdapterKind,
  ) {}

  async generateForEligibleClients(
    runSource: ReorderRunSource,
    triggeredBy: string | null,
  ): Promise<{
    totalClients: number;
    createdSuggestions: number;
    skipped: Array<{ clientId: string; reason: string }>;
  }> {
    const clientIds = await this.repository.listEligibleClientIds();
    let createdSuggestions = 0;
    const skipped: Array<{ clientId: string; reason: string }> = [];

    for (const clientId of clientIds) {
      try {
        const result = await this.generateForClient({ clientId, runSource, triggeredBy });
        if (result.status === "created") {
          createdSuggestions += 1;
        } else {
          skipped.push({ clientId, reason: result.status });
        }
      } catch (error) {
        skipped.push({
          clientId,
          reason: error instanceof Error ? error.message : "unknown_error",
        });
      }
    }

    return {
      totalClients: clientIds.length,
      createdSuggestions,
      skipped,
    };
  }

  async generateForClient(input: {
    clientId: string;
    runSource: ReorderRunSource;
    triggeredBy: string | null;
  }): Promise<GenerateForClientResult> {
    const profile = await this.repository.getClientProfile(input.clientId);
    if (!profile) {
      return { status: "skipped_client_missing" };
    }

    const activeConsents = await this.repository.getActiveConsents(
      input.clientId,
      POS_REQUIRED_SCOPES,
    );
    const consentByScope = new Map(activeConsents.map((consent) => [consent.scope, consent]));
    for (const scope of POS_REQUIRED_SCOPES) {
      if (!consentByScope.has(scope)) {
        throw new MissingConsentError(input.clientId, scope);
      }
    }

    const storedPolicy = await this.repository.getPolicy(input.clientId);
    const policy: ReorderPolicyConfig = {
      lookbackDays: storedPolicy?.lookbackDays ?? DEFAULT_POLICY.lookbackDays,
      leadTimeDays: storedPolicy?.leadTimeDays ?? DEFAULT_POLICY.leadTimeDays,
      safetyStockRatio: storedPolicy?.safetyStockRatio ?? DEFAULT_POLICY.safetyStockRatio,
      coverageDays: storedPolicy?.coverageDays ?? DEFAULT_POLICY.coverageDays,
      roundingStep: storedPolicy?.roundingStep ?? DEFAULT_POLICY.roundingStep,
    };

    const branches = await this.withAuditedAdapterCall({
      clientId: input.clientId,
      consent: consentByScope.get("branches.read") ?? null,
      operation: "listBranches",
      scope: "branches.read",
      requestMeta: {},
      call: () => this.adapter.listBranches(),
    });

    const branch =
      branches.find((row) => row.branchId === storedPolicy?.defaultBranchId) ??
      branches[0];
    if (!branch) {
      return { status: "skipped_no_branch" };
    }

    const stock = await this.withAuditedAdapterCall({
      clientId: input.clientId,
      consent: consentByScope.get("stock.read") ?? null,
      operation: "getStockLevels",
      scope: "stock.read",
      branchId: branch.branchId,
      requestMeta: { branchId: branch.branchId },
      call: () => this.adapter.getStockLevels(branch.branchId),
    });

    const consumption = await this.withAuditedAdapterCall({
      clientId: input.clientId,
      consent: consentByScope.get("consumption.read") ?? null,
      operation: "getConsumptionHistory",
      scope: "consumption.read",
      branchId: branch.branchId,
      requestMeta: { branchId: branch.branchId, days: policy.lookbackDays },
      call: () =>
        this.adapter.getConsumptionHistory(branch.branchId, policy.lookbackDays),
    });

    const activeMappings = await this.repository.listActiveMappings(input.clientId);
    const computed = computeReorderSuggestions({
      stockLevels: stock,
      consumptionHistory: consumption,
      activeMappings,
      policy,
    });

    if (computed.insufficientHistory) {
      return {
        status: "skipped_insufficient_history",
        observedHistoryDays: computed.observedHistoryDays,
      };
    }

    await this.persistAutoMappingSuggestions(input.clientId, computed);

    if (!computed.items.length && !computed.unmappedItems.length) {
      return { status: "skipped_nothing_to_suggest" };
    }

    const suggestionId = await this.repository.createSuggestionDraft({
      clientId: input.clientId,
      branchId: branch.branchId,
      branchName: branch.branchName,
      runSource: input.runSource,
      missingMappingCount: computed.unmappedItems.length,
    });

    await this.repository.insertSuggestionItems(suggestionId, computed.items);
    await this.repository.insertUnmappedItems(suggestionId, computed.unmappedItems);

    return {
      status: "created",
      suggestionId,
      itemCount: computed.items.length,
      unmappedCount: computed.unmappedItems.length,
    };
  }

  private async persistAutoMappingSuggestions(
    clientId: string,
    computed: ReorderComputationResult,
  ): Promise<void> {
    if (!computed.unmappedItems.length) return;

    const products = await this.repository.listProducts();
    if (!products.length) return;

    for (const unmapped of computed.unmappedItems) {
      let bestMatch:
        | {
            productId: number;
            confidence: number;
          }
        | undefined;

      for (const product of products) {
        const confidence = tokenSimilarityScore(
          unmapped.externalItemName,
          product.name,
        );
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { productId: product.id, confidence };
        }
      }

      if (!bestMatch || bestMatch.confidence < 0.55) continue;

      await this.repository.upsertAutoMappingSuggestion({
        clientId,
        externalItemId: unmapped.externalItemId,
        externalItemName: unmapped.externalItemName,
        productId: bestMatch.productId,
        confidence: bestMatch.confidence,
      });
    }
  }

  private async withAuditedAdapterCall<T>(input: {
    clientId: string;
    consent: ConsentRecord | null;
    operation: AdapterAuditOperation;
    scope: "branches.read" | "stock.read" | "consumption.read";
    branchId?: string;
    requestMeta?: Record<string, unknown>;
    call: () => Promise<T>;
  }): Promise<T> {
    const startedAt = Date.now();
    try {
      const result = await input.call();
      await this.repository.createAuditLog({
        clientId: input.clientId,
        consentId: input.consent?.id ?? null,
        adapter: this.adapterKind,
        operation: input.operation,
        scope: input.scope,
        branchId: input.branchId,
        requestMeta: input.requestMeta,
        success: true,
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      await this.repository.createAuditLog({
        clientId: input.clientId,
        consentId: input.consent?.id ?? null,
        adapter: this.adapterKind,
        operation: input.operation,
        scope: input.scope,
        branchId: input.branchId,
        requestMeta: input.requestMeta,
        success: false,
        errorMessage: error instanceof Error ? error.message : "unknown_error",
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  }
}
