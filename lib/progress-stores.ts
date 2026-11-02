import { createProgressStore } from "./persistence";
import { moduleRegistry } from "./modules";
import type { ModuleId } from "./model";

export const progressStores = Object.fromEntries(
  Object.values(moduleRegistry).map((module) => [
    module.id,
    createProgressStore(() => window.localStorage, module.storageKey, module.questions),
  ]),
) as Record<ModuleId, ReturnType<typeof createProgressStore>>;

const storeList = Object.values(progressStores);
let combined = storeList.map((store) => store.getSnapshot());
const serverCombined = storeList.map((store) => store.getServerSnapshot());
export const moduleProgressStore = {
  subscribe(listener: () => void) {
    const unsubscribes = storeList.map((store) => store.subscribe(listener));
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  },
  getSnapshot() {
    const next = storeList.map((store) => store.getSnapshot());
    if (next.some((snapshot, index) => snapshot !== combined[index])) combined = next;
    return combined;
  },
  getServerSnapshot: () => serverCombined,
};
