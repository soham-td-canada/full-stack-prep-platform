import { questions } from "@/data/questions";
import { reactQuestions } from "@/data/react-questions";
import { concepts, modes, reactConcepts, reactModes, type ActiveMode, type Concept, type ModuleId, type Question, type ReadinessConfig } from "./model";

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
  readinessConfig: ReadinessConfig;
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
};

export const configuredModules = Object.values(moduleRegistry);
