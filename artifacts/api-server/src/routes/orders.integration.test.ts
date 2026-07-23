/**
 * عقود تكامل مسارات الطلبات + تفويض (بدون الاعتماد على Postgres حقيقي).
 */
import { describe, expect, it } from "vitest";
import {
  canTransition,
  ALLOWED_TRANSITIONS,
  type OrderStatus,
} from "../automation/state-machine";
import { selectNextOfferTarget } from "../automation/offer-chain";
import { deliveryOptionsForSupplier } from "../automation/delivery-options";

/** يحاكي تسلسل إنشاء → اعتماد → إسناد → تجهيز → تسليم (توصيل ذاتي) */
function walkSupplierDelivery() {
  const steps: [OrderStatus, OrderStatus][] = [
    ["pending", "approved"],
    ["approved", "offered"],
    ["offered", "assigned"],
    ["assigned", "preparing"],
    ["preparing", "in_transit"],
    ["in_transit", "delivered"],
  ];
  const admin = { kind: "admin" as const, isAdmin: true, userId: "admin" };
  const automation = { kind: "automation" as const };
  const supplier = { kind: "user" as const, userId: "sup-1", role: "supplier" };
  const ctx = {
    assignedSupplierId: "sup-1",
    offeredToId: "sup-1",
    businessId: "biz-1",
    deliveryMode: "supplier_delivery" as const,
  };

  const actors = [automation, automation, supplier, supplier, supplier, supplier];
  // pending→approved: automation; approved→offered: automation; rest supplier/admin
  const use = [
    automation,
    automation,
    supplier,
    supplier,
    supplier,
    supplier,
  ];

  for (let i = 0; i < steps.length; i++) {
    const [from, to] = steps[i];
    const actor = i < 2 ? automation : use[i];
    const r = canTransition(from, to, actor === automation && to === "assigned" ? supplier : actor, ctx);
    expect(r, `${from}→${to}`).toEqual({ ok: true });
  }
  // admin can also approve
  expect(canTransition("pending", "approved", admin)).toEqual({ ok: true });
  void actors;
}

/** مسار النقل: preparing → ready_for_pickup → offered → in_transit → delivered */
function walkLogistics() {
  const supplier = { kind: "user" as const, userId: "sup-1", role: "supplier" };
  const carrier = { kind: "user" as const, userId: "log-1", role: "logistics" };
  const automation = { kind: "automation" as const };
  const ctxBase = {
    assignedSupplierId: "sup-1",
    assignedLogisticsId: "log-1",
    offeredToId: "log-1",
    businessId: "biz-1",
    deliveryMode: "logistics" as const,
  };

  expect(
    canTransition("preparing", "ready_for_pickup", supplier, ctxBase),
  ).toEqual({ ok: true });
  expect(canTransition("ready_for_pickup", "offered", automation, ctxBase)).toEqual({
    ok: true,
  });
  expect(canTransition("offered", "in_transit", carrier, ctxBase)).toEqual({ ok: true });
  expect(canTransition("in_transit", "delivered", carrier, ctxBase)).toEqual({ ok: true });
}

describe("order lifecycle integration (both delivery modes)", () => {
  it("supplier_delivery full path", () => {
    walkSupplierDelivery();
  });

  it("logistics full path", () => {
    walkLogistics();
  });

  it("create→approve→assign contract statuses exist in machine", () => {
    expect(ALLOWED_TRANSITIONS.pending).toContain("approved");
    expect(ALLOWED_TRANSITIONS.approved).toContain("offered");
    expect(ALLOWED_TRANSITIONS.offered).toContain("assigned");
  });
});

describe("authorization: supplier modifying another's order → denied", () => {
  it("returns not-ok Arabic reason (route maps to 403/404)", () => {
    const r = canTransition(
      "assigned",
      "preparing",
      { kind: "user", userId: "attacker", role: "supplier" },
      { assignedSupplierId: "owner-supplier", businessId: "biz-1" },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason.length).toBeGreaterThan(5);
      expect(r.reason).toMatch(/المورد|مصرح|فقط/);
    }
  });

  it("business cannot cancel another business order", () => {
    const r = canTransition(
      "pending",
      "cancelled",
      { kind: "user", userId: "biz-attacker", role: "business_owner" },
      { businessId: "biz-victim" },
    );
    expect(r.ok).toBe(false);
  });
});

describe("admin resolve + assign transitions", () => {
  it("admin can approve, reject, assign from needs_manual", () => {
    const admin = { kind: "admin" as const, isAdmin: true, userId: "a1" };
    for (const to of ["approved", "assigned", "rejected", "cancelled"] as OrderStatus[]) {
      expect(canTransition("needs_manual", to, admin).ok).toBe(true);
    }
  });
});

describe("offer chain after reject", () => {
  it("rejection → next; then exhaustion → needs_manual", () => {
    const ranked = [
      { userId: "s1", score: 0.9, breakdown: {} },
      { userId: "s2", score: 0.8, breakdown: {} },
    ];
    const next = selectNextOfferTarget({
      ranked,
      alreadyOfferedIds: ["s1"],
      lastRank: 1,
      chainCap: 2,
    });
    expect(next.kind).toBe("offer");
    if (next.kind === "offer") expect(next.candidate.userId).toBe("s2");

    const done = selectNextOfferTarget({
      ranked,
      alreadyOfferedIds: ["s1", "s2"],
      lastRank: 2,
      chainCap: 2,
    });
    expect(done.kind).toBe("needs_manual");
  });
});

describe("delivery options at accept time", () => {
  it("hides self-delivery when region not covered", () => {
    const opts = deliveryOptionsForSupplier(
      { delivers_self: true, self_delivery_regions: ["جدة"] },
      "الرياض",
    );
    expect(opts.supplier_delivery).toBe(false);
    expect(opts.logistics).toBe(true);
  });
});
