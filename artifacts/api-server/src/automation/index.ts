export {
  canTransition,
  isTerminal,
  statusAr,
  ALLOWED_TRANSITIONS,
  type OrderStatus,
  type DeliveryMode,
  type TransitionActor,
  type TransitionContext,
  type TransitionResult,
} from "./state-machine";

export {
  loadEnvAutomationConfig,
  type RuntimeAutomationConfig,
  type AutomationMode,
} from "./config";

export {
  hardFilterSuppliers,
  hardFilterLogistics,
  scoreSupplier,
  scoreLogistics,
  rankSuppliers,
  rankLogistics,
  evaluateAutoApproval,
  type SupplierCandidateInput,
  type LogisticsCandidateInput,
  type ScoredCandidate,
  type ScoreDecision,
} from "./scoring";

export {
  processOrderAutomation,
  runAutoApprove,
  runSupplierAssignment,
  runLogisticsAssignment,
  advanceOfferChain,
  placeOffer,
} from "./runner";

export {
  acceptOffer,
  rejectOffer,
  transitionOrder,
} from "./offers";
export { deliveryOptionsForSupplier } from "./delivery-options";

export {
  startAutomationScheduler,
  stopAutomationScheduler,
  sweepExpiredOffers,
  runSchedulerTick,
} from "./scheduler";

export { selectNextOfferTarget } from "./offer-chain";
export { appendStatusHistory } from "./history";
export { notifyUser, setExternalNotifier } from "./notify";
