import type { PosBranchDTO, PosConsumptionDTO, PosStockLevelDTO } from "../types";

export const mockBranches: PosBranchDTO[] = [
  {
    branchId: "branch-jazan-shami-main",
    branchName: "مطعم الشام - فرع جازان الرئيسي",
    timezone: "Asia/Riyadh",
  },
];

export const mockStockByBranch: Record<string, PosStockLevelDTO[]> = {
  "branch-jazan-shami-main": [
    {
      externalItemId: "hmz-item-chicken",
      externalItemName: "دجاج",
      onHandQty: 14,
      unit: "كيلو",
      capturedAt: "2026-07-22T05:00:00.000Z",
    },
    {
      externalItemId: "hmz-item-meat",
      externalItemName: "لحم",
      onHandQty: 9,
      unit: "كيلو",
      capturedAt: "2026-07-22T05:00:00.000Z",
    },
    {
      externalItemId: "hmz-item-tahini",
      externalItemName: "طحينة",
      onHandQty: 5,
      unit: "كيلو",
      capturedAt: "2026-07-22T05:00:00.000Z",
    },
    {
      externalItemId: "hmz-item-labneh",
      externalItemName: "لبنة",
      onHandQty: 6,
      unit: "كيلو",
      capturedAt: "2026-07-22T05:00:00.000Z",
    },
    {
      externalItemId: "hmz-item-olives",
      externalItemName: "زيتون",
      onHandQty: 7,
      unit: "كيلو",
      capturedAt: "2026-07-22T05:00:00.000Z",
    },
    {
      externalItemId: "hmz-item-rice",
      externalItemName: "أرز",
      onHandQty: 42,
      unit: "كيلو",
      capturedAt: "2026-07-22T05:00:00.000Z",
    },
    {
      externalItemId: "hmz-item-oil",
      externalItemName: "زيت",
      onHandQty: 18,
      unit: "لتر",
      capturedAt: "2026-07-22T05:00:00.000Z",
    },
  ],
};

export const mockConsumptionByBranch: Record<string, PosConsumptionDTO[]> = {
  "branch-jazan-shami-main": [
    // Chicken
    { externalItemId: "hmz-item-chicken", externalItemName: "دجاج", consumedQty: 7.4, unit: "كيلو", businessDate: "2026-07-15" },
    { externalItemId: "hmz-item-chicken", externalItemName: "دجاج", consumedQty: 7.1, unit: "كيلو", businessDate: "2026-07-16" },
    { externalItemId: "hmz-item-chicken", externalItemName: "دجاج", consumedQty: 8.2, unit: "كيلو", businessDate: "2026-07-17" },
    { externalItemId: "hmz-item-chicken", externalItemName: "دجاج", consumedQty: 7.8, unit: "كيلو", businessDate: "2026-07-18" },
    { externalItemId: "hmz-item-chicken", externalItemName: "دجاج", consumedQty: 8.4, unit: "كيلو", businessDate: "2026-07-19" },
    { externalItemId: "hmz-item-chicken", externalItemName: "دجاج", consumedQty: 6.9, unit: "كيلو", businessDate: "2026-07-20" },
    { externalItemId: "hmz-item-chicken", externalItemName: "دجاج", consumedQty: 7.7, unit: "كيلو", businessDate: "2026-07-21" },

    // Meat
    { externalItemId: "hmz-item-meat", externalItemName: "لحم", consumedQty: 3.6, unit: "كيلو", businessDate: "2026-07-15" },
    { externalItemId: "hmz-item-meat", externalItemName: "لحم", consumedQty: 3.2, unit: "كيلو", businessDate: "2026-07-16" },
    { externalItemId: "hmz-item-meat", externalItemName: "لحم", consumedQty: 3.9, unit: "كيلو", businessDate: "2026-07-17" },
    { externalItemId: "hmz-item-meat", externalItemName: "لحم", consumedQty: 3.1, unit: "كيلو", businessDate: "2026-07-18" },
    { externalItemId: "hmz-item-meat", externalItemName: "لحم", consumedQty: 3.7, unit: "كيلو", businessDate: "2026-07-19" },
    { externalItemId: "hmz-item-meat", externalItemName: "لحم", consumedQty: 3.3, unit: "كيلو", businessDate: "2026-07-20" },
    { externalItemId: "hmz-item-meat", externalItemName: "لحم", consumedQty: 3.8, unit: "كيلو", businessDate: "2026-07-21" },

    // Tahini
    { externalItemId: "hmz-item-tahini", externalItemName: "طحينة", consumedQty: 1.1, unit: "كيلو", businessDate: "2026-07-15" },
    { externalItemId: "hmz-item-tahini", externalItemName: "طحينة", consumedQty: 1.3, unit: "كيلو", businessDate: "2026-07-16" },
    { externalItemId: "hmz-item-tahini", externalItemName: "طحينة", consumedQty: 1.2, unit: "كيلو", businessDate: "2026-07-17" },
    { externalItemId: "hmz-item-tahini", externalItemName: "طحينة", consumedQty: 1.4, unit: "كيلو", businessDate: "2026-07-18" },
    { externalItemId: "hmz-item-tahini", externalItemName: "طحينة", consumedQty: 1.0, unit: "كيلو", businessDate: "2026-07-19" },
    { externalItemId: "hmz-item-tahini", externalItemName: "طحينة", consumedQty: 1.2, unit: "كيلو", businessDate: "2026-07-20" },
    { externalItemId: "hmz-item-tahini", externalItemName: "طحينة", consumedQty: 1.1, unit: "كيلو", businessDate: "2026-07-21" },

    // Labneh
    { externalItemId: "hmz-item-labneh", externalItemName: "لبنة", consumedQty: 1.9, unit: "كيلو", businessDate: "2026-07-15" },
    { externalItemId: "hmz-item-labneh", externalItemName: "لبنة", consumedQty: 2.1, unit: "كيلو", businessDate: "2026-07-16" },
    { externalItemId: "hmz-item-labneh", externalItemName: "لبنة", consumedQty: 2.0, unit: "كيلو", businessDate: "2026-07-17" },
    { externalItemId: "hmz-item-labneh", externalItemName: "لبنة", consumedQty: 2.2, unit: "كيلو", businessDate: "2026-07-18" },
    { externalItemId: "hmz-item-labneh", externalItemName: "لبنة", consumedQty: 2.0, unit: "كيلو", businessDate: "2026-07-19" },
    { externalItemId: "hmz-item-labneh", externalItemName: "لبنة", consumedQty: 1.8, unit: "كيلو", businessDate: "2026-07-20" },
    { externalItemId: "hmz-item-labneh", externalItemName: "لبنة", consumedQty: 2.1, unit: "كيلو", businessDate: "2026-07-21" },

    // Olives
    { externalItemId: "hmz-item-olives", externalItemName: "زيتون", consumedQty: 1.4, unit: "كيلو", businessDate: "2026-07-15" },
    { externalItemId: "hmz-item-olives", externalItemName: "زيتون", consumedQty: 1.5, unit: "كيلو", businessDate: "2026-07-16" },
    { externalItemId: "hmz-item-olives", externalItemName: "زيتون", consumedQty: 1.3, unit: "كيلو", businessDate: "2026-07-17" },
    { externalItemId: "hmz-item-olives", externalItemName: "زيتون", consumedQty: 1.6, unit: "كيلو", businessDate: "2026-07-18" },
    { externalItemId: "hmz-item-olives", externalItemName: "زيتون", consumedQty: 1.4, unit: "كيلو", businessDate: "2026-07-19" },
    { externalItemId: "hmz-item-olives", externalItemName: "زيتون", consumedQty: 1.5, unit: "كيلو", businessDate: "2026-07-20" },
    { externalItemId: "hmz-item-olives", externalItemName: "زيتون", consumedQty: 1.4, unit: "كيلو", businessDate: "2026-07-21" },

    // Rice
    { externalItemId: "hmz-item-rice", externalItemName: "أرز", consumedQty: 8.1, unit: "كيلو", businessDate: "2026-07-15" },
    { externalItemId: "hmz-item-rice", externalItemName: "أرز", consumedQty: 7.8, unit: "كيلو", businessDate: "2026-07-16" },
    { externalItemId: "hmz-item-rice", externalItemName: "أرز", consumedQty: 8.4, unit: "كيلو", businessDate: "2026-07-17" },
    { externalItemId: "hmz-item-rice", externalItemName: "أرز", consumedQty: 8.0, unit: "كيلو", businessDate: "2026-07-18" },
    { externalItemId: "hmz-item-rice", externalItemName: "أرز", consumedQty: 8.2, unit: "كيلو", businessDate: "2026-07-19" },
    { externalItemId: "hmz-item-rice", externalItemName: "أرز", consumedQty: 7.7, unit: "كيلو", businessDate: "2026-07-20" },
    { externalItemId: "hmz-item-rice", externalItemName: "أرز", consumedQty: 8.3, unit: "كيلو", businessDate: "2026-07-21" },

    // Oil
    { externalItemId: "hmz-item-oil", externalItemName: "زيت", consumedQty: 2.9, unit: "لتر", businessDate: "2026-07-15" },
    { externalItemId: "hmz-item-oil", externalItemName: "زيت", consumedQty: 2.6, unit: "لتر", businessDate: "2026-07-16" },
    { externalItemId: "hmz-item-oil", externalItemName: "زيت", consumedQty: 3.1, unit: "لتر", businessDate: "2026-07-17" },
    { externalItemId: "hmz-item-oil", externalItemName: "زيت", consumedQty: 2.8, unit: "لتر", businessDate: "2026-07-18" },
    { externalItemId: "hmz-item-oil", externalItemName: "زيت", consumedQty: 2.9, unit: "لتر", businessDate: "2026-07-19" },
    { externalItemId: "hmz-item-oil", externalItemName: "زيت", consumedQty: 2.7, unit: "لتر", businessDate: "2026-07-20" },
    { externalItemId: "hmz-item-oil", externalItemName: "زيت", consumedQty: 3.0, unit: "لتر", businessDate: "2026-07-21" },
  ],
};
