import { describe, expect, it } from "vitest";
import {
  canTransition,
  ALLOWED_TRANSITIONS,
  type OrderStatus,
  type TransitionActor,
  type TransitionContext,
} from "./state-machine";

const admin: TransitionActor = { kind: "admin", isAdmin: true, userId: "admin-1" };
const automation: TransitionActor = { kind: "automation" };
const supplier = (id: string): TransitionActor => ({
  kind: "user",
  userId: id,
  role: "supplier",
});
const logistics = (id: string): TransitionActor => ({
  kind: "user",
  userId: id,
  role: "logistics",
});
const business = (id: string): TransitionActor => ({
  kind: "user",
  userId: id,
  role: "business_owner",
});

const baseCtx: TransitionContext = {
  businessId: "biz-1",
  assignedSupplierId: "sup-1",
  assignedLogisticsId: "log-1",
  offeredToId: "sup-1",
  deliveryMode: "supplier_delivery",
};

function expectOk(
  from: OrderStatus,
  to: OrderStatus,
  actor: TransitionActor,
  ctx: TransitionContext = baseCtx,
) {
  const r = canTransition(from, to, actor, ctx);
  expect(r, `${from}→${to}`).toEqual({ ok: true });
}

function expectFail(
  from: OrderStatus,
  to: OrderStatus,
  actor: TransitionActor,
  ctx: TransitionContext = baseCtx,
) {
  const r = canTransition(from, to, actor, ctx);
  expect(r.ok, `${from}→${to} should fail`).toBe(false);
  if (!r.ok) expect(r.reason.length).toBeGreaterThan(3);
}

describe("canTransition — every allowed edge", () => {
  it("pending → approved | rejected | cancelled | needs_manual", () => {
    expectOk("pending", "approved", automation);
    expectOk("pending", "approved", admin);
    expectOk("pending", "rejected", admin);
    expectOk("pending", "cancelled", business("biz-1"));
    expectOk("pending", "needs_manual", automation);
  });

  it("approved → offered | needs_manual | cancelled", () => {
    expectOk("approved", "offered", automation);
    expectOk("approved", "needs_manual", automation);
    expectOk("approved", "cancelled", business("biz-1"));
  });

  it("offered → assigned | offered | in_transit | needs_manual | cancelled", () => {
    expectOk("offered", "assigned", supplier("sup-1"));
    expectOk("offered", "offered", automation);
    expectOk("offered", "in_transit", logistics("sup-1"), {
      ...baseCtx,
      offeredToId: "sup-1",
      deliveryMode: "logistics",
    });
    expectOk("offered", "needs_manual", automation);
    expectOk("offered", "cancelled", business("biz-1"));
  });

  it("assigned → preparing | needs_manual | cancelled", () => {
    expectOk("assigned", "preparing", supplier("sup-1"));
    expectOk("assigned", "needs_manual", automation);
    expectOk("assigned", "cancelled", business("biz-1"));
  });

  it("preparing branches on delivery_mode", () => {
    expectOk("preparing", "in_transit", supplier("sup-1"), {
      ...baseCtx,
      deliveryMode: "supplier_delivery",
    });
    expectOk("preparing", "ready_for_pickup", supplier("sup-1"), {
      ...baseCtx,
      deliveryMode: "logistics",
    });
    expectOk("preparing", "needs_manual", automation);
    expectOk("preparing", "cancelled", admin);
  });

  it("ready_for_pickup → offered | in_transit | needs_manual", () => {
    expectOk("ready_for_pickup", "offered", automation);
    expectOk("ready_for_pickup", "in_transit", logistics("log-1"));
    expectOk("ready_for_pickup", "needs_manual", automation);
  });

  it("in_transit → delivered", () => {
    expectOk("in_transit", "delivered", supplier("sup-1"));
    expectOk("in_transit", "delivered", logistics("log-1"));
    expectOk("in_transit", "delivered", admin);
  });

  it("needs_manual → approved | offered | assigned | rejected | cancelled (admin)", () => {
    for (const to of ["approved", "offered", "assigned", "rejected", "cancelled"] as OrderStatus[]) {
      expectOk("needs_manual", to, admin);
    }
  });
});

describe("canTransition — forbidden samples", () => {
  it("rejects unknown edges", () => {
    expectFail("pending", "delivered", admin);
    expectFail("delivered", "pending", admin);
    expectFail("in_transit", "preparing", admin);
    expectFail("cancelled", "approved", admin);
  });

  it("preparing wrong branch for delivery_mode", () => {
    expectFail("preparing", "in_transit", supplier("sup-1"), {
      ...baseCtx,
      deliveryMode: "logistics",
    });
    expectFail("preparing", "ready_for_pickup", supplier("sup-1"), {
      ...baseCtx,
      deliveryMode: "supplier_delivery",
    });
  });

  it("terminal states have no outgoing", () => {
    expect(ALLOWED_TRANSITIONS.delivered).toEqual([]);
    expect(ALLOWED_TRANSITIONS.rejected).toEqual([]);
    expect(ALLOWED_TRANSITIONS.cancelled).toEqual([]);
  });
});

describe("authorization ownership", () => {
  it("supplier cannot transition another supplier's order", () => {
    expectFail("assigned", "preparing", supplier("other-sup"));
    expectFail("preparing", "in_transit", supplier("other-sup"), {
      ...baseCtx,
      deliveryMode: "supplier_delivery",
    });
  });

  it("only offered candidate can accept", () => {
    expectFail("offered", "assigned", supplier("other-sup"));
  });

  it("business owner cannot cancel after preparing starts", () => {
    expectFail("preparing", "cancelled", business("biz-1"));
  });

  it("business owner of another business cannot cancel", () => {
    expectFail("pending", "cancelled", business("other-biz"));
  });

  it("non-admin cannot resolve needs_manual", () => {
    expectFail("needs_manual", "approved", supplier("sup-1"));
    expectFail("needs_manual", "rejected", business("biz-1"));
  });

  it("automation cannot reject", () => {
    expectFail("pending", "rejected", automation);
  });

  it("carrier must be assigned logistics", () => {
    expectFail("ready_for_pickup", "in_transit", logistics("wrong"));
  });
});
