import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  numeric,
  jsonb,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";

export const offerCandidateRoleEnum = pgEnum("offer_candidate_role", [
  "supplier",
  "logistics",
]);

export const offerResponseEnum = pgEnum("offer_response", [
  "accepted",
  "rejected",
  "expired",
]);

/**
 * كل عرض قُدّم لمرشح (مورد أو ناقل) — مقبول أو مرفوض أو منتهي.
 * القيد الفريد يمنع تكرار نفس الرتبة لنفس المرشح على نفس الطلب (idempotency).
 */
export const orderOffersTable = pgTable(
  "order_offers",
  {
    id: serial("id").primaryKey(),
    order_id: integer("order_id").notNull(),
    candidate_id: text("candidate_id").notNull(),
    candidate_role: offerCandidateRoleEnum("candidate_role").notNull(),
    rank: integer("rank").notNull(),
    score: numeric("score", { precision: 8, scale: 4 }),
    score_breakdown: jsonb("score_breakdown").$type<Record<string, number>>(),
    offered_at: timestamp("offered_at").defaultNow().notNull(),
    expires_at: timestamp("expires_at").notNull(),
    responded_at: timestamp("responded_at"),
    response: offerResponseEnum("response"),
    reason: text("reason"),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("order_offers_order_candidate_rank_uidx").on(
      t.order_id,
      t.candidate_id,
      t.rank,
    ),
  ],
);

export type OrderOffer = typeof orderOffersTable.$inferSelect;
