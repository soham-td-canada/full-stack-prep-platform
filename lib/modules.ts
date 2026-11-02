import { questions } from "@/data/questions";
import { reactQuestions } from "@/data/react-questions";
import { concepts, modes, nextConcepts, nextModes, reactConcepts, reactModes, type ActiveMode, type Concept, type ModuleId, type Question, type ReadinessConfig } from "./model";
import { nextjsQuestions } from "@/data/nextjs-questions";

export interface TrainingModule {
  id: ModuleId;
  title: string;
  shortTitle: string;
  path: string;
  status: "active";
  syllabusRange: string;
  modes: Partial<Record<ActiveMode, string>>;
  concepts: Partial<Record<Concept, string>>;
  questions: Question[];
  storageKey: string;
  frameworkVersion?: string;
  versionNotes?: string;
  readinessConfig: ReadinessConfig;
  practiceConfig?: {
    modePriority?: Partial<Record<ActiveMode, number>>;
    sessionSizes?: Partial<Record<ActiveMode, number[]>>;
  };
}

export const moduleRegistry: Record<ModuleId, TrainingModule> = {
  "javascript-typescript": {
    id: "javascript-typescript",
    title: "JavaScript / TypeScript",
    shortTitle: "JS / TS",
    path: "/modules/javascript-typescript",
    status: "active",
    syllabusRange: "Areas 1–10",
    modes: { ...modes },
    concepts,
    questions,
    storageKey: "js-ts-drill.progress.v1",
    readinessConfig: {
      concepts: Object.keys(concepts) as Concept[],
      conceptualMode: "reconstruction",
      requiredImplementationGroups: ["debounce", "higher-order", "guard"],
    },
  },
  react: {
    id: "react",
    title: "React",
    shortTitle: "React",
    path: "/modules/react",
    status: "active",
    syllabusRange: "Areas 11–20",
    modes: { ...reactModes },
    concepts: reactConcepts,
    questions: reactQuestions,
    storageKey: "react-drill.progress.v1",
    readinessConfig: {
      concepts: Object.keys(reactConcepts) as Concept[],
      conceptualMode: "reconstruction",
      requiredImplementationGroups: [],
      reviewGate: {
        mode: "codeReview",
        realisticReviewLevel: 3,
        minimumReviews: 3,
        minimumReviewAccuracy: 0.8,
        minimumRealisticReviews: 2,
        minimumRealisticAccuracy: 0.8,
        requireNoRealisticMiss: true,
        label: "20. Demonstrate review judgment: 3 distinct reviews, including 2 realistic reviews at 80%, with no fundamental miss",
      },
    },
  },
  "nextjs-frontend-architecture": {
    id: "nextjs-frontend-architecture",
    title: "Next.js + Frontend Architecture",
    shortTitle: "Next.js",
    path: "/modules/nextjs-frontend-architecture",
    status: "active",
    syllabusRange: "Areas 21–30",
    modes: { ...nextModes },
    concepts: nextConcepts,
    questions: nextjsQuestions,
    storageKey: "nextjs-frontend-architecture.progress.v1",
    frameworkVersion: "Next.js 16.4.3",
    versionNotes: "Caching exercises assume cacheComponents: true, matching next.config.ts.",
    readinessConfig: {
      concepts: Object.keys(nextConcepts) as Concept[],
      conceptualMode: "reconstruction",
      requiredImplementationGroups: [],
      practiceThresholds: {
        minimumCoreQuestions: 30,
        recentCoreWindow: 30,
        minimumRecentAccuracy: 0.82,
        minimumMediumQuestions: 6,
        minimumMediumDistinct: 6,
        minimumMediumAccuracy: 0.8,
        minimumHardQuestions: 6,
        minimumHardDistinct: 6,
        minimumDebugQuestions: 5,
        minimumDebugDistinct: 5,
        minimumDebugAccuracy: 0.8,
      },
      readinessDimensions: [
        { id: "architecture", label: "Architecture & Diagnosis judgment", minimumQuestions: 10, minimumCorrect: 8, recentWindow: 12, minimumAccuracy: 0.8, mode: "architecture" },
        { id: "boundaries", label: "Server/client architecture", minimumQuestions: 4, minimumCorrect: 3, recentWindow: 6, minimumAccuracy: 0.75, mode: "architecture" },
        { id: "fetching", label: "Data-fetch placement", minimumQuestions: 3, minimumCorrect: 3, recentWindow: 5, minimumAccuracy: 0.75, mode: "architecture" },
        { id: "caching", label: "Cache and invalidation decisions", minimumQuestions: 4, minimumCorrect: 3, recentWindow: 6, minimumAccuracy: 0.75, mode: "architecture" },
        { id: "pdp", label: "Mixed-freshness PDP design", minimumQuestions: 6, minimumCorrect: 5, recentWindow: 8, minimumAccuracy: 0.8, mode: "architecture" },
        { id: "mutations", label: "Mutation consistency", minimumQuestions: 3, minimumCorrect: 3, recentWindow: 5, minimumAccuracy: 0.75, mode: "architecture" },
        { id: "large-app", label: "Large-app feature/state boundaries", minimumQuestions: 4, minimumCorrect: 3, recentWindow: 6, minimumAccuracy: 0.75, mode: "architecture" },
        { id: "monorepo", label: "Balanced monorepo trade-offs", minimumQuestions: 4, minimumCorrect: 3, recentWindow: 6, minimumAccuracy: 0.75, mode: "architecture" },
        { id: "performance", label: "Evidence-driven production diagnosis", minimumQuestions: 6, minimumCorrect: 5, recentWindow: 8, minimumAccuracy: 0.8, mode: "architecture" },
      ],
    },
  },
};

export const configuredModules = Object.values(moduleRegistry);
