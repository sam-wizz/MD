import { logger } from "../lib/logger";
import { HmztWslAdapter } from "./adapters/hmztwsl";
import { MockPosAdapter } from "./adapters/mock";
import type { PosAdapter, PosAdapterKind } from "./types";

let adapterSingleton: PosAdapter | undefined;

export function getPosAdapterKind(): PosAdapterKind {
  const raw = (process.env.POS_ADAPTER ?? "mock").toLowerCase();
  return raw === "hmztwsl" ? "hmztwsl" : "mock";
}

export function createPosAdapter(kind: PosAdapterKind = getPosAdapterKind()): PosAdapter {
  if (kind === "hmztwsl") return new HmztWslAdapter();
  return new MockPosAdapter();
}

export function getPosAdapter(): PosAdapter {
  if (!adapterSingleton) {
    const kind = getPosAdapterKind();
    adapterSingleton = createPosAdapter(kind);
    logger.info({ kind }, "POS adapter initialized");
  }
  return adapterSingleton;
}
