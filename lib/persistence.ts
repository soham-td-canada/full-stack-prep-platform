import { questions } from "@/data/questions";
import { allModes, emptyProgress, PROGRESS_SCHEMA_VERSION, type Mode, type Progress, type Question, type Result } from "./model";
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
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Saved progress has an unsupported format.");
  }
  const source = parsed as Record<string, unknown>;
  const sourceVersion = source.version ?? (source.schemaVersion === PROGRESS_SCHEMA_VERSION ? 4 : undefined);
  const data = migrateSchema(source);
  const formatVersion = sourceVersion ?? 4;
  if (!("attempts" in data) || !Array.isArray(data.attempts)) {
    throw new Error("Saved progress has an unsupported format.");
  }
  const attempts = data.attempts.flatMap((entry: unknown) => {
    try {
      if (typeof entry !== "object" || entry === null ||
          !("questionId" in entry) || typeof entry.questionId !== "string" ||
          !("correct" in entry) || typeof entry.correct !== "boolean" ||
          !("timestamp" in entry) || typeof entry.timestamp !== "number" ||
          !Number.isFinite(entry.timestamp) || entry.timestamp < 0 ||
          !("difficulty" in entry) || !isDifficulty(entry.difficulty) ||
          !("concepts" in entry) || !strings(entry.concepts)) {
        throw new Error("Saved progress contains an invalid attempt.");
      }
      const question = questions.find((q) => q.id === entry.questionId);
      if (question && (entry.difficulty !== question.difficulty ||
          entry.concepts.length !== question.concepts.length ||
          !entry.concepts.every((c, i) => c === question.concepts[i]))) {
        throw new Error("Saved progress does not match the question bank.");
      }
      if (formatVersion === 1) return [{
        questionId: entry.questionId, concepts: question?.concepts ?? entry.concepts as Progress["attempts"][number]["concepts"],
        difficulty: question?.difficulty ?? entry.difficulty as Progress["attempts"][number]["difficulty"],
        correct: entry.correct, timestamp: entry.timestamp, autoResult: null,
        finalResult: entry.correct ? "correct" as const : "miss" as const, overridden: false, mistakeTags: [],
      }];
      const value = object(entry);
      if ((formatVersion === 2 && typeof value.answer !== "string") || !isResult(value.finalResult) ||
          !(value.autoResult === null || isResult(value.autoResult)) ||
          typeof value.overridden !== "boolean" ||
          value.correct !== (value.finalResult === "correct") ||
          value.overridden !== (value.autoResult !== null && value.autoResult !== value.finalResult)) {
        throw new Error("Saved progress contains invalid grading metadata.");
      }
      const savedTags = !question ? Array.isArray(value.mistakeTags) ? value.mistakeTags : []
        : question.mode === "legacyConcept" ? []
        : formatVersion === 2
        ? question.mode === "debug" ? mistakeTags(question, value.answer as string) : []
        : value.mistakeTags ?? [];
      const allowedTags = question && (question.structured || question.mode === "debug") ? allowedMistakeTags(question) : [];
      if (!Array.isArray(savedTags) || !savedTags.every((tag) =>
        typeof tag === "string" && (!question || allowedTags.includes(tag)))) {
        throw new Error("Saved progress contains invalid mistake tags.");
      }
      if (question?.structured && (value.overridden || value.autoResult !== value.finalResult)) {
        throw new Error("Structured grading metadata cannot be overridden.");
      }
      if (question?.structured && (typeof value.score !== "number" || !Number.isFinite(value.score) || value.score < 0 || value.score > 1 ||
          (value.finalResult === "correct" && value.score !== 1) || (value.finalResult === "miss" && value.score !== 0) ||
          (value.finalResult === "partial" && (value.score === 0 || value.score === 1)))) {
        throw new Error("Saved structured score is invalid.");
      }
      if (question?.structured && (!strings(value.failedFields) || new Set(value.failedFields).size !== value.failedFields.length ||
          !value.failedFields.every((id) => question.structured!.fields.some((field) => field.id === id)) ||
          (value.finalResult === "correct") !== (value.failedFields.length === 0))) {
        throw new Error("Saved structured findings are invalid.");
      }
      return [{
        questionId: entry.questionId, concepts: question?.concepts ?? entry.concepts as Progress["attempts"][number]["concepts"],
        difficulty: question?.difficulty ?? entry.difficulty as Progress["attempts"][number]["difficulty"],
        correct: entry.correct, timestamp: entry.timestamp,
        autoResult: value.autoResult, finalResult: value.finalResult, overridden: value.overridden,
        mistakeTags: savedTags as string[],
        ...(question?.structured || (!question && typeof value.score === "number" && Number.isFinite(value.score) &&
          value.score >= 0 && value.score <= 1 && strings(value.failedFields))
          ? { score: value.score as number, failedFields: value.failedFields as string[] } : {}),
      }];
    } catch {
      return [];
    }
  });
  const progress: Progress = { ...emptyProgress(), attempts };
  if (formatVersion === 1) {
    progress.recentQuestions = attempts.slice(-10).map((a) => a.questionId);
    return progress;
  }
  const value = object(data);
  if (integer(value.selectedSessionSize) && value.selectedSessionSize >= 1 && value.selectedSessionSize <= 30) {
    progress.selectedSessionSize = value.selectedSessionSize;
  }
  if (value.recentQuestions !== undefined) {
    if (Array.isArray(value.recentQuestions)) {
      progress.recentQuestions = value.recentQuestions.filter((id): id is string =>
        typeof id === "string" && (questions.some((q) => q.id === id) || attempts.some((a) => a.questionId === id))).slice(-10);
    }
  }
  const reviews = value.reviews && typeof value.reviews === "object" && !Array.isArray(value.reviews)
    ? value.reviews as Record<string, unknown> : {};
  for (const [id, rawReview] of Object.entries(reviews)) {
    try {
      const review = object(rawReview);
      if ((questions.some((q) => q.id === id) || attempts.some((a) => a.questionId === id)) &&
          typeof review.successful === "boolean" && integer(review.afterAttempt) && review.afterAttempt <= attempts.length) {
        progress.reviews[id] = { successful: review.successful, afterAttempt: review.afterAttempt };
      }
    } catch { /* Skip only the corrupted review. */ }
  }
  if (value.resume !== null && value.resume !== undefined) {
    try {
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
    } catch {
      progress.resume = null;
    }
  }
  if (value.session !== null && value.session !== undefined) {
    try {
      const session = object(value.session);
      if (!integer(session.size) || session.size < 1 || session.size > 30 ||
          !integer(session.startAttempt) || session.startAttempt > attempts.length ||
          !strings(session.initialMustDo) || !strings(session.initialCards) || typeof session.completed !== "boolean")
        throw new Error("Saved session is invalid.");
      const skipped = strings(session.skipped) ? session.skipped : [];
      progress.session = { size: session.size, startAttempt: session.startAttempt,
        initialMustDo: session.initialMustDo, initialCards: session.initialCards,
        completed: session.completed || attempts.length - session.startAttempt + skipped.length >= session.size,
        ...(integer(session.startedAt) ? { startedAt: session.startedAt } : {}),
        ...(integer(session.endedAt) ? { endedAt: session.endedAt } : {}),
        ...(integer(session.initialRequired) ? { initialRequired: session.initialRequired } : {}),
        ...(session.mode === null || (isMode(session.mode) && session.mode !== "legacyConcept" &&
          bank.some((q) => q.mode === session.mode)) ? { mode: session.mode } : {}),
        ...(session.focus === "required" || session.focus === "optional" ? { focus: session.focus } : {}),
        skipped,
      };
    } catch {
      progress.session = null;
    }
  }
  return progress;
}

function migrateSchema(source: Record<string, unknown>): Record<string, unknown> {
  const legacyVersion = source.version ?? (source.schemaVersion === PROGRESS_SCHEMA_VERSION ? 4 : undefined);
  if (legacyVersion !== 1 && legacyVersion !== 2 && legacyVersion !== 3 && legacyVersion !== 4) {
    throw new Error("Saved progress has an unsupported format.");
  }
  const storedSchema = source.schemaVersion;
  let schemaVersion = storedSchema === undefined ? legacyVersion : storedSchema;
  if (!integer(schemaVersion) || schemaVersion < 1 || schemaVersion > PROGRESS_SCHEMA_VERSION ||
      schemaVersion < legacyVersion ||
      (schemaVersion === PROGRESS_SCHEMA_VERSION && source.version !== undefined && source.version !== 4)) {
    throw new Error("Saved progress has an unsupported schema version.");
  }
  let migrated = { ...source };
  while (schemaVersion < PROGRESS_SCHEMA_VERSION) {
    migrated = migrateOneVersion(migrated, schemaVersion);
    schemaVersion += 1;
    migrated.schemaVersion = schemaVersion;
  }
  return migrated;
}

function migrateOneVersion(data: Record<string, unknown>, fromVersion: number): Record<string, unknown> {
  const migrated = { ...data };
  switch (fromVersion) {
    case 1:
      if (Array.isArray(migrated.attempts)) {
        migrated.attempts = migrated.attempts.map((entry) => {
          if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return entry;
          const attempt = entry as Record<string, unknown>;
          if (typeof attempt.correct !== "boolean") return attempt;
          return {
            ...attempt,
            autoResult: attempt.autoResult ?? null,
            finalResult: attempt.finalResult ?? (attempt.correct ? "correct" : "miss"),
            overridden: attempt.overridden ?? false,
            mistakeTags: attempt.mistakeTags ?? [],
          };
        });
      }
      break;
    case 2:
      if (migrated.recentQuestions === undefined) migrated.recentQuestions = [];
      if (migrated.reviews === undefined) migrated.reviews = {};
      break;
    case 3:
      if (migrated.reviews === undefined) migrated.reviews = {};
      break;
    case 4:
      if (migrated.resume === undefined) migrated.resume = null;
      if (migrated.session === undefined) migrated.session = null;
      break;
    case 5:
      if (migrated.selectedSessionSize === undefined) migrated.selectedSessionSize = 10;
      break;
    default:
      throw new Error(`No migration exists from schema ${fromVersion}.`);
  }
  return migrated;
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Saved progress contains an invalid object.");
  return value as Record<string, unknown>;
}
const isResult = (value: unknown): value is Result => value === "correct" || value === "partial" || value === "miss";
const isDifficulty = (value: unknown): value is Question["difficulty"] =>
  value === "easy" || value === "medium" || value === "hard";
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
        if (raw !== null && (JSON.parse(raw) as { schemaVersion?: unknown }).schemaVersion !== PROGRESS_SCHEMA_VERSION) {
          try {
            saveProgress(storage, progress, key);
          } catch (failure) {
            readFailed = true;
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
