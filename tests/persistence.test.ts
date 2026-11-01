import { describe, expect, it, vi } from "vitest";
import { questions } from "@/data/questions";
import { overrideAttempt, recordAttempt, reviewCard, startSession } from "@/lib/learning";
import { emptyProgress } from "@/lib/model";
import { createProgressStore, loadProgress, saveProgress, STORAGE_KEY, type LocalStorage } from "@/lib/persistence";

function memoryStorage(): LocalStorage {
  const data = new Map<string, string>();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
}

describe("local persistence", () => {
  it("round-trips progress with attempt metadata", () => {
    const storage = memoryStorage();
    expect(loadProgress(storage)).toEqual(emptyProgress());
    const progress = recordAttempt(emptyProgress(), questions[0], true, 100);
    saveProgress(storage, progress);
    expect(loadProgress(storage)).toEqual(progress);
  });
  it("migrates v1 evidence without losing historical results", () => {
    const storage = memoryStorage();
    const q = questions[0];
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, attempts: [{
      questionId: q.id, concepts: q.concepts, difficulty: q.difficulty, correct: true, timestamp: 100,
    }] }));
    expect(loadProgress(storage)).toMatchObject({ version: 4, attempts: [{ finalResult: "correct", autoResult: null, overridden: false }] });
  });
  it("migrates v2 answers into compact tagged evidence without retaining old response text", () => {
    const storage = memoryStorage();
    const q = questions.find((question) => question.id === "concept-copy-alias")!;
    const old = recordAttempt(emptyProgress(), q, "miss", 100, "Object spread deep-clones nested objects.", "miss");
    storage.setItem(STORAGE_KEY, JSON.stringify({
      ...old, version: 2, attempts: [{ ...old.attempts[0], answer: "Object spread deep-clones nested objects." }],
      recentQuestions: [], reviews: {}, resume: null, session: null,
    }));
    const migrated = loadProgress(storage);
    expect(migrated).toMatchObject({
      version: 4,
      attempts: [{ finalResult: "miss", mistakeTags: [] }],
    });
    expect(migrated.attempts[0]).not.toHaveProperty("answer");
  });
  it("rewrites valid legacy storage to the compact schema once during hydration", () => {
    const storage = memoryStorage();
    const q = questions[0];
    storage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      attempts: [{ questionId: q.id, concepts: q.concepts, difficulty: q.difficulty, correct: true, timestamp: 100 }],
    }));
    const store = createProgressStore(() => storage);
    store.hydrate();
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).version).toBe(4);
    expect(store.getSnapshot().progress.attempts).toHaveLength(1);
  });
  it("preserves overrides, drafts, review state and a session across a new store/reload", () => {
    const storage = memoryStorage();
    const q = questions.find((q) => q.id === "debug-scope-handler")!;
    let progress = startSession(emptyProgress(), 20, questions);
    progress = recordAttempt(progress, q, "partial", 100, "A paraphrased answer", "partial");
    progress = overrideAttempt(progress, 0, "correct");
    progress = reviewCard(progress, q.id, true);
    progress.resume = { questionId: q.id, answer: "A paraphrased answer", revealed: true, attemptIndex: 0, practiceMode: "debug" };
    saveProgress(storage, progress);
    const reloaded = createProgressStore(() => storage);
    reloaded.hydrate();
    expect(reloaded.getSnapshot().progress).toEqual(progress);
    expect(reloaded.getSnapshot().progress.attempts[0]).toMatchObject({ autoResult: "partial", finalResult: "correct", overridden: true });
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!)).not.toHaveProperty("checkpoint");
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).resume.answer).toBe("A paraphrased answer");
  });
  it("preserves historical conceptual attempts and safely remaps an old prose resume to reconstruction", () => {
    const storage = memoryStorage();
    const old = questions.find((question) => question.id === "scope-closure")!;
    const prior = recordAttempt(emptyProgress(), old, "miss", 100, "A prose response", "miss");
    const legacy = { ...prior, version: 3,
      attempts: [{ ...prior.attempts[0], mistakeTags: ["spread-deep-clone"] }],
      recentQuestions: [old.id],
      resume: { questionId: old.id, answer: "unfinished prose", revealed: false, attemptIndex: null, practiceMode: "concept" },
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(legacy));
    const store = createProgressStore(() => storage);
    store.hydrate();
    expect(store.getSnapshot().progress.attempts).toHaveLength(1);
    expect(store.getSnapshot().progress.attempts[0]).toMatchObject({ questionId: old.id, finalResult: "miss", mistakeTags: [] });
    expect(store.getSnapshot().progress.resume).toMatchObject({
      questionId: "js-recon-scope-xyz", answer: "", revealed: false, attemptIndex: null, practiceMode: "reconstruction",
    });
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).version).toBe(4);
  });
  it("persists only the active answer rather than every historical response", () => {
    const storage = memoryStorage();
    const progress = recordAttempt(emptyProgress(), questions[0], true, 100, "x".repeat(10_000));
    saveProgress(storage, progress);
    const saved = storage.getItem(STORAGE_KEY)!;
    expect(saved).not.toContain("x".repeat(100));
    expect(JSON.parse(saved).attempts[0]).not.toHaveProperty("answer");
    expect(saved.length).toBeLessThan(2_000);
  });
  it("rejects invalid grading/session/resume metadata rather than trusting stored readiness", () => {
    const storage = memoryStorage();
    const progress = recordAttempt(emptyProgress(), questions[0], true);
    for (const changed of [
      { ...progress, attempts: [{ ...progress.attempts[0], finalResult: "perfect" }] },
      { ...progress, resume: { questionId: "removed", answer: "", revealed: false, attemptIndex: null } },
      { ...progress, session: { size: 999, startAttempt: 0, initialMustDo: [], initialCards: [], completed: true } },
      { ...progress, reviews: { unknown: { successful: true, afterAttempt: 0 } } },
    ]) {
      storage.setItem(STORAGE_KEY, JSON.stringify(changed));
      expect(() => loadProgress(storage)).toThrow();
    }
  });
  it.each(["{", '{"version":2,"attempts":[]}', '{"version":1,"attempts":[null]}'])(
    "rejects corrupt or unsupported data: %s", (raw) => {
      const storage = memoryStorage();
      storage.setItem(STORAGE_KEY, raw);
      expect(() => loadProgress(storage)).toThrow();
    },
  );
  it("rejects invalid or fabricated concept/difficulty evidence", () => {
    const storage = memoryStorage();
    const progress = recordAttempt(emptyProgress(), questions[0], true);
    progress.attempts[0].difficulty = "hard";
    saveProgress(storage, progress);
    expect(() => loadProgress(storage)).toThrow("does not match");
    progress.attempts[0].difficulty = questions[0].difficulty;
    progress.attempts[0].concepts = ["typescript"];
    saveProgress(storage, progress);
    expect(() => loadProgress(storage)).toThrow("does not match");
  });
  it("surfaces load errors and protects corrupt data until explicit reset", () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, "{");
    const store = createProgressStore(() => storage);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.hydrate();
    expect(store.getSnapshot().error).toContain("Cannot load");
    store.update(recordAttempt(emptyProgress(), questions[0], false));
    expect(storage.getItem(STORAGE_KEY)).toBe("{");
    store.update(emptyProgress(), true);
    expect(loadProgress(storage)).toEqual(emptyProgress());
    expect(store.getSnapshot().error).toBeNull();
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
  });
  it("retains session progress and surfaces failed writes", () => {
    const store = createProgressStore(() => ({
      getItem: () => null,
      setItem: () => { throw new Error("Quota exceeded"); },
    }));
    store.hydrate();
    const progress = recordAttempt(emptyProgress(), questions[0], true);
    store.update(progress);
    expect(store.getSnapshot().progress).toEqual(progress);
    expect(store.getSnapshot().error).toContain("Quota exceeded");
  });
  it("surfaces denied localStorage access and does not save before hydration", () => {
    const store = createProgressStore(() => { throw new Error("Access denied"); });
    expect(() => store.update(emptyProgress())).toThrow("not loaded");
    store.hydrate();
    expect(store.getSnapshot()).toMatchObject({ loaded: true, error: expect.stringContaining("Access denied") });
    expect(store.getServerSnapshot().loaded).toBe(false);
  });
});
