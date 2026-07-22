import { describe, expect, it, vi } from "vitest";
import { MissingConsentError } from "../pos/errors";
import type { PosAdapter } from "../pos/types";
import { computeReorderSuggestions } from "./reorder-formula";
import { ReorderSuggestionService } from "./reorder-suggestion-service";

const sevenDays = [
  "2026-07-15",
  "2026-07-16",
  "2026-07-17",
  "2026-07-18",
  "2026-07-19",
  "2026-07-20",
  "2026-07-21",
];

describe("ReorderSuggestionService", () => {
  it("fails fast when client consent is missing", async () => {
    const adapter: PosAdapter = {
      listBranches: vi.fn(async () => []),
      getStockLevels: vi.fn(async () => []),
      getConsumptionHistory: vi.fn(async () => []),
    };

    const repository = {
      getClientProfile: vi.fn(async () => ({
        userId: "client-1",
        companyName: "مطعم التجربة",
        fullName: "مدير الفرع",
        phone: null,
      })),
      listEligibleClientIds: vi.fn(async () => ["client-1"]),
      getActiveConsents: vi.fn(async () => []),
      getPolicy: vi.fn(async () => null),
      listActiveMappings: vi.fn(async () => []),
      listProducts: vi.fn(async () => []),
      upsertAutoMappingSuggestion: vi.fn(async () => undefined),
      createSuggestionDraft: vi.fn(async () => 1),
      insertSuggestionItems: vi.fn(async () => undefined),
      insertUnmappedItems: vi.fn(async () => undefined),
      createAuditLog: vi.fn(async () => undefined),
    };

    const service = new ReorderSuggestionService(repository as any, adapter, "mock");

    await expect(
      service.generateForClient({
        clientId: "client-1",
        runSource: "manual",
        triggeredBy: "admin-1",
      }),
    ).rejects.toBeInstanceOf(MissingConsentError);
    expect(adapter.listBranches).not.toHaveBeenCalled();
  });
});

describe("computeReorderSuggestions", () => {
  it("computes stable consumption correctly", () => {
    const result = computeReorderSuggestions({
      stockLevels: [
        {
          externalItemId: "ext-chicken",
          externalItemName: "دجاج",
          onHandQty: 5,
          unit: "كيلو",
          capturedAt: "2026-07-22T05:00:00.000Z",
        },
      ],
      consumptionHistory: sevenDays.map((day) => ({
        externalItemId: "ext-chicken",
        externalItemName: "دجاج",
        consumedQty: 10,
        unit: "كيلو",
        businessDate: day,
      })),
      activeMappings: [
        {
          externalItemId: "ext-chicken",
          externalItemName: "دجاج",
          productId: 1,
          productName: "دجاج مبرد 1100 جرام",
          productCategory: "اللحوم والدواجن",
          salesUnit: "كيلو",
          unitConversionFactor: 1,
          unitPrice: 22,
        },
      ],
      policy: {
        lookbackDays: 7,
        leadTimeDays: 1,
        safetyStockRatio: 0.2,
        coverageDays: 3,
        roundingStep: 1,
      },
    });

    expect(result.insufficientHistory).toBe(false);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].avgDailyConsumption).toBe(10);
    expect(result.items[0].reorderPoint).toBe(12);
    expect(result.items[0].suggestedQtyRounded).toBe(25);
  });

  it("computes volatile consumption using moving average", () => {
    const consumptions = [2, 18, 3, 17, 4, 16, 5];
    const result = computeReorderSuggestions({
      stockLevels: [
        {
          externalItemId: "ext-oil",
          externalItemName: "زيت",
          onHandQty: 7,
          unit: "لتر",
          capturedAt: "2026-07-22T05:00:00.000Z",
        },
      ],
      consumptionHistory: sevenDays.map((day, index) => ({
        externalItemId: "ext-oil",
        externalItemName: "زيت",
        consumedQty: consumptions[index],
        unit: "لتر",
        businessDate: day,
      })),
      activeMappings: [
        {
          externalItemId: "ext-oil",
          externalItemName: "زيت",
          productId: 2,
          productName: "زيت قلي",
          productCategory: "الزيوت والسمن",
          salesUnit: "لتر",
          unitConversionFactor: 1,
          unitPrice: 19,
        },
      ],
      policy: {
        lookbackDays: 7,
        leadTimeDays: 1,
        safetyStockRatio: 0.2,
        coverageDays: 3,
        roundingStep: 0.5,
      },
    });

    const avg = consumptions.reduce((sum, value) => sum + value, 0) / 7;
    const rawQty = avg * 3 - 7;
    const rounded = Math.ceil(rawQty / 0.5) * 0.5;

    expect(result.items).toHaveLength(1);
    expect(result.items[0].avgDailyConsumption).toBeCloseTo(avg, 4);
    expect(result.items[0].suggestedQtyRounded).toBeCloseTo(rounded, 4);
  });

  it("does not generate when history is less than N days", () => {
    const result = computeReorderSuggestions({
      stockLevels: [
        {
          externalItemId: "ext-rice",
          externalItemName: "أرز",
          onHandQty: 40,
          unit: "كيلو",
          capturedAt: "2026-07-22T05:00:00.000Z",
        },
      ],
      consumptionHistory: [
        {
          externalItemId: "ext-rice",
          externalItemName: "أرز",
          consumedQty: 8,
          unit: "كيلو",
          businessDate: "2026-07-19",
        },
        {
          externalItemId: "ext-rice",
          externalItemName: "أرز",
          consumedQty: 7,
          unit: "كيلو",
          businessDate: "2026-07-20",
        },
        {
          externalItemId: "ext-rice",
          externalItemName: "أرز",
          consumedQty: 9,
          unit: "كيلو",
          businessDate: "2026-07-21",
        },
      ],
      activeMappings: [
        {
          externalItemId: "ext-rice",
          externalItemName: "أرز",
          productId: 3,
          productName: "أرز بسمتي",
          productCategory: "الأرز والحبوب",
          salesUnit: "كيلو",
          unitConversionFactor: 1,
          unitPrice: 12,
        },
      ],
      policy: {
        lookbackDays: 7,
        leadTimeDays: 1,
        safetyStockRatio: 0.2,
        coverageDays: 3,
        roundingStep: 1,
      },
    });

    expect(result.insufficientHistory).toBe(true);
    expect(result.items).toHaveLength(0);
  });

  it("excludes unmapped items and reports them for mapping", () => {
    const result = computeReorderSuggestions({
      stockLevels: [
        {
          externalItemId: "ext-mapped",
          externalItemName: "دجاج",
          onHandQty: 2,
          unit: "كيلو",
          capturedAt: "2026-07-22T05:00:00.000Z",
        },
        {
          externalItemId: "ext-unmapped",
          externalItemName: "فراخ",
          onHandQty: 2,
          unit: "كيلو",
          capturedAt: "2026-07-22T05:00:00.000Z",
        },
      ],
      consumptionHistory: sevenDays.flatMap((day) => [
        {
          externalItemId: "ext-mapped",
          externalItemName: "دجاج",
          consumedQty: 6,
          unit: "كيلو",
          businessDate: day,
        },
        {
          externalItemId: "ext-unmapped",
          externalItemName: "فراخ",
          consumedQty: 6,
          unit: "كيلو",
          businessDate: day,
        },
      ]),
      activeMappings: [
        {
          externalItemId: "ext-mapped",
          externalItemName: "دجاج",
          productId: 4,
          productName: "دجاج مبرد 1100 جرام",
          productCategory: "اللحوم والدواجن",
          salesUnit: "كيلو",
          unitConversionFactor: 1,
          unitPrice: 22,
        },
      ],
      policy: {
        lookbackDays: 7,
        leadTimeDays: 1,
        safetyStockRatio: 0.2,
        coverageDays: 3,
        roundingStep: 1,
      },
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].externalItemId).toBe("ext-mapped");
    expect(result.unmappedItems).toEqual([
      {
        externalItemId: "ext-unmapped",
        externalItemName: "فراخ",
        reason: "missing_mapping",
      },
    ]);
  });
});
