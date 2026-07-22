import { getPosAdapter, getPosAdapterKind } from "../pos/factory";
import {
  ReorderSuggestionRepository,
  POS_REQUIRED_SCOPES,
} from "./reorder-suggestion-repository";
import { ReorderSuggestionService } from "./reorder-suggestion-service";

let repositorySingleton: ReorderSuggestionRepository | undefined;
let serviceSingleton: ReorderSuggestionService | undefined;

export function getReorderSuggestionRepository(): ReorderSuggestionRepository {
  repositorySingleton ??= new ReorderSuggestionRepository();
  return repositorySingleton;
}

export function getReorderSuggestionService(): ReorderSuggestionService {
  serviceSingleton ??= new ReorderSuggestionService(
    getReorderSuggestionRepository(),
    getPosAdapter(),
    getPosAdapterKind(),
  );
  return serviceSingleton;
}

export { POS_REQUIRED_SCOPES };
