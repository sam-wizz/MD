import { describe, expect, it } from "vitest";
import { canTransition } from "./state-machine";
import { loadEnvAutomationConfig } from "./config";

/**
 * اختبارات تفويض: مورد يحاول تعديل طلب غير مسند إليه،
 * وصاحب منشأة يحاول إلغاء طلب منشأة أخرى.
 */
describe("authorization — ownership", () => {
  it("supplier modifying another's order → denied", () => {
    const r = canTransition(
      "assigned",
      "preparing",
      { kind: "user", userId: "attacker-supplier", role: "supplier" },
      { assignedSupplierId: "real-supplier", businessId: "biz-1" },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/المورد المسند/);
  });

  it("business owner cancelling another business order → denied", () => {
    const r = canTransition(
      "pending",
      "cancelled",
      { kind: "user", userId: "other-biz", role: "business_owner" },
      { businessId: "biz-1" },
    );
    expect(r.ok).toBe(false);
  });

  it("business owner reading/writing own order cancel is allowed before preparing", () => {
    expect(
      canTransition(
        "approved",
        "cancelled",
        { kind: "user", userId: "biz-1", role: "business_owner" },
        { businessId: "biz-1" },
      ),
    ).toEqual({ ok: true });
  });
});

describe("automation safety — env kill switch & shadow", () => {
  it("defaults to shadow mode", () => {
    const prev = process.env.AUTOMATION_MODE;
    delete process.env.AUTOMATION_MODE;
    const cfg = loadEnvAutomationConfig();
    expect(cfg.mode).toBe("shadow");
    if (prev !== undefined) process.env.AUTOMATION_MODE = prev;
  });

  it("AUTOMATION_ENABLED=false is readable without redeploy semantics", () => {
    const prev = process.env.AUTOMATION_ENABLED;
    process.env.AUTOMATION_ENABLED = "false";
    const cfg = loadEnvAutomationConfig();
    expect(cfg.enabled).toBe(false);
    if (prev !== undefined) process.env.AUTOMATION_ENABLED = prev;
    else delete process.env.AUTOMATION_ENABLED;
  });
});
