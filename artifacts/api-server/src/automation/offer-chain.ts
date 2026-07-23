/**
 * اختيار المرشح التالي في سلسلة العروض — نقي وقابل للاختبار.
 */

export type RankedCandidate = {
  userId: string;
  score: number;
  breakdown: Record<string, number>;
};

export type NextOfferDecision =
  | {
      kind: "offer";
      candidate: RankedCandidate;
      rank: number;
    }
  | {
      kind: "needs_manual";
      reason: string;
    };

export function selectNextOfferTarget(input: {
  ranked: RankedCandidate[];
  alreadyOfferedIds: Set<string> | string[];
  lastRank: number;
  chainCap: number;
}): NextOfferDecision {
  const offered = new Set(input.alreadyOfferedIds);
  const nextRank = input.lastRank + 1;

  if (input.lastRank >= input.chainCap || nextRank > input.chainCap) {
    return {
      kind: "needs_manual",
      reason: "استُنفدت سلسلة المرشحين دون قبول",
    };
  }

  const next = input.ranked.find((c) => !offered.has(c.userId));
  if (!next) {
    return {
      kind: "needs_manual",
      reason: "لا تبقى مرشحون بعد الرفض/الانتهاء",
    };
  }

  return { kind: "offer", candidate: next, rank: nextRank };
}
