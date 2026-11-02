# Interview Drill

A local-first interview practice tool focused on active recall and practical reasoning. It does not grade long natural-language explanations, call semantic-answer APIs, or execute learner code.

## Run

```sh
npm install
npm run dev
```

The root route (`/`) lists configured interview modules. JavaScript/TypeScript is at `/modules/javascript-typescript`; React is at `/modules/react`; Next.js + Frontend Architecture is at `/modules/nextjs-frontend-architecture`. Add a module by registering its title, path, syllabus, modes, question bank, storage key, and readiness settings in `lib/modules.ts`. Navigation and the root dashboard use that registry; no future subjects are shown until configured.

## Practice

JavaScript/TypeScript provides **What Prints?**, **Concept Reconstruction**, **Debug It**, and **Implement It**. Reconstruction uses the shared structured question model and deterministic grading: multi-blank aliases, sentence completion, concept/reason inference, matching, categorization, ordering, true/false correction, and best explanation. Prediction, debugging, and implementation remain separate practical modes.

React uses the same structured renderer, grading, session, persistence, weakness, and readiness infrastructure, with its own configured modes and syllabus. Its question bank is composed from `data/react-questions.ts` and `data/react-expanded-questions.ts`; JS/TS structured exercises are in `data/js-reconstruction.ts`.

Next.js + Frontend Architecture uses those same shared systems and four modes: **Predict It**, **Concept Reconstruction**, **Debug It**, and **Architecture & Diagnosis**. Its 177 exercises in `data/nextjs-questions.ts` cover syllabus 21–30: 35 predictions, 41 reconstructions, 38 debugging exercises, and 63 architecture/diagnosis scenarios. All answers are structured selections, including blanks, matching, ordering and reason reconstruction; there are no prose grading fields. PDP freshness/failure design, large-app/monorepo trade-offs and evidence-driven deployment diagnosis receive the largest architecture sets.

The baseline is the installed **Next.js 16.4.3**, with `cacheComponents: true` and `partialPrefetching: true` from `next.config.ts`; dependencies are unchanged. Framework-sensitive exercises carry version metadata and explicit prompt assumptions. The accuracy audit uses the bundled official docs in `node_modules/next/dist/docs/01-app/`: getting-started `05-server-and-client-components.md`, `06-fetching-data.md`, `07-mutating-data.md`, `08-caching.md`, `09-revalidating.md`, `15-route-handlers.md`; the `use-cache` directive; function references for `fetch`, `cacheLife`, `cacheTag`, `revalidatePath`, `revalidateTag`, `updateTag`, `refresh`, `cookies`, `headers`; page/loading/error/not-found conventions; and `02-guides/migrating-to-cache-components.md`. The official [updateTag reference](https://nextjs.org/docs/app/api-reference/functions/updateTag) was also checked.

In this model, cached content can coexist with request-time regions; `use cache` caches async results, while `cacheLife` governs their lifetime. `stale`, `revalidate` and `expire` have distinct client/server timing roles; a background revalidation interval is not a hard freshness guarantee. Ordinary cached scopes cannot directly read cookies/headers. `updateTag` immediately expires entries in Server Actions; `revalidateTag(tag, 'max')` permits stale-while-revalidate, and `{ expire: 0 }` supports immediate expiration outside actions. The one-argument tag form is deprecated. Path invalidation follows page/layout scope and differs between Server Functions and Route Handlers. Router refresh, server cache invalidation and browser query refetch are separate. GET Route Handlers use the Cache Components prerendering model and must put `use cache` in a helper, not the handler body. Request props/APIs are asynchronous; this installed error convention uses `retry` and an `unknown` error value. Next.js dispatches actions sequentially per client, not globally on the server; `Promise.all` in the browser does not override that dispatcher. Do not substitute older-major defaults or legacy segment `dynamic`/`revalidate`/`fetchCache` exports.

Next.js readiness requires 30 distinct recent core exercises at 82%, medium/hard/debug breadth, and separate recent **architecture-mode** evidence for server/client boundaries, fetching, caching, PDP, mutations, large-app design, monorepos and performance diagnosis. Old pass totals and easy recall cannot swamp recent architecture mistakes. Recurring misconceptions remain must-do; review cards alone do not clear readiness. Route-group depth and advanced Nx/Turborepo command recall are optional, not prerequisites. The legacy JS/TS prose questions remain archived for saved-history compatibility and are excluded from active selection and readiness.

JS/TS debugging and implementation answers are self-assessed; reference code is for comparison only. React and Next.js structured exercises are graded deterministically. Weakness Review creates targeted cards from repeated mistakes and does not provide a generic flashcard deck. Readiness is evaluated independently per module, and strong reconstruction scores cannot replace practical evidence.

## Progress

Progress is stored locally in this browser under separate, stable keys: `js-ts-drill.progress.v1`, `react-drill.progress.v1`, and `nextjs-frontend-architecture.progress.v1`. Question banks are not persisted. The shared persistence layer stores compact attempt summaries, mastery/review state, recent question IDs, and the active session/draft with an explicit schema version. Legacy versions migrate sequentially to schema version 6; valid historical attempts and compatible module state are preserved, while removed-question references remain safe. Migration validates before writing, and recoverable errors leave the original data untouched. Adding a module initializes progress only for its new key; existing module keys are not changed. Reset affects only the selected module.

### Required work and stopping points

The dashboard and module pages emphasize **required questions left**, not unseen bank size or mastery percentages. `lib/required-work.ts` derives a deterministic successful-evidence practice plan against the unchanged readiness engine. It accounts for overlapping concept, difficulty, implementation, review and architecture gates; one question may clear several requirements. It is an achievable, adaptive plan, not a guarantee that any N answers will clear readiness, nor a mathematically optimal shortest path. Counts can change when new evidence reveals a weakness. Optional bank additions alone never revoke readiness.

Modes show **REQUIRED**, **REQUIRED WORK COMPLETE** (unseen optional practice remains), or **COMPLETE** (no unseen questions and no required work). Complete-mode ordinary actions are disabled. Expand the required breakdown or consult **MUST DO NEXT** for prioritized work. Review/architecture and implementation default to three deep exercises; standard practice defaults to ten questions. Module `practiceConfig` can override mode priorities and session presets.

Sessions retain their start timestamp, mode/focus, selected size, completed answers, skips and current draft. The isolated elapsed clock does not write storage each second, reset between questions, or affect grading. Refresh offers a saved-question resume. Ending early preserves all completed answers and produces a before/after required-work summary; unfinished questions are not failures. Skips consume a session slot but provide no readiness evidence. Older sessions without a timestamp or baseline retain their evidence; their original timing/baseline cannot be reconstructed.

## Validation

```sh
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
```

Vitest covers question grading, module readiness, progress isolation, weakness detection, session behavior, and persistence migration. Next.js stress tests enumerate distractors/critical misses, verify installed-version assumptions and coverage, and exercise readiness profiles A–G. Playwright covers module navigation/isolation, practical modes, reconstruction, review, readiness, and resume behavior.
