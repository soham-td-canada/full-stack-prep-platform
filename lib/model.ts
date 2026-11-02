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
export const nextConcepts = {
  nextRouting: "21. App Router Structure",
  nextBoundaries: "22. Server / Client Components",
  nextDataFetching: "23. Data Fetching",
  nextRendering: "24. Rendering Strategies",
  nextCaching: "25. Caching / Revalidation",
  nextPdp: "26. PDP Freshness Architecture",
  nextDataBoundaries: "27. Server Data / Route / Action",
  nextMutations: "28. Mutations",
  nextArchitecture: "29. Large-App Architecture / Monorepos",
  nextPerformance: "30. Performance Diagnosis",
} as const;
export const allConcepts = { ...concepts, ...reactConcepts, ...nextConcepts };
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
export const nextModes = {
  prediction: "Predict It",
  reconstruction: "Concept Reconstruction",
  debug: "Debug It",
  architecture: "Architecture & Diagnosis",
} as const;
export const legacyModes = { legacyConcept: "Archived concept question" } as const;
export const allModes = { ...modes, ...reactModes, ...nextModes, ...legacyModes };
export type Mode = keyof typeof allModes;
export type ActiveMode = keyof typeof modes | keyof typeof reactModes | keyof typeof nextModes;
export type ModuleId = "javascript-typescript" | "react" | "nextjs-frontend-architecture";
export interface ReadinessConfig {
  concepts: Concept[];
  conceptualMode: ActiveMode;
  requiredImplementationGroups: string[];
  practiceThresholds?: {
    minimumCoreQuestions: number;
    recentCoreWindow: number;
    minimumRecentAccuracy: number;
    minimumMediumQuestions: number;
    minimumMediumDistinct: number;
    minimumMediumAccuracy: number;
    minimumHardQuestions: number;
    minimumHardDistinct: number;
    minimumDebugQuestions: number;
    minimumDebugDistinct: number;
    minimumDebugAccuracy: number;
  };
  readinessDimensions?: {
    id: string;
    label: string;
    minimumQuestions: number;
    minimumCorrect: number;
    mode?: ActiveMode;
    recentWindow?: number;
    minimumAccuracy?: number;
  }[];
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
  frameworkVersion?: string;
  versionSensitive?: boolean;
  versionNotes?: string;
  readinessDimensions?: string[];
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

export const PROGRESS_SCHEMA_VERSION = 6 as const;
export interface Progress {
  schemaVersion: typeof PROGRESS_SCHEMA_VERSION;
  version: 4;
  attempts: Attempt[];
  recentQuestions: string[];
  selectedSessionSize: number;
  reviews: Record<string, { successful: boolean; afterAttempt: number }>;
  resume: { questionId: string; answer: string; revealed: boolean; attemptIndex: number | null; practiceMode?: Mode | null } | null;
  session: {
    size: number;
    startAttempt: number;
    initialMustDo: string[];
    initialCards: string[];
    completed: boolean;
    startedAt?: number;
    endedAt?: number;
    initialRequired?: number;
    mode?: ActiveMode | null;
    focus?: "required" | "optional";
    skipped?: string[];
  } | null;
}

export const emptyProgress = (): Progress => ({
  schemaVersion: PROGRESS_SCHEMA_VERSION, version: 4, attempts: [], recentQuestions: [], selectedSessionSize: 10, reviews: {}, resume: null, session: null,
});
