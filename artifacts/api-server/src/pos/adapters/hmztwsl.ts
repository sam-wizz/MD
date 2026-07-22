import { PosNotImplementedError } from "../errors";
import type { PosAdapter, PosBranchDTO, PosConsumptionDTO, PosStockLevelDTO } from "../types";

export class HmztWslAdapter implements PosAdapter {
  async listBranches(): Promise<PosBranchDTO[]> {
    throw new PosNotImplementedError(
      "TODO(hmztwsl): Implement listBranches() after receiving official API documentation, auth flow, and branch schema.",
    );
  }

  async getStockLevels(_branchId: string): Promise<PosStockLevelDTO[]> {
    throw new PosNotImplementedError(
      "TODO(hmztwsl): Implement getStockLevels(branchId) after confirming inventory endpoint path and response fields.",
    );
  }

  async getConsumptionHistory(
    _branchId: string,
    _days: number,
  ): Promise<PosConsumptionDTO[]> {
    throw new PosNotImplementedError(
      "TODO(hmztwsl): Implement getConsumptionHistory(branchId, days) after confirming historical usage endpoint and pagination behavior.",
    );
  }
}
