import { createProgressStore } from "./persistence";
import { moduleRegistry } from "./modules";
import type { ModuleId } from "./model";

export const progressStores = Object.fromEntries(
  Object.values(moduleRegistry).map((module) => [
    module.id,
    createProgressStore(() => window.localStorage, module.storageKey, module.questions),
  ]),
) as Record<ModuleId, ReturnType<typeof createProgressStore>>;
