import { describe, expect, it, vi } from "vitest";
import { questions } from "@/data/questions";
import { overrideAttempt, recordAttempt, reviewCard, startSession } from "@/lib/learning";
import { emptyProgress } from "@/lib/model";
import { moduleRegistry } from "@/lib/modules";
import { createProgressStore, loadProgress, REACT_STORAGE_KEY, saveProgress, STORAGE_KEY, type LocalStorage } from "@/lib/persistence";
import { structuredSolution as reactStructuredSolution } from "./react-fixtures";

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
    expect(loadProgress(storage)).toMatchObject({
      schemaVersion: 6, version: 4, attempts: [{ finalResult: "correct", autoResult: null, overridden: false }],
    });
  });
  it("migrates v2 answers into compact tagged evidence without retaining old response text", () => {
    const storage = memoryStorage();
    const q = questions.find((question) => question.id === "concept-copy-alias")!;
    const old = recordAttempt(emptyProgress(), q, "miss", 100, "Object spread deep-clones nested objects.", "miss");
    const legacy = { ...old, schemaVersion: undefined };
    storage.setItem(STORAGE_KEY, JSON.stringify({
      ...legacy, version: 2, attempts: [{ ...old.attempts[0], answer: "Object spread deep-clones nested objects." }],
      recentQuestions: [], reviews: {}, resume: null, session: null,
    }));
    const migrated = loadProgress(storage);
    expect(migrated).toMatchObject({
      schemaVersion: 6,
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
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).schemaVersion).toBe(6);
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
    const legacy = { ...prior, schemaVersion: undefined, version: 3,
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
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).schemaVersion).toBe(6);
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
  it("recovers independently from invalid attempts and optional progress fields", () => {
    const storage = memoryStorage();
    const progress = recordAttempt(emptyProgress(), questions[0], true);
    const changed = {
      ...progress,
      attempts: [{ ...progress.attempts[0], finalResult: "perfect" }, progress.attempts[0]],
      resume: { questionId: "removed", answer: "", revealed: false, attemptIndex: null },
      session: { size: 999, startAttempt: 0, initialMustDo: [], initialCards: [], completed: true },
      reviews: { unknown: { successful: true, afterAttempt: 0 }, [progress.attempts[0].questionId]: "corrupt" },
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(changed));
    expect(loadProgress(storage)).toMatchObject({
      attempts: [progress.attempts[0]], resume: null, session: null, reviews: {},
    });
  });
  it.each(["{", '{"version":9,"attempts":[]}', '{"version":1,"attempts":{}}'])(
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
    expect(loadProgress(storage).attempts).toHaveLength(0);
    progress.attempts[0].difficulty = questions[0].difficulty;
    progress.attempts[0].concepts = ["typescript"];
    saveProgress(storage, progress);
    expect(loadProgress(storage).attempts).toHaveLength(0);
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
  it("migrates sequentially and initializes only missing optional fields", () => {
    const storage = memoryStorage();
    const q = questions[0];
    const prior = recordAttempt(emptyProgress(), q, true, 100);
    const legacy = {
      ...prior,
      schemaVersion: 3,
      version: 3,
      attempts: [{ ...prior.attempts[0], answer: "historical answer" }],
    };
    delete (legacy as Partial<typeof legacy>).recentQuestions;
    delete (legacy as Partial<typeof legacy>).reviews;
    delete (legacy as Partial<typeof legacy>).resume;
    delete (legacy as Partial<typeof legacy>).session;
    storage.setItem(STORAGE_KEY, JSON.stringify(legacy));
    const store = createProgressStore(() => storage);
    store.hydrate();
    expect(store.getSnapshot().progress).toMatchObject({
      schemaVersion: 6, attempts: [prior.attempts[0]], recentQuestions: [], reviews: {}, resume: null, session: null,
    });
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).schemaVersion).toBe(6);
  });
  it("keeps compatible history when a question is removed or the bank grows", () => {
    const storage = memoryStorage();
    const prior = recordAttempt(emptyProgress(), questions[0], true, 100);
    saveProgress(storage, prior);
    const removed = loadProgress(storage, STORAGE_KEY, questions.slice(1));
    expect(removed.attempts).toEqual(prior.attempts);
    const expanded = loadProgress(storage, STORAGE_KEY, [...questions, { ...questions[0], id: "new-question" }]);
    expect(expanded).toEqual(prior);
  });
  it("does not overwrite source data when migrated-state persistence fails", () => {
    const q = questions[0];
    const raw = JSON.stringify({
      version: 4,
      attempts: [recordAttempt(emptyProgress(), q, true, 100).attempts[0]],
      recentQuestions: [], reviews: {}, resume: null, session: null,
    });
    let writeAttempts = 0;
    const storage: LocalStorage = {
      getItem: () => raw,
      setItem: () => { writeAttempts += 1; throw new Error("Quota exceeded"); },
    };
    const store = createProgressStore(() => storage);
    store.hydrate();
    expect(store.getSnapshot().error).toContain("Cannot migrate");
    store.update(recordAttempt(store.getSnapshot().progress, q, false, 200));
    expect(store.getSnapshot().error).toContain("Cannot migrate");
    expect(writeAttempts).toBe(1);
    expect(raw).not.toContain('"schemaVersion":6');
  });
  it("initializes a newly added module without changing existing module storage", () => {
    const storage = memoryStorage();
    const js = recordAttempt(emptyProgress(), questions[0], true, 100);
    saveProgress(storage, js, STORAGE_KEY);
    const jsBytes = storage.getItem(STORAGE_KEY);
    const reactKey = "react-drill.progress.v1";
    const react = createProgressStore(() => storage, reactKey, []);
    react.hydrate();
    expect(react.getSnapshot().progress).toEqual(emptyProgress());
    expect(storage.getItem(reactKey)).toBeNull();
    expect(storage.getItem(STORAGE_KEY)).toBe(jsBytes);
    react.update(emptyProgress());
    expect(storage.getItem(reactKey)).toContain('"schemaVersion":6');
    expect(loadProgress(storage)).toEqual(js);
  });
  it("preserves JS/TS and React progress when Next.js is added", () => {
    const storage = memoryStorage();
    const js = recordAttempt(emptyProgress(), questions[0], true, 100);
    const reactQuestion = moduleRegistry.react.questions[0];
    const react = recordAttempt(emptyProgress(), reactQuestion, "correct", 200,
      reactStructuredSolution(reactQuestion), "correct");
    saveProgress(storage, js, STORAGE_KEY);
    saveProgress(storage, react, REACT_STORAGE_KEY);
    const jsBytes = storage.getItem(STORAGE_KEY);
    const reactBytes = storage.getItem(REACT_STORAGE_KEY);
    const nextModule = moduleRegistry["nextjs-frontend-architecture"];
    const next = createProgressStore(() => storage, nextModule.storageKey, nextModule.questions);
    next.hydrate();
    expect(next.getSnapshot().progress).toEqual(emptyProgress());
    expect(storage.getItem(nextModule.storageKey)).toBeNull();
    expect(storage.getItem(STORAGE_KEY)).toBe(jsBytes);
    expect(storage.getItem(REACT_STORAGE_KEY)).toBe(reactBytes);
    expect(loadProgress(storage, STORAGE_KEY)).toEqual(js);
    expect(loadProgress(storage, REACT_STORAGE_KEY, moduleRegistry.react.questions)).toEqual(react);
  });
  it("does not duplicate history or reset progress across repeated production reloads", () => {
    const storage = memoryStorage();
    const q = questions[0];
    const prior = recordAttempt(emptyProgress(), q, true, 100);
    const reactQuestion = moduleRegistry.react.questions[0];
    const reactPrior = recordAttempt(emptyProgress(), reactQuestion, "correct", 200,
      reactStructuredSolution(reactQuestion), "correct");
    storage.setItem(STORAGE_KEY, JSON.stringify({
      version: 3, attempts: prior.attempts, recentQuestions: [q.id], reviews: {}, resume: null, session: null,
    }));
    saveProgress(storage, reactPrior, REACT_STORAGE_KEY);
    const first = createProgressStore(() => storage, STORAGE_KEY, questions);
    first.hydrate();
    expect(first.getSnapshot().progress).toMatchObject({
      schemaVersion: 6, attempts: prior.attempts, recentQuestions: [q.id], reviews: {}, resume: null, session: null,
    });
    const nextModule = moduleRegistry["nextjs-frontend-architecture"];
    const next = createProgressStore(() => storage, nextModule.storageKey, nextModule.questions);
    next.hydrate();
    expect(next.getSnapshot().progress).toEqual(emptyProgress());

    const migratedBytes = storage.getItem(STORAGE_KEY);
    const second = createProgressStore(() => storage, STORAGE_KEY, questions);
    second.hydrate();
    expect(second.getSnapshot().progress).toEqual(first.getSnapshot().progress);
    expect(second.getSnapshot().progress.attempts).toHaveLength(1);
    expect(storage.getItem(STORAGE_KEY)).toBe(migratedBytes);
    const reactReload = createProgressStore(() => storage, REACT_STORAGE_KEY, moduleRegistry.react.questions);
    reactReload.hydrate();
    expect(reactReload.getSnapshot().progress).toEqual(reactPrior);
    expect(storage.getItem(nextModule.storageKey)).toBeNull();
  });
  it("surfaces denied localStorage access and does not save before hydration", () => {
    const store = createProgressStore(() => { throw new Error("Access denied"); });
    expect(() => store.update(emptyProgress())).toThrow("not loaded");
    store.hydrate();
    expect(store.getSnapshot()).toMatchObject({ loaded: true, error: expect.stringContaining("Access denied") });
    expect(store.getServerSnapshot().loaded).toBe(false);
  });
});
