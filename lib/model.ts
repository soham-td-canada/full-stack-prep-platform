export const concepts = {
  scope: "Scope / Closures",
  this: "this",
  prototypes: "Prototypes",
  eventLoop: "Event Loop",
  promises: "Promises",
  copying: "References / Copying",
  timing: "Debounce / Throttle",
  currying: "Currying / Higher-order Functions",
  typescript: "TypeScript",
  reasoning: "Code Reasoning / Complexity",
} as const;

export const reactConcepts = {
  reactRender: "11. Render / Re-render",
  reactIdentity: "12. Reconciliation / Fiber / Keys",
  reactHooks: "13. Core Hooks",
  reactEffects: "14. Closures / Effects / Races",
  reactForms: "15. Controlled Forms",
  reactState: "16. State Placement",
  reactPerformance: "17. Profiler / Rendering Judgment",
  reactRecovery: "18. Errors / Suspense / Recovery",
  reactDesign: "19. Composition / Component APIs",
  reactReview: "20. Code Review / Refactor",
} as const;
export const allConcepts = { ...concepts, ...reactConcepts };
export type Concept = keyof typeof allConcepts;
export const modes = {
  prints: "What Prints?",
  reconstruction: "Concept Reconstruction",
  debug: "Debug It",
  implement: "Implement It",
} as const;
export const reactModes = {
  prediction: "Predict It",
  reconstruction: "Concept Reconstruction",
  debug: "Debug It",
  codeReview: "Code Review / Refactor",
} as const;
export const legacyModes = { legacyConcept: "Archived concept question" } as const;
export const allModes = { ...modes, ...reactModes, ...legacyModes };
export type Mode = keyof typeof allModes;
export type ActiveMode = keyof typeof modes | keyof typeof reactModes;
export type ModuleId = "javascript-typescript" | "react";
export interface ReadinessConfig {
  concepts: Concept[];
  conceptualMode: ActiveMode;
  requiredImplementationGroups: string[];
  reviewGate?: {
    mode: ActiveMode;
    realisticReviewLevel: number;
    minimumReviews: number;
    minimumReviewAccuracy: number;
    minimumRealisticReviews: number;
    minimumRealisticAccuracy: number;
    requireNoRealisticMiss: boolean;
    label: string;
  };
}
export type Difficulty = "easy" | "medium" | "hard";
export type Result = "correct" | "partial" | "miss";

export interface Question {
  id: string;
  module?: ModuleId;
  mode: Mode;
  concepts: Concept[];
  difficulty: Difficulty;
  prompt: string;
  code?: string;
  answer: string;
  explanation: string;
  reference?: string;
  depth: "core" | "optional";
  misconception: { prompt: string; answer: string };
  structured?: StructuredQuestion;
  reviewLevel?: 1 | 2 | 3;
}

export type QuestionType = "prediction" | "matching" | "multiBlank" | "completeSentence" | "conceptInference" |
  "reasonInference" | "categorization" | "ordering" | "trueFalse" | "bestExplanation" | "debug" | "codeReview";
export type StructuredField = {
  id: string;
  label: string;
  misconceptionTag?: string;
  severity?: "critical" | "normal";
} & ({
  kind: "text";
  accepted: string[];
  exact?: boolean;
} | {
  kind: "select";
  choices: { id: string; label: string }[];
  correct: string[];
  multiple?: boolean;
});
export interface StructuredQuestion {
  type: QuestionType;
  fields: StructuredField[];
}

export interface Attempt {
  questionId: string;
  concepts: Concept[];
  difficulty: Difficulty;
  correct: boolean;
  timestamp: number;
  autoResult: Result | null;
  finalResult: Result;
  overridden: boolean;
  mistakeTags: string[];
  score?: number;
  failedFields?: string[];
}

export interface Progress {
  version: 4;
  attempts: Attempt[];
  recentQuestions: string[];
  reviews: Record<string, { successful: boolean; afterAttempt: number }>;
  resume: { questionId: string; answer: string; revealed: boolean; attemptIndex: number | null; practiceMode?: Mode | null } | null;
  session: {
    size: 10 | 20 | 30;
    startAttempt: number;
    initialMustDo: string[];
    initialCards: string[];
    completed: boolean;
  } | null;
}

export const emptyProgress = (): Progress => ({ version: 4, attempts: [], recentQuestions: [], reviews: {}, resume: null, session: null });
