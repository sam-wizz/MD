/**
 * إعدادات الأتمتة من البيئة + قيم افتراضية.
 * AUTOMATION_ENABLED=false يوجّه كل شيء إلى needs_manual دون إعادة نشر.
 */

import type { AutomationWeights, LogisticsWeights } from "@workspace/db";

export type AutomationMode = "shadow" | "live";

export type RuntimeAutomationConfig = {
  /** مفتاح الإيقاف الشامل */
  enabled: boolean;
  mode: AutomationMode;
  autoApproveEnabled: boolean;
  autoAssignSupplierEnabled: boolean;
  autoAssignLogisticsEnabled: boolean;
  offerTtlMinutes: number;
  candidateChainCap: number;
  minConfidenceScore: number;
  tieMargin: number;
  dailyOrderCapPerBusiness: number;
  supplierWeights: AutomationWeights;
  logisticsWeights: LogisticsWeights;
};

const defaultSupplierWeights: AutomationWeights = {
  price: 0.35,
  acceptance_rate: 0.25,
  on_time_rate: 0.2,
  remaining_capacity: 0.1,
  region_bonus: 0.1,
};

const defaultLogisticsWeights: LogisticsWeights = {
  route_match: 0.4,
  cost: 0.25,
  on_time_rate: 0.2,
  current_load: 0.15,
};

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return !["0", "false", "no", "off"].includes(v.toLowerCase());
}

function envNum(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** يقرأ الإعدادات الحية من البيئة (فعّالة فوراً بدون إعادة نشر للقيم الجديدة إن وُجدت في العملية) */
export function loadEnvAutomationConfig(
  overrides?: Partial<RuntimeAutomationConfig>,
): RuntimeAutomationConfig {
  const modeEnv = (process.env.AUTOMATION_MODE || "shadow").toLowerCase();
  const mode: AutomationMode = modeEnv === "live" ? "live" : "shadow";

  return {
    enabled: envBool("AUTOMATION_ENABLED", true),
    mode,
    autoApproveEnabled: envBool("AUTO_APPROVE_ENABLED", true),
    autoAssignSupplierEnabled: envBool("AUTO_ASSIGN_SUPPLIER_ENABLED", true),
    autoAssignLogisticsEnabled: envBool("AUTO_ASSIGN_LOGISTICS_ENABLED", true),
    offerTtlMinutes: envNum("OFFER_TTL_MINUTES", 30),
    candidateChainCap: envNum("CANDIDATE_CHAIN_CAP", 5),
    minConfidenceScore: envNum("MIN_CONFIDENCE_SCORE", 0.35),
    tieMargin: envNum("TIE_MARGIN", 0.05),
    dailyOrderCapPerBusiness: envNum("DAILY_ORDER_CAP_PER_BUSINESS", 20),
    supplierWeights: { ...defaultSupplierWeights },
    logisticsWeights: { ...defaultLogisticsWeights },
    ...overrides,
  };
}
