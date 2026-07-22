import type { PosConsumptionDTO, PosStockLevelDTO } from "../pos/types";

export type ReorderPolicyConfig = {
  lookbackDays: number;
  leadTimeDays: number;
  safetyStockRatio: number;
  coverageDays: number;
  roundingStep: number;
};

export type ActiveItemMapping = {
  externalItemId: string;
  externalItemName: string;
  productId: number;
  productName: string;
  productCategory: string;
  salesUnit: string;
  unitConversionFactor: number;
  unitPrice: number;
};

export type ReorderComputedItem = {
  productId: number;
  productName: string;
  productCategory: string;
  externalItemId: string;
  externalItemName: string;
  salesUnit: string;
  currentStock: number;
  avgDailyConsumption: number;
  reorderPoint: number;
  suggestedQtyRaw: number;
  suggestedQtyRounded: number;
  editableQty: number;
  editableUnitPrice: number;
};

export type UnmappedExternalItem = {
  externalItemId: string;
  externalItemName: string;
  reason: string;
};

export type ReorderComputationResult = {
  insufficientHistory: boolean;
  observedHistoryDays: number;
  items: ReorderComputedItem[];
  unmappedItems: UnmappedExternalItem[];
};

function roundTo(value: number, precision = 4): number {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}

function roundUpToStep(value: number, step: number): number {
  if (value <= 0) return 0;
  if (!Number.isFinite(step) || step <= 0) return Math.ceil(value);
  return roundTo(Math.ceil(value / step) * step);
}

function uniqueHistoryDays(consumptionHistory: PosConsumptionDTO[]): string[] {
  return Array.from(new Set(consumptionHistory.map((row) => row.businessDate))).sort();
}

export function computeReorderSuggestions(input: {
  stockLevels: PosStockLevelDTO[];
  consumptionHistory: PosConsumptionDTO[];
  activeMappings: ActiveItemMapping[];
  policy: ReorderPolicyConfig;
}): ReorderComputationResult {
  const { stockLevels, consumptionHistory, activeMappings, policy } = input;
  const observedDays = uniqueHistoryDays(consumptionHistory).length;

  if (observedDays < policy.lookbackDays) {
    return {
      insufficientHistory: true,
      observedHistoryDays: observedDays,
      items: [],
      unmappedItems: [],
    };
  }

  const mappingByExternalId = new Map(
    activeMappings.map((mapping) => [mapping.externalItemId, mapping]),
  );

  const consumptionByExternalId = new Map<string, number>();
  for (const row of consumptionHistory) {
    const mapping = mappingByExternalId.get(row.externalItemId);
    if (!mapping) continue;
    const consumedInternalUnit = row.consumedQty * mapping.unitConversionFactor;
    const prev = consumptionByExternalId.get(row.externalItemId) ?? 0;
    consumptionByExternalId.set(row.externalItemId, prev + consumedInternalUnit);
  }

  const items: ReorderComputedItem[] = [];
  const unmappedItems: UnmappedExternalItem[] = [];

  for (const stock of stockLevels) {
    const mapping = mappingByExternalId.get(stock.externalItemId);
    if (!mapping) {
      unmappedItems.push({
        externalItemId: stock.externalItemId,
        externalItemName: stock.externalItemName,
        reason: "missing_mapping",
      });
      continue;
    }

    const currentStock = stock.onHandQty * mapping.unitConversionFactor;
    const totalConsumption = consumptionByExternalId.get(stock.externalItemId) ?? 0;
    const avgDailyConsumption = totalConsumption / policy.lookbackDays;
    const leadTimeDemand = avgDailyConsumption * policy.leadTimeDays;
    const reorderPoint = leadTimeDemand + leadTimeDemand * policy.safetyStockRatio;
    const suggestedQtyRaw = avgDailyConsumption * policy.coverageDays - currentStock;
    const suggestedQtyRounded = roundUpToStep(suggestedQtyRaw, policy.roundingStep);

    if (suggestedQtyRounded <= 0) continue;

    items.push({
      productId: mapping.productId,
      productName: mapping.productName,
      productCategory: mapping.productCategory,
      externalItemId: stock.externalItemId,
      externalItemName: stock.externalItemName,
      salesUnit: mapping.salesUnit,
      currentStock: roundTo(currentStock),
      avgDailyConsumption: roundTo(avgDailyConsumption),
      reorderPoint: roundTo(reorderPoint),
      suggestedQtyRaw: roundTo(suggestedQtyRaw),
      suggestedQtyRounded,
      editableQty: suggestedQtyRounded,
      editableUnitPrice: roundTo(mapping.unitPrice, 2),
    });
  }

  return {
    insufficientHistory: false,
    observedHistoryDays: observedDays,
    items,
    unmappedItems,
  };
}
