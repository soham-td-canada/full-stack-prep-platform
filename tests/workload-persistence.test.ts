import { describe, expect, it } from "vitest";
import { createProgressStore, type LocalStorage } from "@/lib/persistence";
import { moduleRegistry } from "@/lib/modules";
import { calculateRequiredWork } from "@/lib/required-work";
import { recordAttempt, startSession, endSession } from "@/lib/learning";
import { emptyProgress } from "@/lib/model";
import { readyReactProgress } from "./react-fixtures";

function memoryStorage(): LocalStorage {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
}

describe("UX schema migration and production reload", () => {
  it("preserves schema-5 ready evidence and reviews when optional content is deployed", () => {
    const trainingModule = moduleRegistry.react;
    const storage = memoryStorage();
    const prior = readyReactProgress();
    prior.reviews["react-ref"] = { successful: true, afterAttempt: prior.attempts.length };
    storage.setItem(trainingModule.storageKey, JSON.stringify({ ...prior, schemaVersion: 5, selectedSessionSize: undefined }));
    const expanded = { ...trainingModule, questions: [...trainingModule.questions,
      { ...trainingModule.questions[0], id: "new-optional-variant", depth: "optional" as const }] };
    const store = createProgressStore(() => storage, trainingModule.storageKey, expanded.questions);
    store.hydrate();
    const migrated = store.getSnapshot().progress;
    expect(migrated.schemaVersion).toBe(6);
    expect(migrated.attempts).toEqual(prior.attempts);
    expect(migrated.reviews).toEqual(prior.reviews);
    expect(migrated.selectedSessionSize).toBe(10);
    expect(calculateRequiredWork(migrated, expanded).status).toBe("READY TO MOVE ON");
    expect(store.getSnapshot().error).toBeNull();
  });

  it("restores new active session fields and early completion without dropping answers", () => {
    const trainingModule = moduleRegistry["javascript-typescript"];
    const storage = memoryStorage();
    let progress = startSession(emptyProgress(), 5, trainingModule.questions, trainingModule.readinessConfig, 1000);
    progress = { ...progress, selectedSessionSize: 5, session: { ...progress.session!, initialRequired: 21,
      mode: "prints", focus: "required", skipped: ["scope-loop"] } };
    progress = recordAttempt(progress, trainingModule.questions[0], true, 2000);
    progress.resume = { questionId: trainingModule.questions[0].id, answer: trainingModule.questions[0].answer,
      revealed: true, attemptIndex: 0, practiceMode: "prints" };
    storage.setItem(trainingModule.storageKey, JSON.stringify(progress));
    const restored = createProgressStore(() => storage, trainingModule.storageKey, trainingModule.questions);
    restored.hydrate();
    expect(restored.getSnapshot().progress).toEqual(progress);
    restored.update(endSession(progress, 4500));
    const deployed = createProgressStore(() => storage, trainingModule.storageKey, trainingModule.questions);
    deployed.hydrate();
    expect(deployed.getSnapshot().progress.session).toMatchObject({
      completed: true, endedAt: 4500, startedAt: 1000, initialRequired: 21, mode: "prints", skipped: ["scope-loop"],
    });
    expect(deployed.getSnapshot().progress.attempts).toEqual(progress.attempts);
    expect(deployed.getSnapshot().progress.resume).toEqual(progress.resume);
  });
});
