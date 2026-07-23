import { describe, expect, it } from "vitest";
import {
  evaluateAutoApproval,
  hardFilterSuppliers,
  rankSuppliers,
  rankLogistics,
  type SupplierCandidateInput,
  type LogisticsCandidateInput,
} from "./scoring";
import { deliveryOptionsForSupplier } from "./delivery-options";

const weights = {
  price: 0.35,
  acceptance_rate: 0.25,
  on_time_rate: 0.2,
  remaining_capacity: 0.1,
  region_bonus: 0.1,
};

const logisticsWeights = {
  route_match: 0.4,
  cost: 0.25,
  on_time_rate: 0.2,
  current_load: 0.15,
};

function supplier(partial: Partial<SupplierCandidateInput> & { userId: string }): SupplierCandidateInput {
  return {
    companyName: partial.companyName ?? `Co ${partial.userId}`,
    region: "الرياض",
    categories: ["الأرز والحبوب"],
    serviceRegions: ["الرياض", "جدة"],
    deliversSelf: true,
    selfDeliveryRegions: ["الرياض"],
    dailyCapacity: 10,
    assignedToday: 0,
    bestPrice: 100,
    marketAvgPrice: 120,
    acceptanceRate: 0.9,
    onTimeRate: 0.9,
    isPaused: false,
    status: "approved",
    role: "supplier",
    withinWorkingHours: true,
    ...partial,
  };
}

describe("evaluateAutoApproval", () => {
  const base = {
    businessStatus: "approved",
    hasUnresolvedDispute: false,
    itemsLength: 20,
    category: "الأرز والحبوب",
    region: "الرياض",
    validCategories: ["الأرز والحبوب"],
    validRegions: ["الرياض"],
    ordersToday: 1,
    dailyCap: 20,
  };

  it("approves when all checks pass", () => {
    expect(evaluateAutoApproval(base)).toEqual({ approve: true });
  });

  it("never auto-rejects — returns reason for manual", () => {
    const r = evaluateAutoApproval({ ...base, businessStatus: "pending" });
    expect(r.approve).toBe(false);
    if (!r.approve) expect(r.reason).toMatch(/معتمد/);
  });

  it("blocks on dispute / cap / invalid category", () => {
    expect(evaluateAutoApproval({ ...base, hasUnresolvedDispute: true }).approve).toBe(false);
    expect(evaluateAutoApproval({ ...base, ordersToday: 20 }).approve).toBe(false);
    expect(evaluateAutoApproval({ ...base, category: "xyz" }).approve).toBe(false);
  });
});

describe("hard filters + ranking", () => {
  const order = { product_category: "الأرز والحبوب", delivery_region: "الرياض" };

  it("excludes paused / wrong category / over capacity", () => {
    const list = hardFilterSuppliers(order, [
      supplier({ userId: "a" }),
      supplier({ userId: "b", isPaused: true }),
      supplier({ userId: "c", categories: ["الزيوت والسمن"] }),
      supplier({ userId: "d", assignedToday: 10, dailyCapacity: 10 }),
    ]);
    expect(list.map((c) => c.userId)).toEqual(["a"]);
  });

  it("ranks by score and returns winner", () => {
    const decision = rankSuppliers(
      order,
      [
        supplier({ userId: "cheap", bestPrice: 80, acceptanceRate: 0.95 }),
        supplier({ userId: "pricey", bestPrice: 150, acceptanceRate: 0.5 }),
      ],
      weights,
      { minConfidence: 0.2, tieMargin: 0.01 },
    );
    expect(decision.kind).toBe("offer");
    if (decision.kind === "offer") {
      expect(decision.winner.userId).toBe("cheap");
      expect(decision.winner.breakdown).toHaveProperty("price");
    }
  });

  it("needs_manual on tie within margin", () => {
    const decision = rankSuppliers(
      order,
      [
        supplier({ userId: "a", bestPrice: 100, acceptanceRate: 0.8, onTimeRate: 0.8 }),
        supplier({ userId: "b", bestPrice: 100, acceptanceRate: 0.8, onTimeRate: 0.8 }),
      ],
      weights,
      { minConfidence: 0.1, tieMargin: 0.5 },
    );
    expect(decision.kind).toBe("needs_manual");
  });

  it("needs_manual when below confidence", () => {
    const decision = rankSuppliers(
      order,
      [supplier({ userId: "a", bestPrice: null, acceptanceRate: 0.1, onTimeRate: 0.1 })],
      weights,
      { minConfidence: 0.99, tieMargin: 0.01 },
    );
    expect(decision.kind).toBe("needs_manual");
  });
});

describe("logistics ranking", () => {
  it("filters by covered route", () => {
    const candidates: LogisticsCandidateInput[] = [
      {
        userId: "l1",
        companyName: "L1",
        coveredRoutes: { الرياض: ["جدة"] },
        dailyCapacity: 5,
        assignedToday: 0,
        onTimeRate: 0.9,
        estimatedCost: 200,
        isPaused: false,
        status: "approved",
        role: "logistics",
        withinWorkingHours: true,
      },
      {
        userId: "l2",
        companyName: "L2",
        coveredRoutes: { الرياض: ["الدمام"] },
        dailyCapacity: 5,
        assignedToday: 0,
        onTimeRate: 0.9,
        estimatedCost: 100,
        isPaused: false,
        status: "approved",
        role: "logistics",
        withinWorkingHours: true,
      },
    ];
    const d = rankLogistics("الرياض", "جدة", candidates, logisticsWeights, {
      minConfidence: 0.1,
      tieMargin: 0.01,
    });
    expect(d.kind).toBe("offer");
    if (d.kind === "offer") expect(d.winner.userId).toBe("l1");
  });
});

describe("delivery options (4.3)", () => {
  it("hides self-delivery when not capable or region missing", () => {
    expect(
      deliveryOptionsForSupplier(
        { delivers_self: false, self_delivery_regions: ["الرياض"] },
        "الرياض",
      ).supplier_delivery,
    ).toBe(false);
    expect(
      deliveryOptionsForSupplier(
        { delivers_self: true, self_delivery_regions: ["جدة"] },
        "الرياض",
      ).supplier_delivery,
    ).toBe(false);
    expect(
      deliveryOptionsForSupplier(
        { delivers_self: true, self_delivery_regions: ["الرياض"] },
        "الرياض",
      ).supplier_delivery,
    ).toBe(true);
  });
});

describe("idempotency key shape", () => {
  it("unique constraint dimensions are order_id + candidate_id + rank", () => {
    // توثيق العقد: إعادة placeOffer بنفس الثلاثي يجب ألا تُنشئ صفاً مكرراً
    const key = (orderId: number, candidateId: string, rank: number) =>
      `${orderId}:${candidateId}:${rank}`;
    expect(key(1, "s1", 1)).toBe(key(1, "s1", 1));
    expect(key(1, "s1", 1)).not.toBe(key(1, "s1", 2));
  });
});
