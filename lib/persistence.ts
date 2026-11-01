import { questions } from "@/data/questions";
import { allModes, emptyProgress, type Mode, type Progress, type Question, type Result } from "./model";
import { allowedMistakeTags, mistakeTags } from "./learning";
import { structuredComplete, structuredValidDraft } from "./structured";

export const STORAGE_KEY = "js-ts-drill.progress.v1";
export interface LocalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const REACT_STORAGE_KEY = "react-drill.progress.v1";
export function loadProgress(storage: LocalStorage, key = STORAGE_KEY, bank = questions): Progress {
  return parseProgress(storage.getItem(key), bank);
}

function parseProgress(raw: string | null, bank: Question[]): Progress {
  const questions = bank;
  if (raw === null) return emptyProgress();
  const data: unknown = JSON.parse(raw);
  if (typeof data !== "object" || data === null || !("version" in data) ||
      (data.version !== 1 && data.version !== 2 && data.version !== 3 && data.version !== 4) ||
      !("attempts" in data) || !Array.isArray(data.attempts)) {
    throw new Error("Saved progress has an unsupported format.");
  }
  const attempts = data.attempts.map((entry: unknown) => {
    if (typeof entry !== "object" || entry === null ||
        !("questionId" in entry) || typeof entry.questionId !== "string" ||
        !("correct" in entry) || typeof entry.correct !== "boolean" ||
        !("timestamp" in entry) || typeof entry.timestamp !== "number" ||
        !Number.isFinite(entry.timestamp) || entry.timestamp < 0 ||
        !("difficulty" in entry) || !("concepts" in entry) || !Array.isArray(entry.concepts)) {
      throw new Error("Saved progress contains an invalid attempt.");
    }
    const question = questions.find((q) => q.id === entry.questionId);
    if (!question || entry.difficulty !== question.difficulty ||
        entry.concepts.length !== question.concepts.length ||
        !entry.concepts.every((c, i) => c === question.concepts[i])) {
      throw new Error("Saved progress does not match the question bank.");
    }
    if (data.version === 1) return {
      questionId: question.id, concepts: question.concepts, difficulty: question.difficulty,
      correct: entry.correct, timestamp: entry.timestamp, autoResult: null,
      finalResult: entry.correct ? "correct" as const : "miss" as const, overridden: false, mistakeTags: [],
    };
    const value = object(entry);
    if ((data.version === 2 && typeof value.answer !== "string") || !isResult(value.finalResult) ||
        !(value.autoResult === null || isResult(value.autoResult)) ||
        typeof value.overridden !== "boolean" ||
        value.correct !== (value.finalResult === "correct") ||
        value.overridden !== (value.autoResult !== null && value.autoResult !== value.finalResult)) {
      throw new Error("Saved progress contains invalid grading metadata.");
    }
    const savedTags = question.mode === "legacyConcept" ? []
      : data.version === 2
      ? question.mode === "debug" ? mistakeTags(question, value.answer as string) : []
      : value.mistakeTags;
    const allowedTags = question.structured || question.mode === "debug" ? allowedMistakeTags(question) : [];
    if (!Array.isArray(savedTags) || !savedTags.every((tag) =>
      typeof tag === "string" && allowedTags.includes(tag))) {
      throw new Error("Saved progress contains invalid mistake tags.");
    }
    if (question.structured && (value.overridden || value.autoResult !== value.finalResult)) {
      throw new Error("Structured grading metadata cannot be overridden.");
    }
    if (question.structured && (typeof value.score !== "number" || !Number.isFinite(value.score) || value.score < 0 || value.score > 1 ||
        (value.finalResult === "correct" && value.score !== 1) || (value.finalResult === "miss" && value.score !== 0) ||
        (value.finalResult === "partial" && (value.score === 0 || value.score === 1)))) {
      throw new Error("Saved structured score is invalid.");
    }
    if (question.structured && (!strings(value.failedFields) || new Set(value.failedFields).size !== value.failedFields.length ||
        !value.failedFields.every((id) => question.structured!.fields.some((field) => field.id === id)) ||
        (value.finalResult === "correct") !== (value.failedFields.length === 0))) {
      throw new Error("Saved structured findings are invalid.");
    }
    return {
      questionId: question.id, concepts: question.concepts, difficulty: question.difficulty,
      correct: entry.correct, timestamp: entry.timestamp,
      autoResult: value.autoResult, finalResult: value.finalResult, overridden: value.overridden,
      mistakeTags: savedTags as string[],
      ...(question.structured ? { score: value.score as number, failedFields: value.failedFields as string[] } : {}),
    };
  });
  const progress: Progress = { ...emptyProgress(), attempts };
  if (data.version === 1) {
    progress.recentQuestions = attempts.slice(-10).map((a) => a.questionId);
    return progress;
  }
  const value = object(data);
  if (value.recentQuestions !== undefined) {
    if (!strings(value.recentQuestions) || value.recentQuestions.length > 10 ||
        !value.recentQuestions.every((id) => questions.some((q) => q.id === id)))
      throw new Error("Saved question history is invalid.");
    progress.recentQuestions = value.recentQuestions;
  }
  const reviews = object(value.reviews);
  for (const [id, rawReview] of Object.entries(reviews)) {
    const review = object(rawReview);
    if (!questions.some((q) => q.id === id) || typeof review.successful !== "boolean" ||
        !integer(review.afterAttempt) || review.afterAttempt > attempts.length)
      throw new Error("Saved weakness review is invalid.");
    progress.reviews[id] = { successful: review.successful, afterAttempt: review.afterAttempt };
  }
  if (value.resume !== null) {
    const resume = object(value.resume);
    if (typeof resume.questionId !== "string" || !questions.some((q) => q.id === resume.questionId) ||
        typeof resume.answer !== "string" || typeof resume.revealed !== "boolean" ||
        !(resume.practiceMode === undefined || resume.practiceMode === null || isMode(resume.practiceMode) || resume.practiceMode === "concept") ||
        !(resume.attemptIndex === null || (integer(resume.attemptIndex) && attempts[resume.attemptIndex]?.questionId === resume.questionId)) ||
        (resume.attemptIndex !== null && !resume.revealed))
      throw new Error("Saved resume state is invalid.");
    const question = bank.find((q) => q.id === resume.questionId)!;
    if (question.mode === "legacyConcept") {
      const replacement = bank.find((q) => q.mode === "reconstruction" && q.structured &&
        q.concepts.some((concept) => question.concepts.includes(concept)));
      if (!replacement) throw new Error("Saved conceptual question has no structured replacement.");
      progress.resume = { questionId: replacement.id, answer: "", revealed: false, attemptIndex: null, practiceMode: "reconstruction" };
    } else {
      progress.resume = { questionId: resume.questionId, answer: resume.answer, revealed: resume.revealed, attemptIndex: resume.attemptIndex };
      if (resume.practiceMode === null || isMode(resume.practiceMode)) progress.resume.practiceMode = resume.practiceMode;
      if (resume.practiceMode === "concept") progress.resume.practiceMode = "reconstruction";
    }
    if (resume.practiceMode && resume.practiceMode !== "concept" && !bank.some((q) => q.mode === resume.practiceMode)) throw new Error("Saved mode belongs to another module.");
    if (question.mode !== "legacyConcept" && question.structured) {
      if (!structuredValidDraft(question, resume.answer) ||
          (resume.revealed && !structuredComplete(question, resume.answer))) {
        throw new Error("Saved structured answer is invalid.");
      }
    }
  }
  if (value.session !== null) {
    const session = object(value.session);
    if ((session.size !== 10 && session.size !== 20 && session.size !== 30) ||
        !integer(session.startAttempt) || session.startAttempt > attempts.length ||
        !strings(session.initialMustDo) || !strings(session.initialCards) || typeof session.completed !== "boolean")
      throw new Error("Saved session is invalid.");
    progress.session = { size: session.size, startAttempt: session.startAttempt,
      initialMustDo: session.initialMustDo, initialCards: session.initialCards,
      completed: attempts.length - session.startAttempt >= session.size };
  }
  return progress;
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Saved progress contains an invalid object.");
  return value as Record<string, unknown>;
}
const isResult = (value: unknown): value is Result => value === "correct" || value === "partial" || value === "miss";
const isMode = (value: unknown): value is Mode => typeof value === "string" && Object.hasOwn(allModes, value);
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((v) => typeof v === "string");

export function saveProgress(storage: LocalStorage, progress: Progress, key = STORAGE_KEY) {
  storage.setItem(key, JSON.stringify(progress));
}

interface Snapshot {
  progress: Progress;
  loaded: boolean;
  error: string | null;
}

export function createProgressStore(getStorage: () => LocalStorage, key = STORAGE_KEY, bank = questions) {
  const initial: Snapshot = { progress: emptyProgress(), loaded: false, error: null };
  let snapshot = initial;
  let readFailed = false;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const detail = (error: unknown) => error instanceof Error ? error.message : String(error);
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initial,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    hydrate() {
      if (snapshot.loaded) return;
      try {
        const storage = getStorage();
        const raw = storage.getItem(key);
        const progress = parseProgress(raw, bank);
        let error: string | null = null;
        if (raw !== null && (JSON.parse(raw) as { version?: unknown }).version !== 4) {
          try {
            saveProgress(storage, progress, key);
          } catch (failure) {
            error = `Cannot migrate local progress: ${detail(failure)} Existing data is still available; future progress may remain in memory only.`;
          }
        }
        snapshot = { progress, loaded: true, error };
      } catch (error) {
        readFailed = true;
        snapshot = { progress: emptyProgress(), loaded: true,
          error: `Cannot load local progress: ${detail(error)} Saved data has not been overwritten. Practice is session-only until you explicitly reset progress.` };
      }
      notify();
    },
    update(progress: Progress, reset = false) {
      if (!snapshot.loaded) throw new Error("Progress has not loaded yet.");
      let error = snapshot.error;
      if (!readFailed || reset) {
        try {
          saveProgress(getStorage(), progress, key);
          readFailed = false;
          error = null;
        } catch (failure) {
          error = `Cannot save local progress: ${detail(failure)} Your current practice remains in memory only.`;
        }
      }
      snapshot = { progress, loaded: true, error };
      notify();
    },
  };
}
