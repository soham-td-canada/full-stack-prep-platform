# Interview Drill

A local-first interview practice tool focused on active recall and practical reasoning. It does not grade long natural-language explanations, call semantic-answer APIs, or execute learner code.

## Run

```sh
npm install
npm run dev
```

The root route (`/`) lists configured interview modules. JavaScript/TypeScript is at `/modules/javascript-typescript`; React is at `/modules/react` (the legacy `/react` route redirects there). Add a module by registering its title, path, syllabus, modes, question bank, storage key, and readiness settings in `lib/modules.ts`. Navigation and the root dashboard use that registry; no future subjects are shown until configured.

## Practice

JavaScript/TypeScript provides **What Prints?**, **Concept Reconstruction**, **Debug It**, and **Implement It**. Reconstruction uses the shared structured question model and deterministic grading: multi-blank aliases, sentence completion, concept/reason inference, matching, categorization, ordering, true/false correction, and best explanation. Prediction, debugging, and implementation remain separate practical modes.

React uses the same structured renderer, grading, session, persistence, weakness, and readiness infrastructure, with its own configured modes and syllabus. Its question bank is composed from `data/react-questions.ts` and `data/react-expanded-questions.ts`; JS/TS structured exercises are in `data/js-reconstruction.ts`. The legacy JS/TS prose questions remain archived for saved-history compatibility and are excluded from active selection and readiness.

Debugging and implementation answers are self-assessed; reference code is for comparison only. Weakness Review creates targeted cards from repeated mistakes and does not provide a generic flashcard deck. Readiness is evaluated independently per module, and strong reconstruction scores cannot replace practical evidence.

## Progress

Progress is stored locally in this browser under separate keys: `js-ts-drill.progress.v1` and `react-drill.progress.v1`. Question banks are not persisted. The shared persistence layer stores compact attempt summaries, mastery/review state, recent question IDs, and the active session/draft. Version-1 through version-3 JS/TS progress migrates to schema version 4; historical attempts are preserved, and an old prose-question resume is mapped to a related structured question. Reset affects only the selected module.

## Validation

```sh
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
```

Vitest covers question grading, module readiness, progress isolation, weakness detection, session behavior, and persistence migration. Playwright covers module navigation/isolation, practical modes, reconstruction, review, readiness, and resume behavior.
