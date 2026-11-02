import { describe, expect, it } from "vitest";
import { reactQuestions } from "@/data/react-questions";
import { questions } from "@/data/questions";
import { emptyProgress, reactConcepts, reactModes, type Mode, type QuestionType } from "@/lib/model";
import { overrideAttempt, readiness, recordAttempt, reviewCard, selectQuestion, startSession, weaknessCards } from "@/lib/learning";
import { evaluateStructured, readStructuredAnswer, structuredComplete } from "@/lib/structured";
import { createProgressStore, loadProgress, REACT_STORAGE_KEY, saveProgress, STORAGE_KEY } from "@/lib/persistence";
import { readyProgress } from "./fixtures";
import { readyReactProgress, structuredSolution } from "./react-fixtures";

const q = (id: string) => reactQuestions.find((question) => question.id === `react-${id}`)!;
function missField(progress: ReturnType<typeof emptyProgress>, id: string, fieldId: string) {
  const question = q(id);
  const answer = readStructuredAnswer(structuredSolution(question));
  const field = question.structured!.fields.find((candidate) => candidate.id === fieldId)!;
  if (field.kind === "text") answer[fieldId] = ["not the accepted answer"];
  else answer[fieldId] = [field.choices.find((choice) => !field.correct.includes(choice.id))!.id];
  const raw = JSON.stringify(answer);
  const result = evaluateStructured(question, raw).result;
  return recordAttempt(progress, question, result, progress.attempts.length + 100, raw, result);
}
const storage = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};

describe("structured React bank and grading", () => {
  it("uses only the four requested modes and covers the exact ten areas", () => {
    expect(new Set(reactQuestions.map((q) => q.mode))).toEqual(new Set(Object.keys(reactModes)));
    expect(new Set(reactQuestions.flatMap((q) => q.concepts))).toEqual(new Set(Object.keys(reactConcepts)));
    expect(new Set(reactQuestions.map((q) => q.id)).size).toBe(reactQuestions.length);
    expect(reactQuestions.every((q) => q.module === "react" && q.structured)).toBe(true);
    expect(weaknessCards(emptyProgress(), reactQuestions)).toEqual([]);
  });
  it("meets the target volume per mode and uses a balanced set of reconstruction formats", () => {
    const count = (mode: Mode) =>
      reactQuestions.filter((question) => question.mode === mode).length;
    expect(count("prediction")).toBeGreaterThanOrEqual(30);
    expect(count("prediction")).toBeLessThanOrEqual(40);
    expect(count("reconstruction")).toBeGreaterThanOrEqual(40);
    expect(count("reconstruction")).toBeLessThanOrEqual(50);
    expect(count("debug")).toBeGreaterThanOrEqual(30);
    expect(count("debug")).toBeLessThanOrEqual(40);
    expect(count("codeReview")).toBeGreaterThanOrEqual(50);
    expect(count("codeReview")).toBeLessThanOrEqual(60);

    const types = reactQuestions.filter((question) => question.mode === "reconstruction")
      .map((question) => question.structured!.type);
    for (const subtype of ["matching", "multiBlank", "completeSentence", "conceptInference",
      "reasonInference", "categorization", "ordering", "trueFalse", "bestExplanation"]) {
      expect(types).toContain(subtype);
    }
    expect(types.filter((type) => type === "bestExplanation").length).toBeGreaterThanOrEqual(5);
    expect(types.filter((type) => type === "matching").length).toBeGreaterThanOrEqual(3);
    expect(types.filter((type) => type === "multiBlank").length).toBeGreaterThanOrEqual(4);
    expect(types.filter((type) => type === "categorization").length).toBeGreaterThanOrEqual(3);
  });
  it.each(["prediction", "matching", "multiBlank", "conceptInference", "reasonInference", "categorization",
    "ordering", "trueFalse", "bestExplanation", "debug", "codeReview"] as QuestionType[])("grades %s deterministically", (type) => {
    for (const question of reactQuestions.filter((q) => q.structured?.type === type)) {
      const answer = structuredSolution(question);
      expect(structuredComplete(question, answer), question.id).toBe(true);
      expect(evaluateStructured(question, answer).result).toBe("correct");
      const draft = readStructuredAnswer(answer);
      delete draft[question.structured!.fields[0].id];
      expect(structuredComplete(question, JSON.stringify(draft))).toBe(false);
      expect(() => evaluateStructured(question, JSON.stringify(draft))).toThrow("Complete every part");
    }
  });
  it("accepts concept aliases/case/punctuation but not arbitrary explanatory prose", () => {
    const answer = { X: ["USE REF CURRENT"], Y: ["React state!"], Z: ["useMemo"] };
    // useRef.current and ref.current are explicit aliases; unrelated words are not.
    answer.X = ["useRef.current!"];
    expect(evaluateStructured(q("xyz"), JSON.stringify(answer)).result).toBe("correct");
    answer.X = ["Refs prevent all renders because React caches components"];
    expect(evaluateStructured(q("xyz"), JSON.stringify(answer)).result).toBe("partial");
    const reason = q("provider-reason");
    expect(evaluateStructured(reason, JSON.stringify({ C: ["NEW OBJECT REFERENCE!"] })).result).toBe("correct");
  });
  it("preserves signs, punctuation and case for exact predicted values", () => {
    expect(evaluateStructured(q("batch"), '{"count":[" 1 "]}').result).toBe("correct");
    expect(evaluateStructured(q("batch"), '{"count":["-1"]}').result).toBe("miss");
    expect(evaluateStructured(q("batch"), '{"count":["1!"]}').result).toBe("miss");
  });
  it("rejects malformed drafts, extra fields, duplicate choices and incomplete matching", () => {
    expect(() => readStructuredAnswer("{")).toThrow();
    expect(() => readStructuredAnswer('{"X":42}')).toThrow("Invalid structured answer");
    expect(structuredComplete(q("xyz"), '{"extra":["value"]}')).toBe(false);
    const answers = readStructuredAnswer(structuredSolution(q("context")));
    answers.consumers.push(answers.consumers[0]);
    expect(structuredComplete(q("context"), JSON.stringify(answers))).toBe(false);
    expect(structuredComplete(q("hook-match"), '{"useRef":["Persist mutable data without rendering"]}')).toBe(false);
  });
  it("scores full sets and ordering, not just selected correct members", () => {
    const question = q("context");
    const answer = readStructuredAnswer(structuredSolution(question));
    answer.consumers.push("Logo does not read ThemeContext");
    expect(evaluateStructured(question, JSON.stringify(answer)).result).toBe("miss");
    const order = readStructuredAnswer(structuredSolution(q("fiber-order")));
    [order["1"], order["3"]] = [order["3"], order["1"]];
    expect(evaluateStructured(q("fiber-order"), JSON.stringify(order)).result).toBe("partial");
  });
  it("makes a missed critical review finding a miss, even with otherwise correct classifications", () => {
    const question = q("review-catalog");
    const answer = readStructuredAnswer(structuredSolution(question));
    answer.deps = ["FINE AS-IS"];
    expect(evaluateStructured(question, JSON.stringify(answer))).toMatchObject({
      result: "miss", mistakeTags: ["review-deps"],
    });
    answer.deps = ["MUST FIX"];
    answer.inline = ["MUST FIX"];
    expect(evaluateStructured(question, JSON.stringify(answer)).result).toBe("partial");
  });
  it("contains three review levels and two meaningful 70–150-line realistic reviews", () => {
    expect(new Set(reactQuestions.filter((q) => q.mode === "codeReview").map((q) => q.reviewLevel))).toEqual(new Set([1, 2, 3]));
    for (const question of reactQuestions.filter((q) => q.reviewLevel === 3)) {
      expect(question.code!.split("\n").length, question.id).toBeGreaterThanOrEqual(70);
      expect(question.code!.split("\n").length, question.id).toBeLessThanOrEqual(150);
      expect(question.structured!.fields.length).toBeGreaterThanOrEqual(8);
      expect(question.structured!.fields.length).toBeLessThanOrEqual(15);
      expect(question.answer).toContain("FINE AS-IS");
    }
  });
  it("tracks the targeted React misconceptions in structured feedback", () => {
    const tags = new Set(reactQuestions.flatMap((question) =>
      question.structured!.fields.flatMap((field) => field.misconceptionTag ? [field.misconceptionTag] : [])));
    expect(tags.has("parent-render-never-renders-child")).toBe(true);
    for (const tag of [
      "render-means-dom-update", "ref-change-rerenders", "effect-for-derived-state",
      "usememo-always-faster", "usecallback-prevents-render", "memo-fixes-all-performance", "context-is-server-cache",
      "tanstack-query-for-ui-state", "index-key-always-safe", "error-boundary-catches-everything",
      "suspense-is-just-spinner", "empty-deps-means-fresh-values", "fiber-equals-virtual-dom",
      "props-change-independently-renders-component",
    ]) expect(tags.has(tag), tag).toBe(true);
  });
});

describe("React progress, weakness and readiness", () => {
  it("can reach readiness using representative core questions without optional depth", () => {
    const state = readiness(readyReactProgress(), reactQuestions);
    expect(state.mustDo).toEqual([]);
    expect(state.status).toBe("READY TO MOVE ON");
    expect(state.coreCoverage).toBe(10);
    expect(state.canDoLater.length).toBeGreaterThan(0);
  });
  it("allows minor review judgment errors without demanding perfect reviews", () => {
    let progress = readyReactProgress();
    for (const id of ["review-catalog", "review-profile"]) {
      const question = q(id);
      const answer = readStructuredAnswer(structuredSolution(question));
      answer[id === "review-catalog" ? "inline" : "privacy"] = ["MEASURE / OPTIONAL"];
      const raw = JSON.stringify(answer);
      const result = evaluateStructured(question, raw);
      expect(result.result).toBe("partial");
      expect(result.score).toBeGreaterThan(0.9);
      progress = recordAttempt(progress, question, result.result, progress.attempts.length + 1, raw, result.result);
    }
    expect(readiness(progress, reactQuestions).mustDo).toEqual([]);
    expect(() => overrideAttempt(progress, progress.attempts.length - 1, "correct")).toThrow("cannot be overridden");
    expect(() => recordAttempt(emptyProgress(), q("ref"), "correct", 1, '{"truth":["True"],"reason":["Refs are state"]}', "correct"))
      .toThrow("deterministic grade");
  });
  it("does not let strong predictions/reconstruction compensate for poor realistic reviews", () => {
    let progress = readyReactProgress();
    for (const id of ["review-catalog", "review-profile", "review-catalog", "review-profile"]) {
      const question = q(id);
      const answer = readStructuredAnswer(structuredSolution(question));
      answer.deps = ["FINE AS-IS"];
      const raw = JSON.stringify(answer);
      const result = evaluateStructured(question, raw).result;
      progress = recordAttempt(progress, question, result, 100 + progress.attempts.length, raw, result);
    }
    expect(readiness(progress, reactQuestions).mustDo.some((gap) => gap.id === "realistic-review")).toBe(true);
    expect(readiness(progress, reactQuestions).status).not.toBe("READY TO MOVE ON");
  });
  it("blocks readiness when a strong learner repeatedly misclassifies server state as UI state", () => {
    let progress = readyReactProgress();
    progress = missField(progress, "r-categorize-state", "cart-server");
    progress = missField(progress, "r-categorize-state", "cart-server");
    const state = readiness(progress, reactQuestions);
    expect(state.mustDo.some((gap) => gap.concept === "reactState")).toBe(true);
    expect(state.conceptPerformance.reactState.recurring).toContain("context-is-server-cache");
  });
  it("marks measured-performance judgment as must-do after repeated blanket memoization", () => {
    let progress = readyReactProgress();
    progress = missField(progress, "r-best-memo", "answer");
    progress = missField(progress, "r-best-memo", "answer");
    progress = missField(progress, "r-best-callback", "answer");
    progress = missField(progress, "r-best-callback", "answer");
    const state = readiness(progress, reactQuestions);
    expect(state.mustDo.some((gap) => gap.concept === "reactPerformance")).toBe(true);
    expect(state.conceptPerformance.reactPerformance.recurring).toContain("usememo-always-faster");
  });
  it("stays ready at 86.7% recent performance with complete coverage and one obscure optional miss", () => {
    let progress = readyReactProgress();
    const recent = reactQuestions.filter((question) => question.depth === "core" && question.mode !== "codeReview").slice(0, 30);
    expect(recent).toHaveLength(30);
    recent.forEach((question, index) => {
      const answer = structuredSolution(question);
      if (index < 4) {
        const draft = readStructuredAnswer(answer);
        for (const field of question.structured!.fields) {
          draft[field.id] = field.kind === "text" ? ["incorrect"] :
            [field.choices.find((choice) => !field.correct.includes(choice.id))!.id];
        }
        const raw = JSON.stringify(draft);
        const result = evaluateStructured(question, raw).result;
        progress = recordAttempt(progress, question, result, progress.attempts.length + 100, raw, result);
      } else {
        progress = recordAttempt(progress, question, "correct", progress.attempts.length + 100, answer, "correct");
      }
    });
    progress = missField(progress, "optional-lanes", "answer");
    const state = readiness(progress, reactQuestions);
    expect(state.recentAccuracy).toBeCloseTo(26 / 30, 5);
    expect(state.status).toBe("READY TO MOVE ON");
    expect(state.mustDo).toEqual([]);
  });
  it("keeps optional micro-optimization misses out of must-do readiness", () => {
    const progress = missField(readyReactProgress(), "optional-lanes", "answer");
    expect(readiness(progress, reactQuestions).status).toBe("READY TO MOVE ON");
  });
  it("blocks repeated effect-for-derived-state mistakes until the causal model is corrected", () => {
    let progress = readyReactProgress();
    progress = missField(progress, "r-best-effect", "answer");
    progress = missField(progress, "r-best-effect", "answer");
    const state = readiness(progress, reactQuestions);
    expect(state.mustDo.some((gap) => gap.concept === "reactEffects")).toBe(true);
    expect(state.conceptPerformance.reactEffects.recurring).toContain("effect-for-derived-state");
  });
  it("keeps serious accessibility misses must-do until distinct reviews demonstrate recovery", () => {
    let progress = readyReactProgress();
    progress = missField(progress, "review-a11y-errors", "label");
    progress = missField(progress, "review-basic", "labels");
    expect(readiness(progress, reactQuestions).mustDo.some((gap) => gap.id === "realistic-review")).toBe(true);

    progress = recordAttempt(progress, q("review-a11y-errors"), "correct", progress.attempts.length + 100,
      structuredSolution(q("review-a11y-errors")), "correct");
    progress = recordAttempt(progress, q("batch"), "correct", progress.attempts.length + 100,
      structuredSolution(q("batch")), "correct");
    progress = recordAttempt(progress, q("ref"), "correct", progress.attempts.length + 100,
      structuredSolution(q("ref")), "correct");
    progress = recordAttempt(progress, q("review-basic"), "correct", progress.attempts.length + 100,
      structuredSolution(q("review-basic")), "correct");
    progress = recordAttempt(progress, q("review-profile"), "correct", progress.attempts.length + 100,
      structuredSolution(q("review-profile")), "correct");
    expect(readiness(progress, reactQuestions).status).toBe("READY TO MOVE ON");
  });
  it("requires medium, hard and debug exposure, conceptual/practical coverage and distinct questions", () => {
    let progress = emptyProgress();
    for (let i = 0; i < 40; i++) progress = recordAttempt(progress, q("batch"), "correct", i, structuredSolution(q("batch")), "correct");
    const state = readiness(progress, reactQuestions);
    expect(state.status).not.toBe("READY TO MOVE ON");
    expect(state.mustDo.map((gap) => gap.id)).toEqual(expect.arrayContaining(["medium", "hard", "debug", "realistic-review"]));
    expect(state.conceptPerformance.reactRender.total).toBe(1);
  });
  it("generates only performance-derived cards; card success cannot create readiness", () => {
    const question = q("ref");
    const wrong = JSON.stringify({ truth: ["True"], reason: ["Refs are state"] });
    let progress = emptyProgress();
    for (let i = 0; i < 2; i++) progress = recordAttempt(progress, question, "miss", i, wrong, "miss");
    expect(weaknessCards(progress, reactQuestions).map((q) => q.id)).toContain(question.id);
    const state = readiness(progress, reactQuestions);
    const reviewed = reviewCard(progress, question.id, true);
    expect(readiness(reviewed, reactQuestions)).toEqual(state);
    expect(state.mustDo.find((gap) => gap.concept === "reactHooks")?.label).toContain("recurring");
  });
  it("retains the failed field for targeted recall, not a generic React deck", () => {
    const question = q("xyz");
    const answer = JSON.stringify({ X: ["ref.current"], Y: ["state"], Z: ["React.memo"] });
    const progress = recordAttempt(recordAttempt(emptyProgress(), question, "partial", 1, answer, "partial"),
      question, "partial", 2, answer, "partial");
    expect(progress.attempts.at(-1)?.failedFields).toEqual(["Z"]);
    expect(progress.attempts.at(-1)?.mistakeTags).toEqual(["memo-renders"]);
    expect(weaknessCards(progress, reactQuestions).map((q) => q.id)).toEqual([question.id]);
    expect(readiness(progress, reactQuestions).mustDo.find((gap) => gap.concept === "reactHooks")?.label).toContain("recurring");
  });
  it("prioritizes code reviews and keeps sessions bounded with resume evidence", () => {
    let progress = startSession(emptyProgress(), 10, reactQuestions);
    expect(selectQuestion(reactQuestions, null, progress)?.mode).toBe("codeReview");
    for (let i = 0; i < 10; i++) progress = recordAttempt(progress, q("batch"), "correct", i, structuredSolution(q("batch")), "correct");
    expect(progress.session?.completed).toBe(true);
    expect(selectQuestion(reactQuestions, "prediction", progress)?.mode).toBe("prediction");
  });
  it("persists independent module state without altering existing JS/TS bytes or readiness", () => {
    const local = storage();
    const js = readyProgress();
    saveProgress(local, js);
    const before = local.getItem(STORAGE_KEY);
    const react = readyReactProgress();
    react.resume = { questionId: "react-xyz", answer: '{"X":["ref.current"]}', revealed: false, attemptIndex: null, practiceMode: "reconstruction" };
    saveProgress(local, react, REACT_STORAGE_KEY);
    expect(loadProgress(local, REACT_STORAGE_KEY, reactQuestions)).toEqual(react);
    expect(local.getItem(STORAGE_KEY)).toBe(before);
    expect(loadProgress(local)).toEqual(js);
    expect(readiness(js, questions).status).toBe("READY TO MOVE ON");
    expect(loadProgress(local, REACT_STORAGE_KEY, questions).attempts).toEqual(react.attempts);
  });
  it("protects corrupt React data and resets only the selected module", () => {
    const local = storage();
    saveProgress(local, readyProgress());
    const js = local.getItem(STORAGE_KEY);
    local.setItem(REACT_STORAGE_KEY, "{");
    const store = createProgressStore(() => local, REACT_STORAGE_KEY, reactQuestions);
    store.hydrate();
    expect(store.getSnapshot().error).toContain("Cannot load");
    store.update(emptyProgress());
    expect(local.getItem(REACT_STORAGE_KEY)).toBe("{");
    store.update(emptyProgress(), true);
    expect(store.getSnapshot().error).toBeNull();
    expect(local.getItem(STORAGE_KEY)).toBe(js);
  });
});
