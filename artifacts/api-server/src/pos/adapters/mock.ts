import {
  mockBranches,
  mockConsumptionByBranch,
  mockStockByBranch,
} from "./mock-fixtures";
import type { PosAdapter, PosBranchDTO, PosConsumptionDTO, PosStockLevelDTO } from "../types";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class MockPosAdapter implements PosAdapter {
  async listBranches(): Promise<PosBranchDTO[]> {
    return clone(mockBranches);
  }

  async getStockLevels(branchId: string): Promise<PosStockLevelDTO[]> {
    return clone(mockStockByBranch[branchId] ?? []);
  }

  async getConsumptionHistory(
    branchId: string,
    days: number,
  ): Promise<PosConsumptionDTO[]> {
    if (days <= 0) return [];
    const rows = mockConsumptionByBranch[branchId] ?? [];
    const latestDates = Array.from(new Set(rows.map((row) => row.businessDate)))
      .sort()
      .slice(-days);
    const byDate = new Set(latestDates);
    return clone(rows.filter((row) => byDate.has(row.businessDate)));
  }
}
