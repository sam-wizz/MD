import { describe, expect, it } from "vitest";
import { selectNextOfferTarget } from "./offer-chain";
import {
  canTransition,
  ALLOWED_TRANSITIONS,
  type OrderStatus,
  type TransitionActor,
} from "./state-machine";
import { deliveryOptionsForSupplier } from "./delivery-options";

describe("selectNextOfferTarget — offer chain", () => {
  const ranked = [
    { userId: "a", score: 0.9, breakdown: { price: 0.3 } },
    { userId: "b", score: 0.8, breakdown: { price: 0.25 } },
    { userId: "c", score: 0.7, breakdown: { price: 0.2 } },
  ];

  it("rejection advances to next candidate with incremented rank", () => {
    const d = selectNextOfferTarget({
      ranked,
      alreadyOfferedIds: ["a"],
      lastRank: 1,
      chainCap: 5,
    });
    expect(d.kind).toBe("offer");
    if (d.kind === "offer") {
      expect(d.candidate.userId).toBe("b");
      expect(d.rank).toBe(2);
    }
  });

  it("exhaustion → needs_manual when chain cap reached", () => {
    const d = selectNextOfferTarget({
      ranked,
      alreadyOfferedIds: ["a", "b", "c"],
      lastRank: 5,
      chainCap: 5,
    });
    expect(d.kind).toBe("needs_manual");
  });

  it("exhaustion → needs_manual when no candidates left", () => {
    const d = selectNextOfferTarget({
      ranked,
      alreadyOfferedIds: ["a", "b", "c"],
      lastRank: 3,
      chainCap: 5,
    });
    expect(d.kind).toBe("needs_manual");
    if (d.kind === "needs_manual") expect(d.reason).toMatch(/مرشح/);
  });
});

describe("delivery mode branches end-to-end (state machine)", () => {
  const supplier: TransitionActor = {
    kind: "user",
    userId: "sup-1",
    role: "supplier",
  };
  const carrier: TransitionActor = {
    kind: "user",
    userId: "log-1",
    role: "logistics",
  };

  it("supplier_delivery: preparing → in_transit only", () => {
    expect(
      canTransition("preparing", "in_transit", supplier, {
        deliveryMode: "supplier_delivery",
        assignedSupplierId: "sup-1",
      }),
    ).toEqual({ ok: true });
    expect(
      canTransition("preparing", "ready_for_pickup", supplier, {
        deliveryMode: "supplier_delivery",
        assignedSupplierId: "sup-1",
      }).ok,
    ).toBe(false);
  });

  it("logistics: preparing → ready_for_pickup → in_transit", () => {
    expect(
      canTransition("preparing", "ready_for_pickup", supplier, {
        deliveryMode: "logistics",
        assignedSupplierId: "sup-1",
      }),
    ).toEqual({ ok: true });
    expect(
      canTransition("ready_for_pickup", "in_transit", carrier, {
        deliveryMode: "logistics",
        assignedLogisticsId: "log-1",
        assignedSupplierId: "sup-1",
      }),
    ).toEqual({ ok: true });
  });

  it("hides self-delivery when not capable", () => {
    expect(
      deliveryOptionsForSupplier(
        { delivers_self: false, self_delivery_regions: ["الرياض"] },
        "الرياض",
      ).supplier_delivery,
    ).toBe(false);
  });
});

describe("canTransition — exhaustive forbidden matrix", () => {
  const admin: TransitionActor = { kind: "admin", isAdmin: true, userId: "admin" };
  const statuses = Object.keys(ALLOWED_TRANSITIONS) as OrderStatus[];

  it("rejects every non-listed edge", () => {
    let forbiddenChecked = 0;
    for (const from of statuses) {
      for (const to of statuses) {
        if (from === to && from !== "offered") continue;
        if ((ALLOWED_TRANSITIONS[from] ?? []).includes(to)) continue;
        const r = canTransition(from, to, admin, {
          deliveryMode: "supplier_delivery",
          assignedSupplierId: "s",
          assignedLogisticsId: "l",
          offeredToId: "s",
          businessId: "b",
        });
        expect(r.ok, `${from}→${to}`).toBe(false);
        forbiddenChecked += 1;
      }
    }
    expect(forbiddenChecked).toBeGreaterThan(40);
  });
});
