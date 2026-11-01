import type { Concept, Difficulty, Mode, Question } from "@/lib/model";
import { coreHardQuestions } from "./core-hard-questions";

export function question(
  id: string, mode: Mode | "concept", concepts: Concept[], difficulty: Difficulty,
  prompt: string, answer: string, explanation: string,
  misconceptionPrompt: string, code?: string, reference?: string,
): Question {
  return {
    id, mode: mode === "concept" ? "legacyConcept" : mode, concepts, difficulty, prompt, answer, explanation, code, reference,
    depth: difficulty === "hard" && !coreHardQuestions.has(id) ? "optional" : "core",
    misconception: { prompt: misconceptionPrompt, answer: explanation },
  };
}
