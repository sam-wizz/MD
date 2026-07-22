export type PosAdapterKind = "mock" | "hmztwsl";

export type PosBranchDTO = {
  branchId: string;
  branchName: string;
  timezone?: string;
};

export type PosStockLevelDTO = {
  externalItemId: string;
  externalItemName: string;
  onHandQty: number;
  unit: string;
  capturedAt: string;
};

export type PosConsumptionDTO = {
  externalItemId: string;
  externalItemName: string;
  consumedQty: number;
  unit: string;
  businessDate: string;
};

export interface PosAdapter {
  listBranches(): Promise<PosBranchDTO[]>;
  getStockLevels(branchId: string): Promise<PosStockLevelDTO[]>;
  getConsumptionHistory(branchId: string, days: number): Promise<PosConsumptionDTO[]>;
}
