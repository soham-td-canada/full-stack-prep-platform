import type { Concept, Difficulty, Mode, Question, QuestionType, StructuredField } from "@/lib/model";

type FieldSpec = {
  id: string;
  label: string;
  options: string[];
  correct: string[];
  multiple?: boolean;
  tag?: string;
  critical?: boolean;
};

const field = (spec: FieldSpec): StructuredField => ({
  id: spec.id,
  label: spec.label,
  kind: "select",
  choices: spec.options.map((label) => ({ id: label, label })),
  correct: spec.correct,
  multiple: spec.multiple,
  misconceptionTag: spec.tag,
  severity: spec.critical ? "critical" : undefined,
});
const single = (label: string, options: string[], correct: string, tag?: string) =>
  field({ id: "answer", label, options, correct: [correct], tag });
const text = (id: string, label: string, ...accepted: string[]): StructuredField =>
  ({ id, label, kind: "text", accepted });
const exact = (id: string, label: string, ...accepted: string[]): StructuredField =>
  ({ id, label, kind: "text", accepted, exact: true });

function make(
  id: string,
  mode: Mode,
  type: QuestionType,
  concepts: Concept[],
  difficulty: Difficulty,
  prompt: string,
  fields: StructuredField[],
  explanation: string,
  code?: string,
  extra: Partial<Pick<Question, "depth" | "reviewLevel" | "reference">> = {},
): Question {
  return {
    id: `react-${id}`,
    module: "react",
    mode,
    concepts,
    difficulty,
    prompt,
    code,
    structured: { type, fields },
    depth: "core",
    ...extra,
    answer: fields.map((item) =>
      `${item.label}: ${item.kind === "text" ? item.accepted[0] : item.correct.join(", ")}`).join("\n"),
    explanation,
    misconception: { prompt: `Recall the mental model: ${prompt}`, answer: explanation },
  };
}

const yesNo = ["Yes", "No"];
const whyNot = ["It does not schedule an update", "It mutates the DOM directly", "It is reset each render"];
const priorities = ["MUST FIX", "SHOULD FIX", "MEASURE / OPTIONAL", "FINE AS-IS"];
const judgment = (id: string, label: string, correct: string, critical = false) =>
  field({ id, label, options: priorities, correct: [correct], tag: critical ? `review-${id}` : undefined, critical });

const prediction: Question[] = [
  make("p-state-same", "prediction", "prediction", ["reactRender"], "medium",
    "A handler sets a number state to its current value. Assuming Object.is equality, does React commit a visible update?",
    [single("Visible change", ["Yes", "No"], "No", "same-state")],
    "A same-value state update may be skipped; a setter call is not a promise of a DOM change.",
    "setOpen(open);"),
  make("p-state-batched", "prediction", "prediction", ["reactRender", "reactHooks"], "medium",
    "In one React event, the two functional updates run from an initial count of 4. What is the next count?",
    [exact("count", "Next count", "6")],
    "Functional updaters are queued and composed against the preceding queued state, so both increments apply.",
    "setCount(n => n + 1);\nsetCount(n => n + 1);"),
  make("p-parent-memo", "prediction", "prediction", ["reactRender", "reactPerformance"], "medium",
    "Parent state changes; a memoized child receives the same primitive props. Assuming no context/state changes, does its function execute?",
    [single("Child executes", yesNo, "No", "memo-bailout")],
    "React.memo can bail out when props compare equal and the child has no independent update. It is an optimization, not a correctness guarantee.",
    "const Child = memo(({ title }) => <h2>{title}</h2>);\n<Child title=\"Catalog\" />"),
  make("p-memo-unstable", "prediction", "prediction", ["reactPerformance", "reactRender"], "medium",
    "A memoized child receives a freshly created object prop on each parent render. Is the default props comparison equal?",
    [single("Default comparison", ["Equal", "Different"], "Different", "unstable-props")],
    "Distinct object references compare unequal with Object.is. Stabilize only when profiling or an identity-sensitive consumer justifies it.",
    "<MemoChild options={{ sort: \"name\" }} />"),
  make("p-child-local", "prediction", "prediction", ["reactRender", "reactState"], "easy",
    "A memoized child updates its own state while parent props stay stable. Can the child render?",
    [single("Child renders", yesNo, "Yes", "memo-fixes-all-performance")],
    "Memoization does not block the component's own state updates.",
    "const [expanded, setExpanded] = useState(false);"),
  make("p-context-memo", "prediction", "prediction", ["reactRender", "reactState", "reactPerformance"], "hard",
    "A memoized consumer reads a provider whose value changes from 1 to 2. Is the consumer eligible for a context-driven update?",
    [single("Context-driven update", yesNo, "Yes", "context-subscriber")],
    "A context subscriber updates when the provided value changes; React.memo does not block that subscription update.",
    "<Context.Provider value={version}><MemoBadge /></Context.Provider>"),
  make("p-context-same", "prediction", "prediction", ["reactState", "reactPerformance"], "medium",
    "Provider rerenders with the same primitive context value. Does that value alone notify consumers as changed?",
    [single("Value changed", yesNo, "No", "context-identity")],
    "Context compares the previous and next value with Object.is; equal primitive values are unchanged.",
    "<Theme.Provider value=\"dark\">{children}</Theme.Provider>"),
  make("p-ref", "prediction", "trueFalse", ["reactHooks", "reactRender"], "easy",
    "Changing ref.current schedules a render. Select the claim and the reason.",
    [field({ id: "truth", label: "Claim", options: ["True", "False"], correct: ["False"], tag: "ref-change-rerenders" }),
      field({ id: "reason", label: "Reason", options: whyNot, correct: ["It does not schedule an update"] })],
    "A ref is a mutable container. Changing it does not schedule state work; use state when the displayed UI must update.",
    "const latestId = useRef(0);\nlatestId.current += 1;"),
  make("p-derived", "prediction", "prediction", ["reactHooks", "reactEffects"], "easy",
    "A component renders from the current `items` and `query`. Which answer is the preferred source for `filtered`?",
    [single("Source", ["Compute during render", "Copy in an effect", "Store in a ref"], "Compute during render", "effect-for-derived-state")],
    "A value derivable from current props/state normally belongs in render, not duplicated state synchronized by an Effect."),
  make("p-render-dom", "prediction", "trueFalse", ["reactRender"], "medium",
    "A component function ran. Therefore React necessarily changed a DOM node. Select truth and correction.",
    [field({ id: "truth", label: "Claim", options: ["True", "False"], correct: ["False"], tag: "render-means-dom-update" }),
      field({ id: "reason", label: "Reason", options: ["Render computes a candidate tree; commit may have no host changes", "Every render replaces the DOM", "DOM changes happen during render"],
        correct: ["Render computes a candidate tree; commit may have no host changes"] })],
    "A render can produce the same output. React's commit phase applies necessary host changes; execution alone does not mean a DOM mutation."),
  make("p-props", "prediction", "prediction", ["reactRender"], "medium",
    "A child is not memoized. Its parent rerenders but its props are unchanged. Does it normally execute?",
    [single("Child executes", yesNo, "Yes", "parent-render-never-renders-child")],
    "A normal child is rendered as part of its parent's render, unless a bailout/optimization applies. Props do not independently schedule a component render.",
    "function Parent() { return <Child title=\"Fixed\" />; }"),
  make("p-key-type", "prediction", "prediction", ["reactIdentity", "reactForms"], "medium",
    "The same-position component changes from `<Editor />` to `<Preview />`. Is Editor's local state preserved in Preview?",
    [single("State", ["Preserved", "Reset; the element type changed"], "Reset; the element type changed", "identity-type")],
    "A different element type at a position represents a different identity, so the prior subtree is replaced and local state is not transferred."),
  make("p-key-stable", "prediction", "prediction", ["reactIdentity"], "medium",
    "A list is reordered but every item keeps its stable ID key. Which row identity should retain its local draft?",
    [single("Draft follows", ["Its logical item", "Its old array position"], "Its logical item", "index-key-always-safe")],
    "Stable item keys let reconciliation associate siblings with logical items across reordering."),
  make("p-effect-cleanup", "prediction", "ordering", ["reactEffects"], "hard",
    "On a committed dependency change, order the effect lifecycle: old cleanup, new setup, render.",
    ["1", "2", "3"].map((id, i) => field({ id, label: `Step ${id}`, options: ["Old cleanup", "Render/commit with new dependency", "New setup"],
      correct: [["Render/commit with new dependency", "Old cleanup", "New setup"][i]] })),
    "After the new render commits, React cleans up the previous effect before setting up the effect for the new dependency values."),
  make("p-effect-render", "prediction", "prediction", ["reactEffects", "reactHooks"], "medium",
    "An effect updates state that it reads, and that update changes the effect's dependency each time. What is the likely behavior?",
    [single("Behavior", ["Repeated effect/render cycle", "One render only", "No state update"], "Repeated effect/render cycle", "effect-infinite-loop")],
    "A state-setting effect can loop when its update continually changes one of its dependencies. Avoid redundant derived state or guard genuine synchronization."),
  make("p-listener", "prediction", "prediction", ["reactEffects"], "medium",
    "A window listener is registered by an effect and never removed. What remains after the component unmounts?",
    [single("Listener", ["It remains until explicitly removed or page teardown", "React always removes it", "It becomes a ref"], "It remains until explicitly removed or page teardown", "effect-missing-cleanup")],
    "Effects own subscriptions and external listeners; cleanup should remove the exact listener when dependencies change or the component unmounts."),
  make("p-func-update", "prediction", "prediction", ["reactEffects", "reactHooks"], "medium",
    "A long-lived interval increments state using `setCount(n => n + 1)`. Does it need to capture the latest `count` to increment correctly?",
    [single("Latest count capture", yesNo, "No", "empty-deps-means-fresh-values")],
    "The updater receives the pending prior state, so it avoids needing a captured count for this increment. Other callback values may still need fresh handling."),
  make("p-stale-callback", "prediction", "prediction", ["reactEffects", "reactHooks"], "hard",
    "A callback created on the initial render closes over `name = \"Ada\"`; later state is `Grace`. What does invoking that saved callback read?",
    [single("Captured name", ["Ada", "Grace"], "Ada", "stale-closure")],
    "A closure sees bindings from the render/lexical scope in which that function was created. Empty dependencies do not make those values fresh."),
  make("p-race-guard", "prediction", "prediction", ["reactEffects", "reactRecovery"], "hard",
    "Search A starts, then B starts; cleanup marks A obsolete. B resolves, then A resolves. Which result may update the UI?",
    [single("Allowed result", ["A only", "B only", "Either"], "B only", "request-race")],
    "A cleanup guard prevents a superseded request from publishing. Abort when useful, and still handle the active request's errors."),
  make("p-controlled", "prediction", "prediction", ["reactForms"], "easy",
    "An input has `value={email}` and an `onChange` setter. What kind of input is it?",
    [single("Input", ["Controlled", "Uncontrolled"], "Controlled")],
    "A controlled input's value comes from React state and its change handler updates that state."),
  make("p-uncontrolled", "prediction", "prediction", ["reactForms"], "easy",
    "An input uses `defaultValue=\"draft\"` and has no state-backed `value`. What kind of input is it?",
    [single("Input", ["Controlled", "Uncontrolled"], "Uncontrolled")],
    "defaultValue seeds the DOM value; without a controlled value prop, the DOM owns subsequent edits."),
  make("p-custom-hook", "prediction", "prediction", ["reactDesign", "reactState"], "medium",
    "Two components each call a custom hook that contains `useState(false)`. Does toggling one instance toggle the other?",
    [single("Other instance", ["Yes", "No"], "No", "custom-hook-shared-state")],
    "A custom hook reuses logic, not the state instance. Calls have separate state unless state is lifted/shared explicitly."),
  make("p-state-key", "prediction", "prediction", ["reactIdentity", "reactForms"], "hard",
    "A profile editor is keyed by user ID. Switching from user A to B occurs at the same position. Is A's local draft reused?",
    [single("Draft", ["Yes", "No; key change creates a new identity"], "No; key change creates a new identity", "key-state-reset")],
    "A changed key resets the keyed subtree's local state. This can be intentional for editor reset behavior."),
  make("p-context-split", "prediction", "prediction", ["reactState", "reactPerformance"], "medium",
    "A high-frequency pointer position and rarely changed theme share one Context object. Which subscribers see provider-value changes?",
    [single("Subscribers", ["All consumers of that context", "Only consumers reading the changed field"], "All consumers of that context", "context-broad-update")],
    "Context propagation is at the provider value level; consumers subscribing to that context may update even if they only use one property. Split ownership where warranted."),
  make("p-child-props", "prediction", "trueFalse", ["reactRender"], "medium",
    "A prop changes by itself and directly starts rendering a component that is otherwise not scheduled. Select truth and correction.",
    [field({ id: "truth", label: "Claim", options: ["True", "False"], correct: ["False"], tag: "props-change-independently-renders-component" }),
      field({ id: "reason", label: "Reason", options: ["Props are inputs during a scheduled render; parent/state/context scheduling drives work", "Props update outside React", "Only DOM changes schedule React"],
        correct: ["Props are inputs during a scheduled render; parent/state/context scheduling drives work"] })],
    "A prop change is observed when React renders that component, commonly because its parent rendered; props are not a separate setter/subscription mechanism."),
  make("p-batch-root", "prediction", "prediction", ["reactRender"], "medium",
    "Two state setters run in one React event and the final values are derived independently. What does batching primarily combine?",
    [single("Batching", ["Eligible updates into fewer render/commit passes", "All state into one variable", "All browser events forever"], "Eligible updates into fewer render/commit passes")],
    "Batching groups eligible updates to avoid intermediate work; state values remain distinct, and exact scheduling depends on React context/version."),
];

const reconstruction: Question[] = [
  make("r-xyz-closure", "reconstruction", "multiBlank", ["reactEffects", "reactHooks"], "easy",
    "A stale closure occurs when X captures values from Y and later executes using those older values.",
    [text("X", "X", "callback", "function", "closure"), text("Y", "Y", "an earlier render", "earlier render", "lexical scope", "earlier lexical scope")],
    "A function closes over bindings from its creation render/lexical scope; an async or long-lived callback may execute later with those old values."),
  make("r-xyz-query", "reconstruction", "multiBlank", ["reactState"], "medium",
    "X normally manages cached server data and revalidation; Y or local state usually owns transient UI state like a modal.",
    [text("X", "X", "TanStack Query", "query cache"), text("Y", "Y", "React state", "local state", "client state")],
    "TanStack Query models server state lifecycle; modal visibility is transient client/UI state. A client store is not a query cache."),
  make("r-xyz-effect", "reconstruction", "multiBlank", ["reactEffects"], "medium",
    "An Effect is for synchronizing with X, not deriving Y from current props/state during ordinary render.",
    [text("X", "X", "external systems", "external system", "subscriptions", "browser apis"),
      text("Y", "Y", "derived values", "derived state", "values")],
    "Effects synchronize with external systems after commits. Compute ordinary derivations from the latest inputs during render."),
  make("r-complete-ref", "reconstruction", "completeSentence", ["reactHooks", "reactRender"], "easy",
    "Complete: A ref keeps a mutable value between renders, but changing `.current` does not ____.",
    [text("missing", "Missing words", "schedule a render", "trigger a render", "schedule a state update", "cause a re-render")],
    "Mutating ref.current does not schedule React state work; use state for rendered data."),
  make("r-complete-memo", "reconstruction", "completeSentence", ["reactHooks", "reactPerformance"], "medium",
    "Complete: `useMemo` caches a calculated value; it does not automatically ____.",
    [text("missing", "Missing words", "prevent component renders", "stop component renders", "prevent re-rendering")],
    "useMemo returns a cached calculation result for dependency-equal renders; it does not skip rendering the component."),
  make("r-complete-callback", "reconstruction", "completeSentence", ["reactHooks", "reactPerformance"], "medium",
    "Complete: `useCallback` is useful when stable function identity matters, but it does not guarantee ____.",
    [text("missing", "Missing words", "the child never renders", "that a child never renders", "prevent all renders", "faster performance")],
    "A stable callback can support a memoized child or dependency, but does not prevent renders from other causes or remove memoization cost."),
  make("r-missing-reconcile", "reconstruction", "conceptInference", ["reactIdentity"], "easy",
    "Given: React compares prior and next element descriptions; keys help associate sibling identity. Identify Concept A.",
    [text("A", "Concept A", "reconciliation", "react reconciliation")],
    "Reconciliation determines how React can update the rendered tree, using type, position, and keys to preserve or replace identity."),
  make("r-missing-suspense", "reconstruction", "conceptInference", ["reactRecovery"], "medium",
    "Given: a supported child suspends while work/data is unavailable; a nearby fallback is shown. Identify Concept A.",
    [text("A", "Concept A", "suspense", "suspense boundary")],
    "Suspense displays a fallback for supported suspending work. Ordinary fetches started in effects do not automatically suspend."),
  make("r-missing-error-boundary", "reconstruction", "conceptInference", ["reactRecovery"], "medium",
    "Given: a component catches descendant render failures and replaces the failed subtree with fallback UI. Identify Concept A.",
    [text("A", "Concept A", "error boundary", "error boundaries")],
    "Error Boundaries isolate certain descendant rendering/lifecycle errors; they are not a universal catch for event or async errors."),
  make("r-reason-ref", "reconstruction", "reasonInference", ["reactHooks", "reactRender"], "medium",
    "Concept: changing `ref.current` normally does not rerender. Given: refs are mutable containers. What is the missing reason?",
    [text("reason", "Missing reason", "mutation does not schedule a state update", "it does not schedule rendering", "ref mutation does not schedule an update")],
    "Unlike a state setter, ref mutation does not enqueue a React update."),
  make("r-reason-index", "reconstruction", "reasonInference", ["reactIdentity"], "medium",
    "Concept: index keys can misplace row state after reordering. Given: keys associate existing instances with logical siblings. What is the missing reason?",
    [text("reason", "Missing reason", "the index may now refer to a different logical item", "an index can identify a different item after reorder", "position changes")],
    "An item shifting position can inherit the component state associated with the previous occupant of that index."),
  make("r-reason-effect", "reconstruction", "reasonInference", ["reactEffects"], "hard",
    "Concept: omitting a reactive value from dependencies can leave an effect stale. Given: the effect closure was created by a render. What is the reason?",
    [text("reason", "Missing reason", "the effect keeps using values captured by an earlier render", "the closure retains old values", "its closure is stale")],
    "An effect setup closes over the render's values. If those values change but the effect does not resynchronize, callbacks can use stale data."),
  make("r-ab", "reconstruction", "conceptInference", ["reactIdentity", "reactRender"], "medium",
    "A = render/reconciliation computes the next result. B = commit applies necessary host changes. Identify C: which phase may be interrupted/restarted at a high level?",
    [text("C", "Concept C", "render phase", "render", "reconciliation phase")],
    "Rendering work may be prioritized and interrupted before commit. Commit applies the finished host updates."),
  make("r-match-stores", "reconstruction", "matching", ["reactState", "reactDesign"], "medium",
    "Match each state example with a suitable default owner; choose every row.",
    [field({ id: "local", label: "Modal visibility and a local filter input", options: ["LOCAL STATE", "CONTEXT", "REDUX / ZUSTAND", "TANSTACK QUERY"], correct: ["LOCAL STATE"] }),
      field({ id: "context", label: "Shared low-frequency theme setting", options: ["LOCAL STATE", "CONTEXT", "REDUX / ZUSTAND", "TANSTACK QUERY"], correct: ["CONTEXT"] }),
      field({ id: "store", label: "Complex cross-route client workflow with undoable transitions", options: ["LOCAL STATE", "CONTEXT", "REDUX / ZUSTAND", "TANSTACK QUERY"], correct: ["REDUX / ZUSTAND"] }),
      field({ id: "server", label: "Fetched products with cache, refetch and invalidation", options: ["LOCAL STATE", "CONTEXT", "REDUX / ZUSTAND", "TANSTACK QUERY"], correct: ["TANSTACK QUERY"] })],
    "Choose ownership by lifecycle and sharing: local transient UI, Context for appropriate shared values, Redux/Zustand for complex shared client state, query cache for server state."),
  make("r-match-recovery", "reconstruction", "matching", ["reactRecovery"], "medium",
    "Match each situation to the most direct recovery mechanism.",
    [field({ id: "render", label: "Descendant render throws", options: ["Error Boundary", "Suspense fallback", "Explicit async error UI", "Retry action"], correct: ["Error Boundary"] }),
      field({ id: "pending", label: "Lazy component is pending", options: ["Error Boundary", "Suspense fallback", "Explicit async error UI", "Retry action"], correct: ["Suspense fallback"] }),
      field({ id: "fetch", label: "Effect-based request rejects", options: ["Error Boundary", "Suspense fallback", "Explicit async error UI", "Retry action"], correct: ["Explicit async error UI"] }),
      field({ id: "retry", label: "Transient request failure after showing an error", options: ["Error Boundary", "Suspense fallback", "Explicit async error UI", "Retry action"], correct: ["Retry action"] })],
    "Error boundaries, Suspense, explicit request error states, and retry actions address distinct failure/loading paths."),
  make("r-categorize-state", "reconstruction", "categorization", ["reactState", "reactForms"], "medium",
    "Place each item in its simplest sensible category. Do not treat all shared data as a query.",
    [field({ id: "tab", label: "Current tab in one settings panel", options: ["LOCAL STATE", "CONTEXT", "REDUX / ZUSTAND", "TANSTACK QUERY"], correct: ["LOCAL STATE"] }),
      field({ id: "auth", label: "Shared, slowly changing display name and locale", options: ["LOCAL STATE", "CONTEXT", "REDUX / ZUSTAND", "TANSTACK QUERY"], correct: ["CONTEXT"] }),
      field({ id: "cart", label: "Cart draft shared across routes with optimistic client transitions", options: ["LOCAL STATE", "CONTEXT", "REDUX / ZUSTAND", "TANSTACK QUERY"], correct: ["REDUX / ZUSTAND"] }),
      field({ id: "cart-server", label: "Persisted cart returned by the API with invalidation after mutation", options: ["LOCAL STATE", "CONTEXT", "REDUX / ZUSTAND", "TANSTACK QUERY"], correct: ["TANSTACK QUERY"], tag: "context-is-server-cache" }),
      field({ id: "query-ui", label: "Search text before submitting a request", options: ["LOCAL STATE", "CONTEXT", "REDUX / ZUSTAND", "TANSTACK QUERY"], correct: ["LOCAL STATE"], tag: "tanstack-query-for-ui-state" })],
    "Server state and client workflow may coexist: the API snapshot belongs in query cache while an unsaved cross-page draft may be client state. Search text and tabs are usually local."),
  make("r-order-render", "reconstruction", "ordering", ["reactIdentity", "reactRender"], "medium",
    "Order a successful update from scheduled work to DOM changes.",
    ["1", "2", "3"].map((id, index) => field({ id, label: `Step ${id}`, options: ["Commit necessary host changes", "State update is scheduled", "Render/reconciliation computes next result"],
      correct: [["State update is scheduled", "Render/reconciliation computes next result", "Commit necessary host changes"][index]] })),
    "React schedules work, renders/reconciles a candidate result, then commits necessary host changes. A render may result in no DOM change."),
  make("r-order-effect", "reconstruction", "ordering", ["reactEffects"], "hard",
    "A dependency changes. Order the relevant phases (ignore browser paint timing details).",
    ["1", "2", "3"].map((id, index) => field({ id, label: `Step ${id}`, options: ["New setup runs", "New render commits", "Previous cleanup runs"],
      correct: [["New render commits", "Previous cleanup runs", "New setup runs"][index]] })),
    "After a commit with changed dependencies, React cleans up the previous effect before setting up the next one."),
  make("r-tf-fiber", "reconstruction", "trueFalse", ["reactIdentity"], "medium",
    "Fiber is the Virtual DOM itself. Select truth and correction.",
    [field({ id: "truth", label: "Claim", options: ["True", "False"], correct: ["False"], tag: "fiber-equals-virtual-dom" }),
      field({ id: "correction", label: "Correction", options: ["Fiber is internal unit-of-work architecture", "Fiber is the browser DOM", "Fiber is a hook"],
        correct: ["Fiber is internal unit-of-work architecture"] })],
    "The element tree is a description of UI; Fiber is React's internal work architecture used to organize rendering."),
  make("r-tf-boundary", "reconstruction", "trueFalse", ["reactRecovery"], "medium",
    "An Error Boundary catches rejected requests from an event handler because it is above the form. Select truth and correction.",
    [field({ id: "truth", label: "Claim", options: ["True", "False"], correct: ["False"], tag: "error-boundary-catches-everything" }),
      field({ id: "correction", label: "Correction", options: ["Handle async/event failures in the handler or request state", "Add another Error Boundary around the button", "Suspense retries all failures"],
        correct: ["Handle async/event failures in the handler or request state"] })],
    "Boundaries do not generally catch event-handler errors or arbitrary asynchronous rejections. Handle those paths explicitly."),
  make("r-best-context", "reconstruction", "bestExplanation", ["reactState", "reactPerformance"], "medium",
    "When can Context be a poor fit for a frequently changing, broad application state object?",
    [single("Best explanation", ["Every field consumer is always isolated", "Changing provider identity can update all subscribers, so partition/choose ownership based on measured needs", "Context is server cache", "Memoized consumers never update"], "Changing provider identity can update all subscribers, so partition/choose ownership based on measured needs", "context-is-server-cache")],
    "Context is a propagation mechanism, not a server cache or selector store by default. Broad high-frequency values may cause wide updates; split state where useful and measure."),
  make("r-best-effect", "reconstruction", "bestExplanation", ["reactEffects", "reactHooks"], "medium",
    "A total can be computed from `items` each render. Why is an Effect that copies it into state usually weaker?",
    [single("Best explanation", ["It adds a synchronization render and risks stale/duplicated state; derive it directly", "Effects cannot read props", "Every derived value must use useMemo", "State never updates"], "It adds a synchronization render and risks stale/duplicated state; derive it directly", "effect-for-derived-state")],
    "Derivation during render uses current inputs without extra state and an additional update cycle. Memoize only if cost is measured and material."),
  make("r-best-memo", "reconstruction", "bestExplanation", ["reactPerformance", "reactHooks"], "medium",
    "A filter takes 0.02 ms and has no identity-sensitive consumer. What is the best action?",
    [single("Best action", ["Keep it simple", "Always use useMemo", "Wrap the component in React.memo", "Move it to global state"], "Keep it simple", "usememo-always-faster")],
    "Memoization adds dependency and maintenance cost. A trivial calculation without a measured issue is fine as-is."),
  make("r-best-callback", "reconstruction", "bestExplanation", ["reactPerformance", "reactHooks"], "hard",
    "Why is `useCallback` not automatically useful?",
    [single("Best explanation", ["Memoization has a cost and mainly helps when stable identity matters", "React ignores memoized callbacks", "Functions cannot be memoized", "It only works for event handlers"],
      "Memoization has a cost and mainly helps when stable identity matters", "usecallback-prevents-render")],
    "A callback cache can support a memoized child or a dependency that should stay stable, but applying it everywhere adds complexity and does not stop all renders."),
  make("r-best-boundaries", "reconstruction", "bestExplanation", ["reactRecovery"], "hard",
    "A user-triggered save rejects. What is the best error strategy?",
    [single("Best strategy", ["Catch/report it in the submit flow and expose retryable form error UI", "Rely on the nearest Error Boundary", "Wrap JSX in Suspense", "Ignore it if loading ends"],
      "Catch/report it in the submit flow and expose retryable form error UI", "error-boundary-catches-everything")],
    "An async event error should be handled in its event/request flow; a boundary is not a catch-all."),
  make("r-best-key", "reconstruction", "bestExplanation", ["reactIdentity"], "medium",
    "When is an index key acceptable?",
    [single("Best explanation", ["Never; indexes are forbidden", "For a static, non-reordered list with no insertion/removal identity concerns", "Whenever rows have state", "When list order changes often"],
      "For a static, non-reordered list with no insertion/removal identity concerns", "index-key-always-safe")],
    "Stable logical IDs are preferred, especially for reorderable/stateful lists. Index keys can be acceptable when ordering and membership are fixed."),
  make("r-composition", "reconstruction", "bestExplanation", ["reactDesign"], "medium",
    "Three screens share a heading and footer but have different content. What is a good starting abstraction?",
    [single("API", ["A layout component with children/slots and explicit shared props", "One component with 18 boolean flags", "A global store for child content", "Custom hook around all JSX"],
      "A layout component with children/slots and explicit shared props")],
    "Composition lets callers supply varying content without boolean prop explosion. Keep it simple until a genuine reuse boundary appears."),
  make("r-custom-hook", "reconstruction", "bestExplanation", ["reactDesign", "reactHooks"], "medium",
    "Two screens duplicate subscription setup/cleanup. What should a custom hook share?",
    [single("Best extraction", ["Reusable stateful subscription logic", "A single state instance automatically shared by all hook callers", "Every component's JSX", "A hook created only to reduce line count"],
      "Reusable stateful subscription logic")],
    "Custom hooks share logic; each hook call has independent state unless a shared owner/context/store is used. Extract for a coherent reusable concern."),
  make("r-error-layers", "reconstruction", "matching", ["reactRecovery"], "hard",
    "Match the recovery tool to the failure mode.",
    [field({ id: "chunk", label: "Lazy-loaded chunk fails to load", options: ["Error Boundary + retry/reload policy", "Suspense fallback only", "Empty state", "Local input validation"], correct: ["Error Boundary + retry/reload policy"] }),
      field({ id: "optional", label: "Nonessential recommendation panel request fails", options: ["Error Boundary + retry/reload policy", "Suspense fallback only", "Panel-level error with retry or omission", "Local input validation"], correct: ["Panel-level error with retry or omission"] }),
      field({ id: "required", label: "Main data request is pending", options: ["Error Boundary + retry/reload policy", "Suspense fallback only", "Loading state", "Local input validation"], correct: ["Loading state"] }),
      field({ id: "invalid", label: "Email field fails client validation", options: ["Error Boundary + retry/reload policy", "Suspense fallback only", "Loading state", "Field-level validation error"], correct: ["Field-level validation error"] })],
    "Choose a boundary matching the failure: pending, rendering exception, request rejection, and invalid input need distinct UX."),
  make("r-ref-vs-state", "reconstruction", "categorization", ["reactHooks"], "easy",
    "Choose the hook for each use case.",
    [field({ id: "display", label: "Displayed selected tab", options: ["useState", "useRef", "useMemo", "useEffect"], correct: ["useState"] }),
      field({ id: "timer", label: "Timer ID used only for cleanup", options: ["useState", "useRef", "useMemo", "useEffect"], correct: ["useRef"] }),
      field({ id: "derived", label: "Expensive measured derived calculation", options: ["useState", "useRef", "useMemo", "useEffect"], correct: ["useMemo"] }),
      field({ id: "socket", label: "Connect/disconnect a socket when endpoint changes", options: ["useState", "useRef", "useMemo", "useEffect"], correct: ["useEffect"] })],
    "Use state for rendered state, refs for mutable non-render values, useMemo for a genuinely valuable calculation, and effects for external synchronization."),
  make("r-effect-usecase", "reconstruction", "categorization", ["reactEffects"], "medium",
    "Classify each operation as EFFECT or RENDER/HANDLER.",
    [field({ id: "derive", label: "Filter current props for the visible list", options: ["EFFECT", "RENDER / HANDLER"], correct: ["RENDER / HANDLER"], tag: "effect-for-derived-state" }),
      field({ id: "subscribe", label: "Subscribe to a browser event and unsubscribe", options: ["EFFECT", "RENDER / HANDLER"], correct: ["EFFECT"] }),
      field({ id: "submit", label: "Send a request after the user presses Save", options: ["EFFECT", "RENDER / HANDLER"], correct: ["RENDER / HANDLER"] }),
      field({ id: "document", label: "Synchronize document title with committed screen state", options: ["EFFECT", "RENDER / HANDLER"], correct: ["EFFECT"] })],
    "Effects are for synchronization caused by rendering; event-specific actions belong in handlers, and render-time derived values should stay derived."),
];

const debugging: Question[] = [
  make("d-stale-interval", "debug", "debug", ["reactEffects", "reactHooks"], "medium",
    "An interval stays at 1 and survives unmount. Select root cause, smallest fix and severity.",
    [field({ id: "cause", label: "Root cause", options: ["Captured initial count and no cleanup", "useRef is missing", "React batches intervals"],
      correct: ["Captured initial count and no cleanup"], tag: "stale-closure", critical: true }),
      field({ id: "fix", label: "Best fix", options: ["Use functional update and clear interval in cleanup", "Add count to deps without clearing interval", "Memoize setCount"],
        correct: ["Use functional update and clear interval in cleanup"] }),
      field({ id: "severity", label: "Severity", options: ["MUST FIX", "SHOULD FIX", "MEASURE / OPTIONAL", "FINE AS-IS"], correct: ["MUST FIX"] })],
    "The callback uses its initial render value; the external timer also outlives the component. Use a functional updater and return clearInterval.",
    "useEffect(() => {\n  const id = setInterval(() => setCount(count + 1), 1000);\n}, []);"),
  make("d-deps", "debug", "debug", ["reactEffects"], "medium",
    "A subscription callback displays the first `roomId` forever. Select cause and fix.",
    [field({ id: "cause", label: "Cause", options: ["Effect omits a changing external subscription value", "React.memo cached roomId", "useRef changes do not render"],
      correct: ["Effect omits a changing external subscription value"], tag: "missing-dependency", critical: true }),
      field({ id: "fix", label: "Fix", options: ["Include roomId and clean up/resubscribe", "Use an empty dependency list", "Disable all lint rules"],
        correct: ["Include roomId and clean up/resubscribe"] })],
    "The effect must resynchronize when the subscribed room changes and remove the old subscription."),
  make("d-wrong-deps", "debug", "debug", ["reactEffects", "reactPerformance"], "medium",
    "An effect reruns every render even when settings look unchanged. `settings` is rebuilt as an object in render. Cause and best fix?",
    [field({ id: "cause", label: "Cause", options: ["A new object dependency identity each render", "React compares object contents deeply", "Effect cleanup is missing"],
      correct: ["A new object dependency identity each render"], tag: "unstable-props" }),
      field({ id: "fix", label: "Best fix", options: ["Depend on the primitive fields or move object creation into the effect", "Use an empty dependency array", "Call setState during render"],
        correct: ["Depend on the primitive fields or move object creation into the effect"] })],
    "Dependencies use identity comparison. Prefer expressing the true reactive values instead of suppressing dependencies or blindly memoizing."),
  make("d-race", "debug", "debug", ["reactEffects", "reactRecovery"], "hard",
    "An old profile response overwrites the newest user after a fast account switch. Cause and robust fix?",
    [field({ id: "cause", label: "Cause", options: ["An obsolete request still publishes after the newer request", "State setters run out of order synchronously", "AbortController makes every response stale"],
      correct: ["An obsolete request still publishes after the newer request"], tag: "request-race", critical: true }),
      field({ id: "fix", label: "Best fix", options: ["Abort or ignore obsolete requests during cleanup", "Use React.memo on the form", "Use a ref without guarding the result"],
        correct: ["Abort or ignore obsolete requests during cleanup"] })],
    "Completion order may differ from request order. Tie publication to the active request with AbortController or a cleanup ignore guard."),
  make("d-async-cleanup", "debug", "debug", ["reactEffects"], "medium",
    "A delayed callback updates an unmounted panel. What is the missing lifecycle behavior?",
    [field({ id: "problem", label: "Problem", options: ["Timer/subscription has no cleanup", "State must be in Context", "The callback needs useMemo"],
      correct: ["Timer/subscription has no cleanup"], tag: "effect-missing-cleanup", critical: true }),
      field({ id: "fix", label: "Fix", options: ["Clear the timer or cancel/ignore its result on cleanup", "Keep a global timeout", "Suppress the warning"],
        correct: ["Clear the timer or cancel/ignore its result on cleanup"] })],
    "Cleanup external timers/subscriptions and prevent obsolete asynchronous work from publishing."),
  make("d-derived", "debug", "debug", ["reactEffects", "reactHooks"], "medium",
    "A filtered list flashes old items after typing, then updates in a second render. Select cause and fix.",
    [field({ id: "cause", label: "Cause", options: ["Derived filtered state is synchronized later in an Effect", "Controlled input is impossible", "Keys trigger effects"],
      correct: ["Derived filtered state is synchronized later in an Effect"], tag: "effect-for-derived-state", critical: true }),
      field({ id: "fix", label: "Fix", options: ["Compute filtered items from current props/state during render", "Add another loading state", "Copy the value into a ref"],
        correct: ["Compute filtered items from current props/state during render"] })],
    "The second state duplicates a derivation and creates a stale intermediate render. Derive directly; useMemo only if measured."),
  make("d-loop", "debug", "debug", ["reactEffects", "reactPerformance"], "hard",
    "Effect sets `result` to a new array each time and depends on `result`. Pick cause/fix/severity.",
    [field({ id: "cause", label: "Cause", options: ["Effect update changes its own dependency identity", "React ignores arrays", "A missing key causes infinite state"],
      correct: ["Effect update changes its own dependency identity"], tag: "effect-infinite-loop", critical: true }),
      field({ id: "fix", label: "Fix", options: ["Remove derived result state and compute from inputs", "Add result to the dependency list twice", "Wrap setter in useCallback"],
        correct: ["Remove derived result state and compute from inputs"] }),
      field({ id: "severity", label: "Severity", options: ["MUST FIX", "SHOULD FIX", "MEASURE / OPTIONAL", "FINE AS-IS"], correct: ["MUST FIX"] })],
    "The effect creates a fresh array, updates state and immediately invalidates its dependency. Eliminate the redundant effect/state."),
  make("d-functional", "debug", "debug", ["reactHooks", "reactEffects"], "medium",
    "A batched handler calls `setN(n + 1)` three times but increments once. Choose cause and fix.",
    [field({ id: "cause", label: "Cause", options: ["Each replacement reads the same render snapshot", "Batching drops updates", "State setters are asynchronous promises"],
      correct: ["Each replacement reads the same render snapshot"], tag: "functional-update" }),
      field({ id: "fix", label: "Fix", options: ["Use setN(value => value + 1) for each dependent update", "Disable batching", "Use a ref as visible state"],
        correct: ["Use setN(value => value + 1) for each dependent update"] })],
    "Updater functions compose against pending state; repeated replacement values based on the same captured `n` do not compose."),
  make("d-state-mutation", "debug", "debug", ["reactState", "reactRender"], "medium",
    "A row edit mutates `items[0].name` then calls `setItems(items)`, and UI stays stale. Choose cause and fix.",
    [field({ id: "cause", label: "Cause", options: ["Mutated existing state and reused the same reference", "React always ignores strings", "The input must be uncontrolled"],
      correct: ["Mutated existing state and reused the same reference"], tag: "state-mutation", critical: true }),
      field({ id: "fix", label: "Fix", options: ["Create a new array and changed item object", "Call the setter with the same array twice", "Move items to a ref"],
        correct: ["Create a new array and changed item object"] })],
    "State should be treated immutably; a new reference signals the changed collection and avoids shared mutations."),
  make("d-keys", "debug", "debug", ["reactIdentity", "reactForms"], "medium",
    "After sorting rows, an unsaved text draft appears under another product. Select cause and fix.",
    [field({ id: "cause", label: "Cause", options: ["Index keys associate local state with positions", "Stable IDs reset state", "React.memo changed order"],
      correct: ["Index keys associate local state with positions"], tag: "index-key-always-safe", critical: true }),
      field({ id: "fix", label: "Fix", options: ["Use stable product IDs as keys", "Remove all keys", "Store each draft in a global cache"],
        correct: ["Use stable product IDs as keys"] })],
    "With reorderable stateful rows, indices may now represent different logical items. Key by stable item identity."),
  make("d-controlled", "debug", "debug", ["reactForms"], "medium",
    "An input begins with undefined `value`, then fetch sets a string and logs controlled/uncontrolled warnings. Cause and fix?",
    [field({ id: "cause", label: "Cause", options: ["The input changes from uncontrolled to controlled", "A label is missing", "onChange cannot update state"],
      correct: ["The input changes from uncontrolled to controlled"], tag: "controlled-transition", critical: true }),
      field({ id: "fix", label: "Fix", options: ["Initialize to an empty string or render until a defined value is available", "Use useMemo for the input", "Remove onChange"],
        correct: ["Initialize to an empty string or render until a defined value is available"] })],
    "A controlled text input should consistently receive a defined string value and matching onChange handler."),
  make("d-form-submit", "debug", "debug", ["reactForms", "reactRecovery"], "medium",
    "Submitting a form refreshes the page and rejected saves leave a spinner forever. Choose the root fix.",
    [field({ id: "cause", label: "Cause", options: ["Default submit not prevented and rejection has no finally/error path", "React batches the form", "The form must use Context"],
      correct: ["Default submit not prevented and rejection has no finally/error path"], tag: "form-error", critical: true }),
      field({ id: "fix", label: "Fix", options: ["Prevent default; validate; catch/display errors; clear pending in finally", "Add an Error Boundary only", "Use a ref for every field"],
        correct: ["Prevent default; validate; catch/display errors; clear pending in finally"] })],
    "Handle the native submit event and asynchronous lifecycle. Error Boundaries do not catch a rejected async submit handler."),
  make("d-memo", "debug", "debug", ["reactPerformance", "reactHooks"], "medium",
    "A developer wraps a 0.01 ms calculation in useMemo everywhere. Profiler shows no issue. Select problem and action.",
    [field({ id: "problem", label: "Problem", options: ["Unnecessary memoization adds complexity/cost without evidence", "useMemo never caches", "Calculations cannot run during render"],
      correct: ["Unnecessary memoization adds complexity/cost without evidence"], tag: "usememo-always-faster" }),
      field({ id: "action", label: "Action", options: ["Keep it simple; remove the cache", "Memoize all siblings too", "Move the value into Redux"],
        correct: ["Keep it simple; remove the cache"] })],
    "Memoization is not automatically faster. Remove speculative caches and profile real costs."),
  make("d-memo-props", "debug", "debug", ["reactPerformance"], "hard",
    "React.memo child rerenders each parent update because caller passes a new options object and callback. Pick fix and what to measure.",
    [field({ id: "cause", label: "Cause", options: ["Object/function props have new identities", "React.memo ignores props", "The child must use Context"],
      correct: ["Object/function props have new identities"], tag: "unstable-props" }),
      field({ id: "fix", label: "Fix", options: ["Profile first; stabilize only identity-sensitive props or move state boundary", "Wrap all functions unconditionally", "Deep clone props"],
        correct: ["Profile first; stabilize only identity-sensitive props or move state boundary"] })],
    "Fresh reference props defeat shallow memo comparison. Confirm costly work first; then fix the specific boundary/identity problem."),
  make("d-context", "debug", "debug", ["reactState", "reactPerformance"], "medium",
    "Typing into a provider updates dozens of unrelated consumers. Choose the primary cause and design correction.",
    [field({ id: "cause", label: "Cause", options: ["High-frequency state shares a broad provider value", "Context caches server responses", "Consumers cannot rerender"],
      correct: ["High-frequency state shares a broad provider value"], tag: "context-broad-update" }),
      field({ id: "fix", label: "Fix", options: ["Move state closer or split provider based on measured ownership", "Wrap all consumers in memo", "Put input value in TanStack Query"],
        correct: ["Move state closer or split provider based on measured ownership"] })],
    "Context changes can reach all subscribers. Narrow state ownership or split values when the actual update path warrants it."),
  make("d-query-ui", "debug", "debug", ["reactState", "reactDesign"], "medium",
    "A modal's open boolean is stored in the product query cache. Choose the misclassification and smallest refactor.",
    [field({ id: "problem", label: "Problem", options: ["Transient UI state is being treated as server state", "TanStack Query cannot cache data", "Modals require Redux"],
      correct: ["Transient UI state is being treated as server state"], tag: "tanstack-query-for-ui-state", critical: true }),
      field({ id: "fix", label: "Fix", options: ["Keep modal visibility in local React state", "Move modal to the products endpoint", "Use another query key"],
        correct: ["Keep modal visibility in local React state"] })],
    "TanStack Query manages remote/server state lifecycle, not general UI state such as modal visibility."),
  make("d-server-redux", "debug", "debug", ["reactState", "reactDesign"], "hard",
    "A feature duplicates API data, loading, error and retry flags in Redux despite a query cache. Choose a cause and fix.",
    [field({ id: "cause", label: "Cause", options: ["Two sources of truth for server state lifecycle", "Redux cannot store arrays", "Context is mandatory"],
      correct: ["Two sources of truth for server state lifecycle"], tag: "server-state-duplicate", critical: true }),
      field({ id: "fix", label: "Fix", options: ["Let query cache own remote lifecycle; keep only genuinely shared client workflow in the store", "Copy every query result into Redux", "Use local state for all network cache"],
        correct: ["Let query cache own remote lifecycle; keep only genuinely shared client workflow in the store"] })],
    "Avoid duplicating query cache lifecycle in a second global store; keep distinct client workflow state only when needed."),
  make("d-error-boundary", "debug", "debug", ["reactRecovery"], "hard",
    "A failed `onClick` async save bypasses an Error Boundary. Select correct diagnosis and fix.",
    [field({ id: "cause", label: "Cause", options: ["Boundaries do not catch event-handler async rejections", "Boundary must be a function component", "Suspense catches all exceptions"],
      correct: ["Boundaries do not catch event-handler async rejections"], tag: "error-boundary-catches-everything", critical: true }),
      field({ id: "fix", label: "Fix", options: ["Catch in the handler and expose failure/retry UI", "Add a second boundary around the button", "Return a Suspense promise"],
        correct: ["Catch in the handler and expose failure/retry UI"] })],
    "Handle asynchronous event errors at the source. Use boundaries for supported descendant render errors."),
  make("d-suspense", "debug", "debug", ["reactRecovery"], "medium",
    "A Suspense boundary never shows while data is fetched inside a normal useEffect. Choose diagnosis and best response.",
    [field({ id: "cause", label: "Cause", options: ["An effect fetch does not automatically suspend", "Suspense requires a spinner", "Error Boundary intercepts loading"],
      correct: ["An effect fetch does not automatically suspend"], tag: "suspense-is-just-spinner" }),
      field({ id: "fix", label: "Fix", options: ["Use explicit pending state or a Suspense-enabled data source", "Add more nested Suspense boundaries around the same effect", "Throw an arbitrary rejected promise"],
        correct: ["Use explicit pending state or a Suspense-enabled data source"] })],
    "Suspense supports specific suspending resources, such as lazy loading or compatible data sources. Ordinary effect fetching needs its own loading/error state."),
  make("d-loading", "debug", "debug", ["reactRecovery"], "medium",
    "A page renders blank while required data is pending; errors also produce an empty list that looks successful. What is missing?",
    [field({ id: "missing", label: "Missing behavior", options: ["Distinct loading, error and empty states", "React.memo", "Global state"],
      correct: ["Distinct loading, error and empty states"], tag: "recovery-states", critical: true }),
      field({ id: "fix", label: "Fix", options: ["Represent request lifecycle explicitly and provide retry where appropriate", "Show an empty list for every state", "Wrap fetch in a render callback"],
        correct: ["Represent request lifecycle explicitly and provide retry where appropriate"] })],
    "Pending, failed, and successful-empty are different states; distinguish them and preserve useful surrounding UI."),
  make("d-accessible", "debug", "debug", ["reactForms", "reactReview"], "medium",
    "A clickable `<div>` has no keyboard behavior and form fields have no labels. Choose severity and fixes.",
    [field({ id: "cause", label: "Problem", options: ["Controls are not operable/identifiable accessibly", "CSS is not memoized", "React needs a ref"],
      correct: ["Controls are not operable/identifiable accessibly"], tag: "accessibility-controls", critical: true }),
      field({ id: "fix", label: "Fix", options: ["Use a button and associate labels with inputs", "Add onClick to every parent", "Use placeholder text as the only label"],
        correct: ["Use a button and associate labels with inputs"] }),
      field({ id: "severity", label: "Severity", options: ["MUST FIX", "SHOULD FIX", "MEASURE / OPTIONAL", "FINE AS-IS"], correct: ["MUST FIX"] })],
    "Use semantic interactive controls with keyboard behavior and programmatically associated labels."),
  make("d-retry", "debug", "debug", ["reactRecovery"], "medium",
    "A request error is shown, but Retry repeats with the same rejected promise and stale error text remains after success. Select cause/fix.",
    [field({ id: "cause", label: "Cause", options: ["Retry does not start fresh work and success never clears the prior error", "Error Boundaries cannot render strings", "The loading flag is controlled"],
      correct: ["Retry does not start fresh work and success never clears the prior error"], tag: "retry-recovery", critical: true }),
      field({ id: "fix", label: "Fix", options: ["Trigger a new request and reset error/pending state through the lifecycle", "Memoize the error", "Hide all errors after one render"],
        correct: ["Trigger a new request and reset error/pending state through the lifecycle"] })],
    "A useful retry actually starts work; clear or replace stale error state on retry/success and surface subsequent failures."),
  make("d-duplicate-submit", "debug", "debug", ["reactForms", "reactRecovery"], "medium",
    "Double-clicking Save creates duplicate mutations. Choose prevention and user feedback.",
    [field({ id: "cause", label: "Cause", options: ["Submission remains enabled while a mutation is pending", "Controlled fields prevent submit", "React.memo reruns the handler"],
      correct: ["Submission remains enabled while a mutation is pending"], tag: "duplicate-submit" }),
      field({ id: "fix", label: "Fix", options: ["Guard pending state, disable/reject duplicates, and show status", "Use a key on the button", "Move pending state to a ref only"],
        correct: ["Guard pending state, disable/reject duplicates, and show status"] })],
    "Prevent duplicate submissions in the handler and UI while pending; reflect progress and failure accessibly."),
  make("d-abort-vs-ignore", "debug", "debug", ["reactEffects", "reactRecovery"], "hard",
    "An endpoint supports AbortSignal, but a response may already have resolved when cleanup runs. Which strategy is robust?",
    [field({ id: "cause", label: "Risk", options: ["A completed/late result may still publish after the request is obsolete", "Abort always rewinds a state update", "Cleanup prevents new renders"],
      correct: ["A completed/late result may still publish after the request is obsolete"], tag: "request-race", critical: true }),
      field({ id: "fix", label: "Best approach", options: ["Abort work and guard publication against obsolete results", "Use only a loading boolean", "Remove endpoint dependency"],
        correct: ["Abort work and guard publication against obsolete results"] })],
    "AbortController can cancel in-flight work, while an active/ignore guard ensures obsolete completions cannot publish. Always handle the active request's error and pending state."),
  make("d-deps-derived-loop", "debug", "debug", ["reactEffects", "reactHooks"], "hard",
    "An effect depends on `filtered`, sets it to `items.filter(...)`, and `items` is stable. Why can it still loop, and what is simplest?",
    [field({ id: "cause", label: "Cause", options: ["Every filter creates a new array reference and updates a dependency", "React compares array contents deeply", "State updates never rerender"],
      correct: ["Every filter creates a new array reference and updates a dependency"], tag: "effect-infinite-loop", critical: true }),
      field({ id: "fix", label: "Fix", options: ["Remove filtered state/effect and derive the array during render", "Add filtered to dependencies again", "Store filtered in a ref and render it"],
        correct: ["Remove filtered state/effect and derive the array during render"] })],
    "Each new array is a different reference, so the state update keeps invalidating the dependency. Derived data belongs in render."),
];

type ReviewFinding = { id: string; label: string; correct: string; critical?: boolean };
type ReviewSpec = {
  id: string;
  concepts: Concept[];
  difficulty: Difficulty;
  level: 1 | 2 | 3;
  prompt: string;
  code: string;
  findings: (ReviewFinding | StructuredField)[];
  explanation: string;
};
const review = (spec: ReviewSpec) => make(
  `review-${spec.id}`, "codeReview", "codeReview", spec.concepts, spec.difficulty, spec.prompt,
  spec.findings.map((item) => "kind" in item
    ? item : judgment(item.id, item.label, item.correct, item.critical)),
  spec.explanation, spec.code, { reviewLevel: spec.level },
);

const reviews: Question[] = [
  review({
    id: "effect-derived", concepts: ["reactReview", "reactEffects"], difficulty: "easy", level: 1,
    prompt: "Level 1: classify the effect, accessible controls, and one choice that is fine as-is.",
    code: `import { useEffect, useState } from "react";
type Props = { names: string[] };
export function NameList({ names }: Props) {
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(names);
  useEffect(() => {
    setShown(names.filter(name => name.includes(query)));
  }, [names, query]);
  function clear() { setQuery(""); }
  return <section>
    <h2>Names</h2>
    <label>Filter <input value={query} onChange={e => setQuery(e.target.value)} /></label>
    <button type="button" onClick={clear}>Clear</button>
    <ul>{shown.map(name => <li key={name}>{name}</li>)}</ul>
  </section>;
}`,
    findings: [
      { id: "derived", label: "Copying the derivable filtered list into state", correct: "SHOULD FIX" },
      { id: "label", label: "Search input has a label", correct: "FINE AS-IS" },
      { id: "clear", label: "Clear uses a native button", correct: "FINE AS-IS" },
      { id: "keys", label: "Unique stable names are used as keys", correct: "FINE AS-IS" },
    ],
    explanation: "Compute shown directly from names/query to avoid duplicated state and the extra effect render. The label, native button and stable unique keys are good.",
  }),
  review({
    id: "timer", concepts: ["reactReview", "reactEffects", "reactHooks"], difficulty: "medium", level: 2,
    prompt: "Level 2: classify the timer lifecycle, stale value, and non-problems.",
    code: `import { useEffect, useState } from "react";
export function Stopwatch() {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setSeconds(seconds + 1);
    }, 1000);
  }, [running]);
  function reset() { setSeconds(0); }
  return <section>
    <h2>Elapsed: {seconds}</h2>
    <button type="button" onClick={() => setRunning(value => !value)}>
      {running ? "Pause" : "Start"}
    </button>
    <button type="button" onClick={reset}>Reset</button>
    <output aria-live="polite">{seconds} seconds</output>
  </section>;
}`,
    findings: [
      { id: "closure", label: "Timer increments from a stale captured seconds value", correct: "MUST FIX", critical: true },
      { id: "cleanup", label: "Interval is not cleared on stop/unmount", correct: "MUST FIX", critical: true },
      { id: "reset", label: "Reset handler is a normal event callback", correct: "FINE AS-IS" },
      { id: "live", label: "Output has a polite live region", correct: "FINE AS-IS" },
      { id: "callback", label: "Wrapping reset in useCallback without a consumer", correct: "MEASURE / OPTIONAL" },
    ],
    explanation: "Use a functional update in the interval and return cleanup that clears the timer. The event callback and live output do not need optimization.",
  }),
  review({
    id: "fetch-deps", concepts: ["reactReview", "reactEffects", "reactRecovery"], difficulty: "medium", level: 2,
    prompt: "Level 2: inspect request dependencies and failure behavior; classify optional caching separately.",
    code: `import { useEffect, useState } from "react";
type User = { id: string; name: string };
export function UserCard({ userId }: { userId: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    fetch("/api/users/" + userId)
      .then(response => response.json())
      .then(setUser)
      .catch(() => setError("Could not load user"))
      .finally(() => setLoading(false));
  }, []);
  return <article>
    {loading && <p>Loading user…</p>}
    {error && <p role="alert">{error}</p>}
    {user && <h2>{user.name}</h2>}
    {!loading && !error && !user && <p>No user found</p>}
  </article>;
}`,
    findings: [
      { id: "deps", label: "Effect does not resynchronize when userId changes", correct: "MUST FIX", critical: true },
      { id: "race", label: "Older user request may overwrite a newer one", correct: "MUST FIX", critical: true },
      { id: "http", label: "Non-2xx response is treated as successful JSON", correct: "SHOULD FIX" },
      { id: "error", label: "Successful retry does not clear an old error", correct: "SHOULD FIX" },
      { id: "cache", label: "A query library is required for every fetch", correct: "FINE AS-IS" },
      { id: "loading", label: "Loading is represented explicitly", correct: "FINE AS-IS" },
    ],
    explanation: "Depend on userId, guard/abort obsolete work, check response.ok and clear stale errors when starting/succeeding. A query cache is useful for actual cache/retry/revalidation needs, not mandatory for every request.",
  }),
  review({
    id: "form-basics", concepts: ["reactReview", "reactForms", "reactRecovery"], difficulty: "medium", level: 2,
    prompt: "Level 2: classify form correctness, pending/error behavior and accessible field naming.",
    code: `import { useState } from "react";
export function InviteForm({ invite }: { invite: (email: string) => Promise<void> }) {
  const [email, setEmail] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    setBusy(true);
    await invite(email || "");
    setBusy(false);
  }
  return <form onSubmit={submit}>
    <input value={email} onChange={event => setEmail(event.target.value)} />
    {error && <p role="alert">{error}</p>}
    <button disabled={busy}>Send invite</button>
  </form>;
}`,
    findings: [
      { id: "controlled", label: "Email begins undefined and later becomes a string", correct: "MUST FIX", critical: true },
      { id: "submit", label: "Submit handler does not prevent native navigation", correct: "MUST FIX", critical: true },
      { id: "reject", label: "Rejected invite leaves busy true and is not reported", correct: "MUST FIX", critical: true },
      { id: "label", label: "Input has no accessible label", correct: "MUST FIX", critical: true },
      { id: "validate", label: "Email should be validated before sending", correct: "SHOULD FIX" },
      { id: "inline", label: "Inline input handler is used", correct: "FINE AS-IS" },
    ],
    explanation: "Initialize controlled text to an empty string, use a labeled input, prevent default, validate, catch/report rejection and clear pending in finally. Inline event handlers are fine.",
  }),
  review({
    id: "keyed-drafts", concepts: ["reactReview", "reactIdentity", "reactForms"], difficulty: "easy", level: 1,
    prompt: "Level 1: rows reorder and contain local drafts. Classify keys, input labels, and event-handler style.",
    code: `import { useState } from "react";
type Task = { id: string; title: string };
function TaskRow({ task }: { task: Task }) {
  const [draft, setDraft] = useState(task.title);
  return <li>
    <input value={draft} onChange={event => setDraft(event.target.value)} />
    <button type="button">Save {task.title}</button>
  </li>;
}
export function Tasks({ tasks }: { tasks: Task[] }) {
  return <ul>
    {tasks.map((task, index) => <TaskRow key={index} task={task} />)}
  </ul>;
}`,
    findings: [
      { id: "key", label: "Index key can attach a row draft to the wrong task after reorder", correct: "MUST FIX", critical: true },
      { id: "label", label: "Input has no programmatic label", correct: "MUST FIX", critical: true },
      { id: "button", label: "Button uses an explicit non-submit type", correct: "FINE AS-IS" },
      { id: "handler", label: "Inline change handler is automatically a bug", correct: "FINE AS-IS" },
    ],
    explanation: "Use task.id for identity when rows reorder and label the input. The button type is deliberate; inline handlers are not inherently wrong.",
  }),
  review({
    id: "context-value", concepts: ["reactReview", "reactState", "reactPerformance"], difficulty: "medium", level: 2,
    prompt: "Level 2: review state ownership and provider scope. There is no profiling evidence yet.",
    code: `import { createContext, useState } from "react";
type DashboardValue = { theme: string; query: string; setQuery: (q: string) => void };
export const DashboardContext = createContext<DashboardValue | null>(null);
export function Dashboard({ children }: { children: React.ReactNode }) {
  const [theme] = useState("dark");
  const [query, setQuery] = useState("");
  const value = { theme, query, setQuery };
  return <DashboardContext.Provider value={value}>
    <header><h1>Reports</h1></header>
    <label>Filter <input value={query} onChange={e => setQuery(e.target.value)} /></label>
    <main>{children}</main>
  </DashboardContext.Provider>;
}
export function ThemeLabel() {
  const value = useContext(DashboardContext);
  return <span>{value?.theme}</span>;
}`,
    findings: [
      { id: "import", label: "useContext is used but not imported", correct: "MUST FIX", critical: true },
      { id: "frequency", label: "High-frequency query state shares a broad context with theme", correct: "SHOULD FIX" },
      { id: "identity", label: "Provider creates a new value object on each render", correct: "MEASURE / OPTIONAL" },
      { id: "memo", label: "Wrap every consumer in React.memo before measuring", correct: "FINE AS-IS" },
      { id: "local", label: "Theme necessarily belongs in a query cache", correct: "FINE AS-IS" },
    ],
    explanation: "Import the hook and consider separating frequent local query state from shared theme when subscription scope matters. Measure before adding memoization; Context is not server cache.",
  }),
  review({
    id: "usememo-cheap", concepts: ["reactReview", "reactPerformance", "reactHooks"], difficulty: "easy", level: 1,
    prompt: "Level 1: no profiler evidence or identity-sensitive consumer is present. Classify the calculation and callbacks.",
    code: `import { useCallback, useMemo, useState } from "react";
export function Greeting({ first, last }: { first: string; last: string }) {
  const [shown, setShown] = useState(true);
  const fullName = useMemo(() => first + " " + last, [first, last]);
  const hide = useCallback(() => setShown(false), []);
  if (!shown) return null;
  return <section>
    <h2>Hello {fullName}</h2>
    <button type="button" onClick={hide}>Hide</button>
  </section>;
}`,
    findings: [
      { id: "memo", label: "Memoizing this cheap string concatenation without evidence", correct: "SHOULD FIX" },
      { id: "callback", label: "Stable callback has no memoized/identity-sensitive consumer", correct: "SHOULD FIX" },
      { id: "hooks", label: "Hooks are called before the conditional return", correct: "FINE AS-IS" },
      { id: "button", label: "Hide is a native button with explicit type", correct: "FINE AS-IS" },
    ],
    explanation: "The function is correct, but both caches add complexity without a demonstrated benefit. Keep the hooks unconditional and simplify the component.",
  }),
  review({
    id: "memo-unstable", concepts: ["reactReview", "reactPerformance"], difficulty: "medium", level: 2,
    prompt: "Level 2: a measured expensive child still renders. Classify the actual boundary issue and appropriate next step.",
    code: `import { memo, useState } from "react";
const Chart = memo(function Chart({ options, onPick }: {
  options: { mode: string }; onPick: (id: string) => void;
}) {
  const model = buildLargeChart(options);
  return <button onClick={() => onPick(model.id)}>Open chart</button>;
});
export function Analytics() {
  const [range, setRange] = useState("week");
  const [selected, setSelected] = useState("");
  return <section>
    <label>Range <select value={range} onChange={e => setRange(e.target.value)}>
      <option>week</option><option>month</option>
    </select></label>
    <Chart options={{ mode: range }} onPick={id => setSelected(id)} />
    <p>{selected}</p>
  </section>;
}`,
    findings: [
      { id: "props", label: "New options object and callback defeat default memo comparison", correct: "MUST FIX", critical: true },
      { id: "measure", label: "Chart calculation should be checked in Profiler", correct: "FINE AS-IS" },
      { id: "fix", label: "Stabilize only needed identities or move state/props to a useful boundary", correct: "SHOULD FIX" },
      { id: "allmemo", label: "Memo every component in the tree", correct: "FINE AS-IS" },
      { id: "range", label: "Controlled select is appropriate for the range", correct: "FINE AS-IS" },
    ],
    explanation: "The memo boundary is defeated by fresh reference props. Since the expensive calculation is measured, stabilize the relevant props/callback or refactor the boundary; do not blanket-memoize.",
  }),
  review({
    id: "ref-render", concepts: ["reactReview", "reactHooks", "reactForms"], difficulty: "medium", level: 2,
    prompt: "Level 2: the displayed counter should change immediately. Classify the ref, rendered state, and handler.",
    code: `import { useRef } from "react";
export function ClickCounter() {
  const clicks = useRef(0);
  function add() { clicks.current += 1; }
  return <section>
    <h2>Clicks: {clicks.current}</h2>
    <button type="button" onClick={add}>Add click</button>
    <p>Click the button to update this count.</p>
  </section>;
}`,
    findings: [
      { id: "display", label: "Ref mutation will update the displayed count", correct: "MUST FIX", critical: true },
      { id: "state", label: "A useState value should own visible click count", correct: "MUST FIX", critical: true },
      { id: "ref", label: "A ref is suitable for a mutable value not used to render", correct: "FINE AS-IS" },
      { id: "handler", label: "Simple named event handler needs useCallback", correct: "MEASURE / OPTIONAL" },
    ],
    explanation: "Mutating ref.current does not schedule render, so a displayed count belongs in state. Refs remain appropriate for non-render values such as a timer handle.",
  }),
  review({
    id: "state-ownership", concepts: ["reactReview", "reactState", "reactDesign"], difficulty: "medium", level: 2,
    prompt: "Level 2: choose the correct state owner. The page has one modal, one input and remotely fetched users.",
    code: `import { useState } from "react";
export function UsersPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  return <main>
    <label>Search users <input value={query} onChange={e => setQuery(e.target.value)} /></label>
    <button type="button" onClick={() => setModalOpen(true)}>Invite</button>
    {loading && <p>Loading…</p>}
    {error && <p role="alert">{error}</p>}
    <UserList users={users} />
    {modalOpen && <InviteDialog onClose={() => setModalOpen(false)} />}
  </main>;
}`,
    findings: [
      { id: "modal", label: "Modal visibility is local to the page that owns it", correct: "FINE AS-IS" },
      { id: "query", label: "Search input is transient local state", correct: "FINE AS-IS" },
      { id: "server", label: "Remote users and request lifecycle may benefit from a query cache", correct: "SHOULD FIX" },
      { id: "global", label: "All state must move to Redux because it is on a page", correct: "FINE AS-IS" },
      { id: "loading", label: "Loading and error states should remain distinguishable", correct: "FINE AS-IS" },
    ],
    explanation: "Keep modal and query local. Prefer a query library if remote users need caching, revalidation, retries or mutation integration; global state is not automatic.",
  }),
  review({
    id: "context-server", concepts: ["reactReview", "reactState"], difficulty: "medium", level: 2,
    prompt: "Level 2: a provider is being used as a server cache. Classify the data ownership and fine choices.",
    code: `import { createContext, useContext, useEffect, useState } from "react";
type Product = { id: string; title: string };
const ProductContext = createContext<Product[]>([]);
export function ProductProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  useEffect(() => {
    fetch("/api/products").then(r => r.json()).then(setProducts);
  }, []);
  return <ProductContext.Provider value={products}>
    {children}
  </ProductContext.Provider>;
}
export function ProductTitle({ id }: { id: string }) {
  const products = useContext(ProductContext);
  return <h2>{products.find(p => p.id === id)?.title}</h2>;
}`,
    findings: [
      { id: "server", label: "Context alone provides cache/revalidation/retry lifecycle", correct: "MUST FIX", critical: true },
      { id: "request", label: "Request has no rejection, HTTP or pending recovery", correct: "SHOULD FIX" },
      { id: "scope", label: "Context can be appropriate for a small stable shared value", correct: "FINE AS-IS" },
      { id: "query", label: "TanStack Query is a possible server-data owner when lifecycle needs justify it", correct: "SHOULD FIX" },
      { id: "all-query", label: "Every context should be replaced by a query library", correct: "FINE AS-IS" },
    ],
    explanation: "Context is not a server cache. Provide request lifecycle and recovery or adopt a query cache when its cache/revalidation semantics are useful; Context remains suitable for some shared client state.",
  }),
  review({
    id: "query-ui", concepts: ["reactReview", "reactState"], difficulty: "easy", level: 1,
    prompt: "Level 1: identify state misclassification and leave acceptable choices alone.",
    code: `import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
export function HelpPanel() {
  const [open, setOpen] = useState(false);
  const help = useQuery({ queryKey: ["help-document"], queryFn: loadHelpDocument });
  return <aside>
    <button type="button" onClick={() => setOpen(value => !value)}>Help</button>
    {open && <article>{help.data?.text}</article>}
    <p>Need help? Contact support.</p>
  </aside>;
}`,
    findings: [
      { id: "ui", label: "Modal/panel visibility is local transient state", correct: "FINE AS-IS" },
      { id: "server", label: "Remote help document can reasonably use a query cache", correct: "FINE AS-IS" },
      { id: "handler", label: "Inline click handler is automatically a performance defect", correct: "FINE AS-IS" },
      { id: "status", label: "Pending/error UI should be designed for the document request", correct: "SHOULD FIX" },
    ],
    explanation: "Local state correctly owns panel visibility; query data for a remote document can use TanStack Query. Show the query's pending/error states. A simple inline callback is fine.",
  }),
  review({
    id: "keys-static", concepts: ["reactReview", "reactIdentity"], difficulty: "easy", level: 1,
    prompt: "Level 1: the displayed list is static, has no local state, and never reorders. Classify the index key judgment.",
    code: `type Color = "red" | "green" | "blue";
const palette: Color[] = ["red", "green", "blue"];
export function Palette() {
  return <ul>
    {palette.map((color, index) =>
      <li key={index} className={color}>{color}</li>
    )}
  </ul>;
}`,
    findings: [
      { id: "index", label: "Index key in this fixed, static list", correct: "FINE AS-IS" },
      { id: "id", label: "Must invent IDs for this immutable list before release", correct: "FINE AS-IS" },
      { id: "color", label: "Each fixed color is displayed as content", correct: "FINE AS-IS" },
      { id: "state", label: "A key is required to preserve per-row editable state here", correct: "FINE AS-IS" },
    ],
    explanation: "An index key can be acceptable for a fixed list with no insertion/reordering or item-local state. Stable IDs are still preferred when available, but this is not a defect.",
  }),
  review({
    id: "composition", concepts: ["reactReview", "reactDesign"], difficulty: "medium", level: 2,
    prompt: "Level 2: a reusable card has many boolean variants but only two callers. Classify the API and abstraction timing.",
    code: `type CardProps = {
  title: string; compact?: boolean; danger?: boolean; centered?: boolean;
  showIcon?: boolean; useBorder?: boolean; footer?: boolean;
  children: React.ReactNode;
};
export function Card(props: CardProps) {
  return <section className={[
    props.compact && "compact", props.danger && "danger",
    props.centered && "center", props.useBorder && "bordered"
  ].filter(Boolean).join(" ")}>
    {props.showIcon && <span aria-hidden="true">!</span>}
    <h2>{props.title}</h2>
    <div>{props.children}</div>
    {props.footer && <footer><button>Continue</button></footer>}
  </section>;
}`,
    findings: [
      { id: "booleans", label: "Boolean prop combinations create a hard-to-reason-about API", correct: "SHOULD FIX" },
      { id: "composition", label: "Children/composition can express genuinely different content", correct: "SHOULD FIX" },
      { id: "extract", label: "Extract a new component for every className expression", correct: "FINE AS-IS" },
      { id: "scope", label: "Do not extract further abstractions until reuse needs are clear", correct: "FINE AS-IS" },
      { id: "accessibility", label: "Decorative icon is hidden from assistive technology", correct: "FINE AS-IS" },
    ],
    explanation: "Prefer an explicit compositional shell and slots when callers need meaningfully different content. Avoid adding abstractions without a demonstrated boundary; the decorative icon is appropriately hidden.",
  }),
  review({
    id: "effect-event", concepts: ["reactReview", "reactEffects"], difficulty: "medium", level: 2,
    prompt: "Level 2: an analytics event should happen after the user action, not because a component rendered.",
    code: `import { useEffect, useState } from "react";
export function PurchaseButton({ productId }: { productId: string }) {
  const [purchased, setPurchased] = useState(false);
  useEffect(() => {
    if (purchased) {
      analytics.track("purchase", { productId });
    }
  }, [purchased, productId]);
  return <section>
    <p>{purchased ? "Purchased" : "Not purchased"}</p>
    <button type="button" onClick={() => setPurchased(true)}>
      Purchase
    </button>
  </section>;
}`,
    findings: [
      { id: "event", label: "Event-specific analytics belongs in the purchase handler/transaction flow", correct: "SHOULD FIX" },
      { id: "duplicate", label: "Effect may track again when productId changes while purchased remains true", correct: "MUST FIX", critical: true },
      { id: "state", label: "Purchased status can be represented as React state", correct: "FINE AS-IS" },
      { id: "effect", label: "Effect is required for every side effect", correct: "FINE AS-IS" },
    ],
    explanation: "The analytics event is caused by a user action, so perform it in the handler/request flow to avoid effect-driven duplicate tracking when dependencies change.",
  }),
  review({
    id: "api-props", concepts: ["reactReview", "reactDesign"], difficulty: "medium", level: 2,
    prompt: "Level 2: a component has many redundant flags. Classify API design and keep the minimal stable choices.",
    code: `type EmptyProps = {
  title: string; isLoading?: boolean; hasError?: boolean;
  isEmpty?: boolean; showRetry?: boolean; retry?: () => void;
  loadingText?: string; errorText?: string; emptyText?: string;
};
export function ResultPanel(props: EmptyProps) {
  return <section aria-busy={props.isLoading}>
    <h2>{props.title}</h2>
    {props.isLoading && <p>{props.loadingText}</p>}
    {props.hasError && <p role="alert">{props.errorText}</p>}
    {props.isEmpty && <p>{props.emptyText}</p>}
    {props.showRetry && <button onClick={props.retry}>Retry</button>}
  </section>;
}`,
    findings: [
      { id: "states", label: "Independent booleans permit contradictory loading/error/empty states", correct: "SHOULD FIX" },
      { id: "union", label: "An explicit status union can make mutually exclusive states clearer", correct: "SHOULD FIX" },
      { id: "aria", label: "aria-busy communicates loading status", correct: "FINE AS-IS" },
      { id: "abstract", label: "Replace this small component with a global state framework", correct: "FINE AS-IS" },
    ],
    explanation: "A discriminated status model can prevent impossible combinations. Keep the present component boundary and semantic aria-busy; no global abstraction is needed.",
  }),
  review({
    id: "custom-hook", concepts: ["reactReview", "reactDesign", "reactEffects"], difficulty: "medium", level: 2,
    prompt: "Level 2: a custom hook wraps a subscription but returns stale data and never unsubscribes.",
    code: `import { useEffect, useState } from "react";
export function useRoomMessages(roomId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  useEffect(() => {
    const subscription = socket.subscribe(roomId, value => {
      setMessages([...messages, value]);
    });
  }, []);
  return messages;
}
export function Room({ roomId }: { roomId: string }) {
  const messages = useRoomMessages(roomId);
  return <ul>{messages.map(message =>
    <li key={message.id}>{message.text}</li>
  )}</ul>;
}`,
    findings: [
      { id: "room", label: "Subscription does not change when roomId changes", correct: "MUST FIX", critical: true },
      { id: "stale", label: "Callback appends to the initial messages closure", correct: "MUST FIX", critical: true },
      { id: "cleanup", label: "Subscription is not removed on dependency change/unmount", correct: "MUST FIX", critical: true },
      { id: "hook", label: "Extracting coherent subscription logic into a custom hook", correct: "FINE AS-IS" },
      { id: "keys", label: "Message ID is a stable key", correct: "FINE AS-IS" },
    ],
    explanation: "Depend on roomId, return unsubscribe cleanup, and append with a functional state updater. The custom hook is a coherent reuse boundary.",
  }),
  review({
    id: "boundary-event", concepts: ["reactReview", "reactRecovery"], difficulty: "medium", level: 2,
    prompt: "Level 2: classify which failures an Error Boundary handles and where retry belongs.",
    code: `import { Component, useState } from "react";
class AppBoundary extends Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <p role="alert">Screen failed</p> : this.props.children;
  }
}
export function SavePanel({ save }: { save: () => Promise<void> }) {
  const [saved, setSaved] = useState(false);
  return <AppBoundary>
    <button onClick={async () => { await save(); setSaved(true); }}>
      Save
    </button>
    {saved && <p>Saved</p>}
  </AppBoundary>;
}`,
    findings: [
      { id: "async", label: "Boundary does not catch rejected async event handler", correct: "MUST FIX", critical: true },
      { id: "save", label: "Save flow needs explicit pending/error/retry behavior", correct: "SHOULD FIX" },
      { id: "render", label: "Boundary can provide fallback for supported descendant render failures", correct: "FINE AS-IS" },
      { id: "scope", label: "A boundary must always wrap the entire application", correct: "FINE AS-IS" },
    ],
    explanation: "Catch/report the rejected save where it is initiated and provide recovery UI. The Error Boundary still serves its render-failure purpose; boundary placement can be local or broader by UX need.",
  }),
  review({
    id: "suspense-fetch", concepts: ["reactReview", "reactRecovery"], difficulty: "medium", level: 2,
    prompt: "Level 2: Suspense wraps a component using ordinary effect-based fetching. Classify the fallback expectation.",
    code: `import { Suspense, useEffect, useState } from "react";
function Feed() {
  const [posts, setPosts] = useState<Post[]>([]);
  useEffect(() => {
    fetch("/api/posts").then(r => r.json()).then(setPosts);
  }, []);
  return <ul>{posts.map(post => <li key={post.id}>{post.title}</li>)}</ul>;
}
export function FeedPage() {
  return <main>
    <h1>Latest posts</h1>
    <Suspense fallback={<p>Loading posts…</p>}>
      <Feed />
    </Suspense>
  </main>;
}`,
    findings: [
      { id: "suspense", label: "Effect fetch does not automatically activate this Suspense fallback", correct: "MUST FIX", critical: true },
      { id: "loading", label: "Feed needs explicit pending/error/empty UI or a supported suspending data source", correct: "SHOULD FIX" },
      { id: "keys", label: "Post ID keys are appropriate", correct: "FINE AS-IS" },
      { id: "boundary", label: "Suspense fallback is useful for work that actually suspends", correct: "FINE AS-IS" },
    ],
    explanation: "Ordinary useEffect fetches need explicit loading/error state. Suspense is valid for supported suspending resources, such as lazy components or compatible data sources.",
  }),
  review({
    id: "state-transition", concepts: ["reactReview", "reactState", "reactForms"], difficulty: "medium", level: 2,
    prompt: "Level 2: submitted values and current input values are intentionally different. Classify ownership and synchronization.",
    code: `import { useEffect, useState } from "react";
export function SearchBox({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [submitted, setSubmitted] = useState(initialQuery);
  useEffect(() => { setSubmitted(query); }, [query]);
  function submit(event: React.FormEvent) {
    event.preventDefault();
    navigate("/search?q=" + encodeURIComponent(submitted));
  }
  return <form onSubmit={submit}>
    <label>Search <input value={query} onChange={e => setQuery(e.target.value)} /></label>
    <button>Search now</button>
    <output>{submitted}</output>
  </form>;
}`,
    findings: [
      { id: "effect", label: "Effect submits every keystroke despite an explicit submit interaction", correct: "MUST FIX", critical: true },
      { id: "submit", label: "The submit handler uses submitted state updated only by that effect", correct: "MUST FIX", critical: true },
      { id: "button", label: "A submit button inside a form can omit type=submit", correct: "FINE AS-IS" },
      { id: "intent", label: "Keep draft query and submitted query separate when submit semantics require it", correct: "FINE AS-IS" },
    ],
    explanation: "The Effect defeats submit semantics and creates a delayed duplicate value. Update submitted in the handler from the current input; retaining both states can be intentional for a draft/committed distinction.",
  }),
  review({
    id: "recovery-optional", concepts: ["reactReview", "reactRecovery", "reactDesign"], difficulty: "medium", level: 2,
    prompt: "Level 2: optional recommendations fail while the primary page succeeds. Judge graceful degradation and avoid overbuilding.",
    code: `export function ProductPage({ product, suggestions, suggestionsError }: Props) {
  return <main>
    <h1>{product.name}</h1>
    <p>{product.description}</p>
    {suggestionsError
      ? <p>Recommendations are unavailable right now.</p>
      : <section aria-label="Related products">
          <h2>You may also like</h2>
          {suggestions.map(item => <a key={item.id} href={item.href}>{item.name}</a>)}
        </section>}
    <button type="button" onClick={() => addToCart(product.id)}>Add to cart</button>
  </main>;
}`,
    findings: [
      { id: "primary", label: "Optional recommendations failure should take down the primary product page", correct: "FINE AS-IS" },
      { id: "degrade", label: "Keeping primary content usable is graceful degradation", correct: "FINE AS-IS" },
      { id: "retry", label: "A retry may be added when recovery value justifies it", correct: "MEASURE / OPTIONAL" },
      { id: "link", label: "Related links are grouped under a named section", correct: "FINE AS-IS" },
    ],
    explanation: "The primary task survives an optional panel failure, a good partial-failure strategy. Add retry if the data/user journey justifies it; do not require a page-wide boundary here.",
  }),
  review({
    id: "stable-boundary", concepts: ["reactReview", "reactPerformance", "reactDesign"], difficulty: "easy", level: 1,
    prompt: "Level 1: profiler shows no bottleneck. Classify the current component boundary and optimization proposal.",
    code: `export function PriceLabel({ amount, currency }: Props) {
  return <span>{currency} {amount.toFixed(2)}</span>;
}
export function CartSummary({ amount, currency }: Props) {
  return <section>
    <h2>Subtotal</h2>
    <PriceLabel amount={amount} currency={currency} />
    <p>Taxes are calculated at checkout.</p>
  </section>;
}`,
    findings: [
      { id: "boundary", label: "Small PriceLabel with explicit props is a reasonable boundary", correct: "FINE AS-IS" },
      { id: "memo", label: "React.memo is required because a child exists", correct: "FINE AS-IS" },
      { id: "measure", label: "Measure meaningful performance before optimizing", correct: "FINE AS-IS" },
      { id: "hook", label: "Extract usePriceLabel custom hook for this JSX", correct: "FINE AS-IS" },
    ],
    explanation: "The simple boundary is readable. There is no measured reason for React.memo or a custom hook; leave it as-is.",
  }),
  review({
    id: "functional-update", concepts: ["reactReview", "reactHooks"], difficulty: "easy", level: 1,
    prompt: "Level 1: a handler should add two items. Classify state update correctness and harmless inline behavior.",
    code: `export function QuantityPicker() {
  const [quantity, setQuantity] = useState(0);
  function addTwo() {
    setQuantity(quantity + 1);
    setQuantity(quantity + 1);
  }
  return <section>
    <output>{quantity}</output>
    <button type="button" onClick={addTwo}>Add two</button>
  </section>;
}`,
    findings: [
      { id: "updates", label: "Two replacements based on the same captured value add only one", correct: "MUST FIX", critical: true },
      { id: "updater", label: "Use functional state updaters when each update depends on prior pending state", correct: "SHOULD FIX" },
      { id: "function", label: "Named event handler needs useCallback by default", correct: "FINE AS-IS" },
      { id: "output", label: "Output is appropriate for a displayed value", correct: "FINE AS-IS" },
    ],
    explanation: "Use `setQuantity(value => value + 1)` twice so the queued updates compose. A named handler does not need memoization without an identity-sensitive use.",
  }),
  review({
    id: "effect-listener", concepts: ["reactReview", "reactEffects"], difficulty: "medium", level: 2,
    prompt: "Level 2: keyboard listener should use current `onClose` and be removed. Classify its lifecycle.",
    code: `import { useEffect } from "react";
export function Dialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
  }, []);
  return <section role="dialog" aria-modal="true" aria-labelledby="dialog-title">
    <h2 id="dialog-title">Preferences</h2>
    <button type="button" onClick={onClose}>Close</button>
  </section>;
}`,
    findings: [
      { id: "deps", label: "Listener keeps the initial onClose closure if the callback changes", correct: "SHOULD FIX" },
      { id: "cleanup", label: "Listener is never removed", correct: "MUST FIX", critical: true },
      { id: "dialog", label: "Dialog has an accessible name and modal role", correct: "FINE AS-IS" },
      { id: "button", label: "Close is a semantic button", correct: "FINE AS-IS" },
    ],
    explanation: "Include the reactive callback dependency and remove the exact listener in cleanup. Existing dialog labeling and button semantics are appropriate.",
  }),
  review({
    id: "usememo-deps", concepts: ["reactReview", "reactHooks", "reactPerformance"], difficulty: "medium", level: 2,
    prompt: "Level 2: measured grouping is expensive, but its memo has an incomplete dependency list. Classify correction and scope.",
    code: `import { useMemo } from "react";
export function GroupedOrders({ orders, status }: Props) {
  const visible = useMemo(() => {
    const filtered = orders.filter(order => order.status === status);
    return expensiveGroupByCustomer(filtered);
  }, [orders]);
  return <ul>
    {visible.map(group =>
      <li key={group.customerId}>
        {group.customerName}: {group.orders.length}
      </li>
    )}
  </ul>;
}`,
    findings: [
      { id: "deps", label: "Memo calculation reads status but omits it from dependencies", correct: "MUST FIX", critical: true },
      { id: "expensive", label: "Measured expensive grouping may justify useMemo", correct: "FINE AS-IS" },
      { id: "key", label: "Customer ID is a stable list key", correct: "FINE AS-IS" },
      { id: "memo-all", label: "Wrap every value returned from the component in useMemo", correct: "FINE AS-IS" },
    ],
    explanation: "Include status because the calculation reads it. useMemo is reasonable for measured expensive grouping; it is not a general requirement for every value.",
  }),
  review({
    id: "derived-total", concepts: ["reactReview", "reactEffects", "reactPerformance"], difficulty: "easy", level: 1,
    prompt: "Level 1: cart total is cheap and derived from current items. Classify duplication and memoization.",
    code: `import { useEffect, useMemo, useState } from "react";
export function CartTotal({ items }: { items: Item[] }) {
  const [total, setTotal] = useState(0);
  useEffect(() => {
    setTotal(items.reduce((sum, item) => sum + item.price, 0));
  }, [items]);
  const formatted = useMemo(() => "$" + total.toFixed(2), [total]);
  return <p aria-live="polite">Total: {formatted}</p>;
}`,
    findings: [
      { id: "derive", label: "Effect duplicates a cheap value derivable from items", correct: "SHOULD FIX" },
      { id: "memo", label: "Memoizing trivial formatting is required", correct: "FINE AS-IS" },
      { id: "aria", label: "Live region is useful if total changes need announcement", correct: "FINE AS-IS" },
      { id: "state", label: "An extra commit can expose a stale total", correct: "SHOULD FIX" },
    ],
    explanation: "Compute total and formatted value during render. The live region may suit this interaction; neither a second state nor memo is needed for trivial work.",
  }),
  review({
    id: "index-key-warning", concepts: ["reactReview", "reactIdentity", "reactForms"], difficulty: "medium", level: 2,
    prompt: "Level 2: rows have drafts, and users can insert at the top. Classify list identity and state ownership.",
    code: `function Row({ label }: { label: string }) {
  const [draft, setDraft] = useState(label);
  return <label>{label}
    <input value={draft} onChange={e => setDraft(e.target.value)} />
  </label>;
}
export function EditableList({ labels }: { labels: string[] }) {
  return <ul>
    {labels.map((label, index) =>
      <li key={index}><Row label={label} /></li>
    )}
  </ul>;
}`,
    findings: [
      { id: "identity", label: "Index keys may move state to a different row after insertion", correct: "MUST FIX", critical: true },
      { id: "stable", label: "Use a stable logical ID for each editable row", correct: "SHOULD FIX" },
      { id: "controlled", label: "Row draft as local state is inherently incorrect", correct: "FINE AS-IS" },
      { id: "label", label: "Nested label associates its text with the input", correct: "FINE AS-IS" },
    ],
    explanation: "Editable rows inserted/reordered need stable identity. Keeping the draft local to each row and using an implicit label is fine.",
  }),
  review({
    id: "provider-theme", concepts: ["reactReview", "reactState", "reactPerformance"], difficulty: "easy", level: 1,
    prompt: "Level 1: theme is shared and rarely changes. Decide whether Context and memoization are justified.",
    code: `const ThemeContext = createContext("light");
export function ThemeRoot({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState("light");
  return <ThemeContext.Provider value={theme}>
    <button onClick={() => setTheme(value => value === "light" ? "dark" : "light")}>
      Toggle theme
    </button>
    {children}
  </ThemeContext.Provider>;
}
export function Logo() {
  const theme = useContext(ThemeContext);
  return <strong className={theme}>Acme</strong>;
}`,
    findings: [
      { id: "context", label: "Context is a reasonable owner for shared low-frequency theme", correct: "FINE AS-IS" },
      { id: "memo", label: "Every consumer must be wrapped in React.memo", correct: "FINE AS-IS" },
      { id: "setter", label: "Functional toggle avoids depending on a captured theme", correct: "FINE AS-IS" },
      { id: "query", label: "Theme should be stored in TanStack Query", correct: "FINE AS-IS" },
    ],
    explanation: "This is a straightforward shared, low-frequency client value. Context is fine; avoid adding query cache or memo wrappers without a measured need.",
  }),
  review({
    id: "accessible-select", concepts: ["reactReview", "reactForms"], difficulty: "easy", level: 1,
    prompt: "Level 1: inspect the native select and status messaging. Classify accessibility and optimization.",
    code: `export function SortControl({ sort, onSort }: Props) {
  return <section>
    <label htmlFor="sort-orders">Sort orders</label>
    <select id="sort-orders" value={sort} onChange={e => onSort(e.target.value)}>
      <option value="recent">Most recent</option>
      <option value="amount">Amount</option>
    </select>
    <p role="status">Showing orders sorted by {sort}</p>
  </section>;
}`,
    findings: [
      { id: "label", label: "Select has a programmatically associated label", correct: "FINE AS-IS" },
      { id: "status", label: "Status role is used for a concise update", correct: "FINE AS-IS" },
      { id: "memo", label: "Change handler must use useCallback", correct: "FINE AS-IS" },
      { id: "native", label: "Replace native select with a custom widget by default", correct: "FINE AS-IS" },
    ],
    explanation: "The native control and label are accessible; a concise status can announce updates. Keep the simple component and handler.",
  }),
  review({
    id: "api-retry", concepts: ["reactReview", "reactRecovery"], difficulty: "medium", level: 2,
    prompt: "Level 2: a retry button only dismisses an error. Classify retry semantics and current UI.",
    code: `export function Report({ result, error, clearError }: Props) {
  if (error) return <section role="alert">
    <p>Could not load report.</p>
    <button type="button" onClick={clearError}>Retry</button>
  </section>;
  if (!result) return <p>Loading report…</p>;
  return <article>
    <h2>{result.title}</h2>
    <p>{result.summary}</p>
  </article>;
}`,
    findings: [
      { id: "retry", label: "Retry action must trigger a new request, not just clear the message", correct: "MUST FIX", critical: true },
      { id: "pending", label: "Pending and loaded content are distinguishable", correct: "FINE AS-IS" },
      { id: "error", label: "Error is announced with role=alert", correct: "FINE AS-IS" },
      { id: "fallback", label: "An Error Boundary automatically retries the request", correct: "FINE AS-IS" },
    ],
    explanation: "A retry should invoke the request again and reflect its pending/failure/success state. The visible error and loading states are otherwise useful.",
  }),
  review({
    id: "custom-hook-local", concepts: ["reactReview", "reactDesign", "reactState"], difficulty: "easy", level: 1,
    prompt: "Level 1: both panels use the same toggle behavior. Classify whether a custom hook creates shared state.",
    code: `function useDisclosure() {
  const [open, setOpen] = useState(false);
  return { open, toggle: () => setOpen(value => !value) };
}
export function HelpPanel() {
  const disclosure = useDisclosure();
  return <button onClick={disclosure.toggle}>{disclosure.open ? "Hide" : "Help"}</button>;
}
export function FilterPanel() {
  const disclosure = useDisclosure();
  return <button onClick={disclosure.toggle}>{disclosure.open ? "Hide" : "Filters"}</button>;
}`,
    findings: [
      { id: "shared", label: "Toggling HelpPanel also toggles FilterPanel because they share a hook", correct: "FINE AS-IS" },
      { id: "logic", label: "Custom hook coherently reuses the toggle logic", correct: "FINE AS-IS" },
      { id: "global", label: "Both values must move to a global store", correct: "FINE AS-IS" },
      { id: "api", label: "Hook call returns independent local state per caller", correct: "FINE AS-IS" },
    ],
    explanation: "Custom hooks reuse logic, not a shared state instance. Each call owns its own disclosure; no global store is necessary.",
  }),
  review({
    id: "render-setstate", concepts: ["reactReview", "reactHooks", "reactRender"], difficulty: "medium", level: 2,
    prompt: "Level 2: selecting a default during render causes an update loop. Classify the repair and any reasonable initializer.",
    code: `export function Editor({ record }: { record: RecordData }) {
  const [title, setTitle] = useState("");
  setTitle(record.title);
  return <section>
    <label>Title
      <input value={title} onChange={event => setTitle(event.target.value)} />
    </label>
    <p>Editing {record.id}</p>
  </section>;
}`,
    findings: [
      { id: "render", label: "Unconditional state updates during render create render-phase problems", correct: "MUST FIX", critical: true },
      { id: "init", label: "A lazy initial value or keyed reset can initialize a new record", correct: "SHOULD FIX" },
      { id: "effect", label: "Add an Effect solely to copy every record.title change into title", correct: "FINE AS-IS" },
      { id: "label", label: "Input has a visible label", correct: "FINE AS-IS" },
    ],
    explanation: "Initialize from record intentionally or reset the editor when record identity changes. Blindly mirroring props with an Effect can overwrite user edits.",
  }),
  review({
    id: "focus-ref", concepts: ["reactReview", "reactHooks", "reactForms"], difficulty: "easy", level: 1,
    prompt: "Level 1: focus an input after opening a dialog without using the ref as displayed state.",
    code: `import { useEffect, useRef } from "react";
export function RenameDialog({ open }: { open: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  if (!open) return null;
  return <section role="dialog" aria-labelledby="rename-title">
    <h2 id="rename-title">Rename item</h2>
    <label>New name <input ref={inputRef} defaultValue="" /></label>
  </section>;
}`,
    findings: [
      { id: "ref", label: "Ref is an appropriate imperative handle for focusing the DOM input", correct: "FINE AS-IS" },
      { id: "effect", label: "Effect synchronizes focus with the open state", correct: "FINE AS-IS" },
      { id: "label", label: "Input is associated with its visible label", correct: "FINE AS-IS" },
      { id: "state", label: "Ref mutation must trigger rendering for focus to work", correct: "FINE AS-IS" },
    ],
    explanation: "Refs are useful for imperative DOM access. The effect reacts to open, and focus does not require the ref mutation to schedule a render.",
  }),
  review({
    id: "derived-memo", concepts: ["reactReview", "reactPerformance", "reactHooks"], difficulty: "medium", level: 2,
    prompt: "Level 2: filtering is inexpensive and the parent has no memoized consumer. Classify the cache and correctness.",
    code: `import { useMemo, useState } from "react";
export function People({ people }: { people: Person[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () => people.filter(person => person.name.toLowerCase().includes(query.toLowerCase())),
    [people]
  );
  return <section>
    <label>Find <input value={query} onChange={e => setQuery(e.target.value)} /></label>
    <ul>{filtered.map(person => <li key={person.id}>{person.name}</li>)}</ul>
  </section>;
}`,
    findings: [
      { id: "deps", label: "Memo omits query even though the calculation reads it", correct: "MUST FIX", critical: true },
      { id: "cache", label: "Cheap filtering needs no memo absent measured cost/identity need", correct: "SHOULD FIX" },
      { id: "keys", label: "Stable person ID keys are appropriate", correct: "FINE AS-IS" },
      { id: "label", label: "Search field is labeled", correct: "FINE AS-IS" },
    ],
    explanation: "The incomplete dependency can produce stale results. Add query if retaining the memo, or more simply derive during render when the calculation is cheap.",
  }),
  review({
    id: "request-abort", concepts: ["reactReview", "reactEffects", "reactRecovery"], difficulty: "hard", level: 2,
    prompt: "Level 2: request result may become obsolete when accountId changes. Classify cancellation and the handling of HTTP errors.",
    code: `import { useEffect, useState } from "react";
export function Account({ accountId }: { accountId: string }) {
  const [data, setData] = useState<AccountData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/account/" + accountId, { signal: controller.signal })
      .then(response => response.json())
      .then(setData)
      .catch(reason => {
        if (reason.name !== "AbortError") setError("Load failed");
      });
    return () => controller.abort();
  }, [accountId]);
  return error ? <p role="alert">{error}</p> : <AccountView data={data} />;
}`,
    findings: [
      { id: "abort", label: "AbortController cleanup protects against obsolete in-flight request work", correct: "FINE AS-IS" },
      { id: "http", label: "response.ok must be checked because fetch resolves for HTTP errors", correct: "SHOULD FIX" },
      { id: "error", label: "Error state should be reset when a new load begins", correct: "SHOULD FIX" },
      { id: "deps", label: "accountId is included as a reactive dependency", correct: "FINE AS-IS" },
      { id: "pending", label: "Loading state should be represented while a new account is pending", correct: "SHOULD FIX" },
    ],
    explanation: "Cleanup and dependency are good. Add HTTP status handling, reset stale error and present pending UI; AbortController alone does not provide complete request UX.",
  }),
  review({
    id: "primitive-deps", concepts: ["reactReview", "reactEffects", "reactPerformance"], difficulty: "medium", level: 2,
    prompt: "Level 2: a memoized child gets a freshly allocated object, but only displays two primitive fields. Classify simplification.",
    code: `const Badge = memo(function Badge({ info }: { info: Info }) {
  return <span>{info.label}: {info.count}</span>;
});
export function Summary({ label, count }: Props) {
  const [expanded, setExpanded] = useState(false);
  return <section>
    <button type="button" onClick={() => setExpanded(value => !value)}>
      Toggle
    </button>
    <Badge info={{ label, count }} />
    {expanded && <p>More details</p>}
  </section>;
}`,
    findings: [
      { id: "identity", label: "Fresh info object prevents default memo bailout on unrelated parent updates", correct: "SHOULD FIX" },
      { id: "measure", label: "Profiler evidence should decide whether this small child needs memo", correct: "FINE AS-IS" },
      { id: "api", label: "Explicit primitive props could avoid a wrapper object if optimizing this boundary", correct: "MEASURE / OPTIONAL" },
      { id: "handler", label: "Toggle must use useCallback despite no identity-sensitive consumer", correct: "FINE AS-IS" },
    ],
    explanation: "A new object defeats default shallow memo comparison, but first measure whether this tiny child matters. If it does, use stable/primitive props; do not add callback memo automatically.",
  }),
  review({
    id: "cleanup-ignore", concepts: ["reactReview", "reactEffects"], difficulty: "hard", level: 2,
    prompt: "Level 2: cancellation is unavailable in this client API. Classify the ignore-result guard and the rest of the lifecycle.",
    code: `import { useEffect, useState } from "react";
export function Preview({ documentId }: { documentId: string }) {
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let active = true;
    setPending(true);
    loadPreview(documentId).then(value => {
      if (active) setPreview(value);
    }).catch(() => {
      if (active) setError("Preview failed");
    }).finally(() => {
      if (active) setPending(false);
    });
    return () => { active = false; };
  }, [documentId]);
  return <PreviewView value={preview} pending={pending} error={error} />;
}`,
    findings: [
      { id: "guard", label: "Cleanup guard prevents stale results from publishing", correct: "FINE AS-IS" },
      { id: "error", label: "Old error is not cleared when starting a new request", correct: "SHOULD FIX" },
      { id: "pending", label: "Pending is represented for the active request", correct: "FINE AS-IS" },
      { id: "deps", label: "documentId is a dependency and cleanup invalidates prior closure", correct: "FINE AS-IS" },
      { id: "abort", label: "An ignore guard can be valid if the API cannot be canceled", correct: "FINE AS-IS" },
    ],
    explanation: "The active flag prevents stale UI updates and cleanup invalidates the prior request. Clear error on a new attempt; AbortController is not the only valid strategy.",
  }),
  review({
    id: "form-reset", concepts: ["reactReview", "reactForms"], difficulty: "medium", level: 2,
    prompt: "Level 2: Reset should restore defaults, not submit the form. Classify button semantics and state update.",
    code: `export function ProfileForm() {
  const [name, setName] = useState("");
  function reset() { setName(""); }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    saveProfile(name);
  }
  return <form onSubmit={submit}>
    <label>Name <input value={name} onChange={e => setName(e.target.value)} /></label>
    <button>Save</button>
    <button onClick={reset}>Reset</button>
  </form>;
}`,
    findings: [
      { id: "reset", label: "Reset button defaults to submit inside a form", correct: "MUST FIX", critical: true },
      { id: "save", label: "Save button correctly submits the form", correct: "FINE AS-IS" },
      { id: "controlled", label: "Name is a controlled input with a defined initial value", correct: "FINE AS-IS" },
      { id: "async", label: "If save is async, pending/error handling should be considered", correct: "SHOULD FIX" },
    ],
    explanation: "Set reset to type=button. The label and controlled value are correct; handle async failure/pending according to the save contract.",
  }),
  review({
    id: "validation-derived", concepts: ["reactReview", "reactForms", "reactHooks"], difficulty: "easy", level: 1,
    prompt: "Level 1: email validity is derived and inexpensive. Classify the hook and visible feedback.",
    code: `import { useMemo, useState } from "react";
export function EmailField() {
  const [email, setEmail] = useState("");
  const valid = useMemo(() => email.includes("@"), [email]);
  return <div>
    <label>Email <input type="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
    {!valid && <p role="status">Enter an email address.</p>}
    <button type="button" disabled={!valid}>Continue</button>
  </div>;
}`,
    findings: [
      { id: "memo", label: "Memoizing this inexpensive validation is necessary", correct: "SHOULD FIX" },
      { id: "type", label: "Native email input type is useful", correct: "FINE AS-IS" },
      { id: "label", label: "The field has an associated label", correct: "FINE AS-IS" },
      { id: "state", label: "Validity can be derived directly without duplicated state", correct: "FINE AS-IS" },
    ],
    explanation: "The memo adds no useful value for this cheap check; derive it in render. Native type and label are reasonable; no duplicate valid state is used.",
  }),
  review({
    id: "lifecycle-status", concepts: ["reactReview", "reactRecovery"], difficulty: "medium", level: 2,
    prompt: "Level 2: success and error can both remain true after retry. Classify lifecycle state representation.",
    code: `export function ImportStatus({ retry }: Props) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  async function run() {
    setLoading(true);
    try { await retry(); setSuccess(true); }
    catch { setError("Import failed"); }
    finally { setLoading(false); }
  }
  return <section>
    {loading && <p>Importing…</p>}
    {success && <p role="status">Imported</p>}
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={loading} onClick={run}>Import</button>
  </section>;
}`,
    findings: [
      { id: "state", label: "Independent flags permit stale success and error to coexist", correct: "SHOULD FIX" },
      { id: "clear", label: "Retry should clear prior status before starting", correct: "SHOULD FIX" },
      { id: "finally", label: "Pending clears in finally", correct: "FINE AS-IS" },
      { id: "button", label: "Duplicate click is disabled while pending", correct: "FINE AS-IS" },
    ],
    explanation: "Reset prior outcomes at retry or use a single status union to prevent contradictory states. The pending guard and finally cleanup are good.",
  }),
  review({
    id: "global-modal", concepts: ["reactReview", "reactState"], difficulty: "easy", level: 1,
    prompt: "Level 1: one page owns a modal and its current tab. Classify Redux/Zustand use and the local choice.",
    code: `export function PreferencesPage() {
  const dispatch = useDispatch();
  const open = useSelector(state => state.ui.preferencesOpen);
  const tab = useSelector(state => state.ui.preferencesTab);
  return <main>
    <button onClick={() => dispatch(openPreferences())}>Preferences</button>
    {open && <PreferencesDialog
      tab={tab}
      onTabChange={next => dispatch(setPreferencesTab(next))}
      onClose={() => dispatch(closePreferences())}
    />}
  </main>;
}`,
    findings: [
      { id: "modal", label: "Page-local modal visibility is unnecessarily global", correct: "SHOULD FIX" },
      { id: "tab", label: "A tab used only inside the dialog is a local state candidate", correct: "SHOULD FIX" },
      { id: "global", label: "A global client store is required for every UI value", correct: "FINE AS-IS" },
      { id: "share", label: "Shared state need depends on actual cross-feature ownership", correct: "FINE AS-IS" },
    ],
    explanation: "Keep page-owned modal/tab state local unless other features genuinely need to coordinate it. Redux/Zustand are not mandatory for ordinary UI state.",
  }),
  review({
    id: "memo-callback", concepts: ["reactReview", "reactPerformance", "reactHooks"], difficulty: "easy", level: 1,
    prompt: "Level 1: callback goes to a normal child with no expensive work. Classify the optimization claim.",
    code: `import { useCallback, useState } from "react";
function SaveButton({ onSave }: { onSave: () => void }) {
  return <button type="button" onClick={onSave}>Save</button>;
}
export function Editor() {
  const [saved, setSaved] = useState(false);
  const save = useCallback(() => setSaved(true), []);
  return <section>
    <SaveButton onSave={save} />
    {saved && <p role="status">Saved</p>}
  </section>;
}`,
    findings: [
      { id: "callback", label: "useCallback is needed to prevent the ordinary child from rendering", correct: "SHOULD FIX" },
      { id: "state", label: "Saved is visible state and appropriately uses useState", correct: "FINE AS-IS" },
      { id: "memo", label: "Add React.memo to every child to make callback memoization useful", correct: "FINE AS-IS" },
      { id: "measure", label: "Keep simple until a measured/identity-sensitive need appears", correct: "FINE AS-IS" },
    ],
    explanation: "The normal child renders with its parent; stable callback identity alone does not prevent that. The state is rendered and correct. Keep it simple.",
  }),
  review({
    id: "selection-context", concepts: ["reactReview", "reactState", "reactPerformance"], difficulty: "medium", level: 2,
    prompt: "Level 2: a high-volume list uses one Context for selection and static labels. Classify broad updates and possible boundaries.",
    code: `const ListContext = createContext<ListValue | null>(null);
export function ListProvider({ children }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const value = { selectedId, setSelectedId, title: "Inventory", help: "Choose an item" };
  return <ListContext.Provider value={value}>{children}</ListContext.Provider>;
}
export function Row({ id, name }: RowProps) {
  const list = useContext(ListContext)!;
  return <button aria-pressed={list.selectedId === id}
    onClick={() => list.setSelectedId(id)}>{name}</button>;
}
export function Inventory({ rows }: Props) {
  return <ul>{rows.map(row => <li key={row.id}><Row {...row} /></li>)}</ul>;
}`,
    findings: [
      { id: "context", label: "Every row subscriber can receive updates when the shared provider value changes", correct: "SHOULD FIX" },
      { id: "split", label: "Split or narrow update subscriptions if Profiler confirms this is costly", correct: "MEASURE / OPTIONAL" },
      { id: "memo", label: "React.memo alone blocks context-driven consumer updates", correct: "FINE AS-IS" },
      { id: "keys", label: "Rows use stable IDs as keys", correct: "FINE AS-IS" },
      { id: "aria", label: "aria-pressed communicates selected state", correct: "FINE AS-IS" },
    ],
    explanation: "Context consumers update with provider changes, even when memoized; assess with Profiler and narrow the state/subscription boundary if the list is a real bottleneck. Keys and button semantics are good.",
  }),
  review({
    id: "accessibility-actions", concepts: ["reactReview", "reactForms"], difficulty: "medium", level: 2,
    prompt: "Level 2: visually styled controls are implemented as spans. Classify keyboard/accessibility behavior and keep cosmetic choices aside.",
    code: `export function Toolbar({ onSave, onDelete }: Props) {
  return <div className="toolbar">
    <span className="button primary" onClick={onSave}>Save</span>
    <span className="button danger" onClick={onDelete}>Delete</span>
    <span className="hint">Changes are saved to your account.</span>
  </div>;
}`,
    findings: [
      { id: "save", label: "Save action uses a non-keyboard-operable span", correct: "MUST FIX", critical: true },
      { id: "delete", label: "Delete action needs semantic button behavior and appropriate confirmation", correct: "MUST FIX", critical: true },
      { id: "hint", label: "Static hint span is a problem", correct: "FINE AS-IS" },
      { id: "classes", label: "CSS class naming is a React correctness issue", correct: "FINE AS-IS" },
    ],
    explanation: "Use native buttons for actions so keyboard activation and semantics are provided. A static text span and class naming are not React correctness findings.",
  }),
  review({
    id: "form-errors", concepts: ["reactReview", "reactForms", "reactRecovery"], difficulty: "medium", level: 2,
    prompt: "Level 2: server validation returns field and form errors. Classify the error presentation and pending behavior.",
    code: `export function Signup({ createAccount }: Props) {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try { await createAccount(email); }
    catch { setFormError("Account could not be created."); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit}>
    <label>Email <input value={email} onChange={e => setEmail(e.target.value)} /></label>
    {fieldError && <p>{fieldError}</p>}
    {formError && <p role="alert">{formError}</p>}
    <button disabled={pending}>Create account</button>
  </form>;
}`,
    findings: [
      { id: "field", label: "Field error should be associated with the email input and announced when needed", correct: "SHOULD FIX" },
      { id: "form", label: "Form-level failure is announced with role=alert", correct: "FINE AS-IS" },
      { id: "pending", label: "Pending disables repeated submission", correct: "FINE AS-IS" },
      { id: "reset", label: "Stale field/form errors should be cleared or updated when editing/retrying", correct: "SHOULD FIX" },
      { id: "label", label: "Email has an accessible label", correct: "FINE AS-IS" },
    ],
    explanation: "Associate fieldError using aria-describedby/invalid state, clear stale validation on edit or retry, and retain the useful form alert and pending guard.",
  }),
  review({
    id: "ref-data-fetch", concepts: ["reactReview", "reactHooks", "reactEffects"], difficulty: "medium", level: 2,
    prompt: "Level 2: `ref.current` is used as the render source for fetched data. Classify the state representation and request lifecycle.",
    code: `import { useEffect, useRef } from "react";
export function News({ url }: { url: string }) {
  const items = useRef<NewsItem[]>([]);
  useEffect(() => {
    fetch(url).then(response => response.json()).then(data => {
      items.current = data;
    });
  }, [url]);
  return <ul>
    {items.current.map(item => <li key={item.id}>{item.title}</li>)}
  </ul>;
}`,
    findings: [
      { id: "render", label: "Ref mutation does not schedule the render needed to display fetched items", correct: "MUST FIX", critical: true },
      { id: "state", label: "Rendered fetched data belongs in state or a server-state cache", correct: "SHOULD FIX" },
      { id: "error", label: "Request needs pending/error and HTTP handling", correct: "SHOULD FIX" },
      { id: "deps", label: "url dependency correctly resynchronizes the request", correct: "FINE AS-IS" },
    ],
    explanation: "Use state or a query result for data that drives the rendered list. Refs are for mutable values not used to trigger UI updates; handle request lifecycle too.",
  }),
  review({
    id: "no-overabstract", concepts: ["reactReview", "reactDesign"], difficulty: "easy", level: 1,
    prompt: "Level 1: this section appears once and has no independent state. Classify the proposed extraction.",
    code: `export function Welcome({ name }: { name: string }) {
  return <main>
    <h1>Welcome, {name}</h1>
    <p>Choose a workspace to continue.</p>
    <a href="/workspaces">View workspaces</a>
  </main>;
}`,
    findings: [
      { id: "extract", label: "Extract a custom hook for this static JSX immediately", correct: "FINE AS-IS" },
      { id: "simple", label: "Keep it simple until a reusable behavior/API emerges", correct: "FINE AS-IS" },
      { id: "link", label: "Native anchor has meaningful link text", correct: "FINE AS-IS" },
      { id: "state", label: "Add a global store for the greeting", correct: "FINE AS-IS" },
    ],
    explanation: "There is no stateful logic or demonstrated reuse. Keep a small component straightforward; avoid abstractions for abstraction's sake.",
  }),
  review({
    id: "medium-dashboard", concepts: ["reactReview", "reactEffects", "reactState", "reactRecovery", "reactPerformance"], difficulty: "hard", level: 2,
    prompt: "Level 2: classify correctness and judgment. There is no profiler data and panel state is local to this screen.",
    code: `import { useEffect, useMemo, useState } from "react";
export function Dashboard({ endpoint }: { endpoint: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [count, setCount] = useState(0);
  useEffect(() => {
    fetch(endpoint).then(r => r.json()).then(setRows);
  }, []);
  const visibleCount = useMemo(() => rows.length, []);
  function addTwo() {
    setCount(count + 1);
    setCount(count + 1);
  }
  return <main>
    <h1>Dashboard</h1>
    <button onClick={() => setOpen(true)}>Filters</button>
    {open && <aside><button onClick={() => setOpen(false)}>Close</button></aside>}
    <button onClick={addTwo}>Record two events</button>
    {error && <p role="alert">{error}</p>}
    <p>{visibleCount} rows / {count} events</p>
    <ul>{rows.map((row, index) => <li key={index}>{row.label}</li>)}</ul>
  </main>;
}`,
    findings: [
      { id: "deps", label: "Request fails to update for a changed endpoint and can race", correct: "MUST FIX", critical: true },
      { id: "error", label: "Request lacks pending, HTTP/rejection and retry handling", correct: "SHOULD FIX" },
      { id: "memo", label: "Memoized count has empty dependencies and becomes stale", correct: "MUST FIX", critical: true },
      { id: "counter", label: "Two stale replacement updates produce one increment", correct: "MUST FIX", critical: true },
      { id: "keys", label: "Index key may mismatch reorderable row identity", correct: "SHOULD FIX" },
      { id: "owner", label: "Filter panel visibility is appropriately local", correct: "FINE AS-IS" },
      { id: "callbacks", label: "Inline open/close callbacks are automatically defects", correct: "FINE AS-IS" },
      { id: "refactor", label: "Best correction", correct: "SHOULD FIX" },
    ],
    explanation: "Use a guarded endpoint-dependent request with pending/error recovery; derive rows.length; use functional event updates; key by row ID. Keep the local filter state and simple callbacks. Profile before optimizing.",
  }),
  review({
    id: "a11y-errors", concepts: ["reactReview", "reactForms", "reactRecovery"], difficulty: "medium", level: 2,
    prompt: "Level 2: code review should catch serious form accessibility failures before optional styling improvements.",
    code: `export function PaymentForm() {
  const [number, setNumber] = useState("");
  const [error, setError] = useState("");
  return <form onSubmit={event => {
    event.preventDefault();
    if (number.length < 12) setError("Enter a valid card number");
    else submitPayment(number);
  }}>
    <span>Card number</span>
    <input value={number} onChange={event => setNumber(event.target.value)} />
    {error && <p>{error}</p>}
    <div onClick={() => submitPayment(number)}>Pay</div>
  </form>;
}`,
    findings: [
      { id: "label", label: "Visible text is not associated with the card input", correct: "MUST FIX", critical: true },
      { id: "error", label: "Field error is not associated or announced", correct: "MUST FIX", critical: true },
      { id: "button", label: "Clickable div is not a semantic keyboard-operable submit button", correct: "MUST FIX", critical: true },
      { id: "duplicate", label: "Div can bypass validation and duplicate the submit path", correct: "MUST FIX", critical: true },
      { id: "pending", label: "Async payment needs pending/duplicate-submit and failure recovery", correct: "SHOULD FIX" },
    ],
    explanation: "Associate label and field error, use a native submit button and one validated submit path, and represent pending/failure for the async payment.",
  }),
  review({
    id: "review-prediction", concepts: ["reactReview", "reactIdentity", "reactPerformance"], difficulty: "medium", level: 2,
    prompt: "Level 2: a memoized row gets stable item identity but an unstable callback. Classify relevance and keys.",
    code: `const Row = memo(function Row({ item, onOpen }: Props) {
  return <li><button onClick={() => onOpen(item.id)}>{item.name}</button></li>;
});
export function List({ items }: { items: Item[] }) {
  const [selected, setSelected] = useState("");
  return <ul>
    {items.map(item => <Row key={item.id} item={item}
      onOpen={id => setSelected(id)} />)}
    <output>{selected}</output>
  </ul>;
}`,
    findings: [
      { id: "callback", label: "Fresh callback identity can defeat Row memo bailout", correct: "SHOULD FIX" },
      { id: "keys", label: "Stable item ID key is correct", correct: "FINE AS-IS" },
      { id: "evidence", label: "Need profiling/clear costly work before adding callback caches", correct: "FINE AS-IS" },
      { id: "state", label: "Selected ID is rendered state and appropriately uses useState", correct: "FINE AS-IS" },
    ],
    explanation: "The inline callback is a new identity and prevents default memo bailout, but only optimize if profiling shows this row boundary matters. Item keys and selected state are sound.",
  }),
  review({
    id: "context-store", concepts: ["reactReview", "reactState", "reactDesign"], difficulty: "medium", level: 2,
    prompt: "Level 2: theme and a complex multi-step workflow have different sharing/change patterns. Classify their owners.",
    code: `export function AppState({ children }: Props) {
  const [theme, setTheme] = useState("light");
  const [wizardStep, setWizardStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const value = { theme, setTheme, wizardStep, setWizardStep, answers, setAnswers };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
export function Header() {
  const { theme } = useContext(AppContext);
  return <header className={theme}>Application</header>;
}`,
    findings: [
      { id: "workflow", label: "Large cross-route workflow with complex transitions may need dedicated client-state ownership", correct: "SHOULD FIX" },
      { id: "theme", label: "Shared low-frequency theme can reasonably use Context", correct: "FINE AS-IS" },
      { id: "split", label: "One broad provider may update consumers for unrelated workflow changes", correct: "SHOULD FIX" },
      { id: "query", label: "TanStack Query is the default store for these client answers", correct: "FINE AS-IS" },
    ],
    explanation: "A complex cross-route workflow may justify Redux/Zustand; theme may stay in a narrow Context. Separate server state into a query cache, not this client workflow.",
  }),
  review({
    id: "realistic-catalog", concepts: ["reactReview", "reactEffects", "reactState", "reactIdentity", "reactPerformance", "reactRecovery", "reactForms"], difficulty: "hard", level: 3,
    prompt: "Realistic review: catalog requests, editable rows and status UI. Classify every finding, including acceptable choices.",
    code: `import { createContext, useContext, useEffect, useMemo, useState } from "react";
type Product = { id: string; name: string; price: number };
type CatalogContextValue = { currency: string; products: Product[] };
const CatalogContext = createContext<CatalogContextValue>({
  currency: "USD",
  products: [],
});
function Price({ amount }: { amount: number }) {
  const { currency } = useContext(CatalogContext);
  return <span>{currency} {amount.toFixed(2)}</span>;
}
function ProductRow({ product }: { product: Product }) {
  const [note, setNote] = useState("");
  return <li>
    <h3>{product.name}</h3>
    <Price amount={product.price} />
    <label>Note
      <input value={note} onChange={event => setNote(event.target.value)} />
    </label>
  </li>;
}
function CatalogHeading({ count }: { count: number }) {
  return <header><h2>Available products</h2><p>{count} results</p></header>;
}
function CatalogEmptyState({ query }: { query: string }) {
  return <p>{query ? "No products match this search." : "No products are available."}</p>;
}
export function Catalog({ endpoint }: { endpoint: string }) {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [refreshes, setRefreshes] = useState(0);
  useEffect(() => {
    setLoading(true);
    fetch(endpoint + "?q=" + query)
      .then(response => response.json())
      .then(setProducts)
      .catch(() => setError("Catalog failed"));
    setLoading(false);
  }, [endpoint]);
  const total = useMemo(
    () => products.reduce((sum, product) => sum + product.price, 0),
    [],
  );
  function recordTwoRefreshes() {
    setRefreshes(refreshes + 1);
    setRefreshes(refreshes + 1);
  }
  const contextValue = { currency: "USD", products };
  return <CatalogContext.Provider value={contextValue}>
    <main>
      <h1>Products</h1>
      <CatalogHeading count={products.length} />
      <label>Search
        <input value={query} onChange={event => setQuery(event.target.value)} />
      </label>
      <button type="button" onClick={recordTwoRefreshes}>Refresh twice</button>
      <button type="button" onClick={() => setModalOpen(true)}>Details</button>
      {modalOpen && <aside><button onClick={() => setModalOpen(false)}>Close</button></aside>}
      {loading && <p>Loading products…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && products.length === 0 && <CatalogEmptyState query={query} />}
      <p>{products.length} products / \${total} / {refreshes} refreshes</p>
      <ul>{products.map((product, index) =>
        <ProductRow key={index} product={product} />
      )}</ul>
    </main>
  </CatalogContext.Provider>;
}`,
    findings: [
      { id: "deps", label: "Query is read but omitted from effect dependencies", correct: "MUST FIX", critical: true },
      { id: "race", label: "Obsolete search responses can overwrite newer results", correct: "MUST FIX", critical: true },
      { id: "http", label: "Fetch does not check response.ok", correct: "SHOULD FIX" },
      { id: "loading", label: "Loading is cleared synchronously before request settles", correct: "MUST FIX", critical: true },
      { id: "error", label: "Retry/new success does not clear stale error", correct: "SHOULD FIX" },
      { id: "memo", label: "Total cache has empty dependencies and becomes stale", correct: "MUST FIX", critical: true },
      { id: "counter", label: "Two replacements based on the same captured refreshes value increment once", correct: "MUST FIX", critical: true },
      { id: "keys", label: "Index keys can transfer row note state after reorder", correct: "MUST FIX", critical: true },
      { id: "local", label: "ProductRow owns its note state locally", correct: "FINE AS-IS" },
      { id: "query-cache", label: "Query cache is useful if caching/retries/revalidation are requirements", correct: "MEASURE / OPTIONAL" },
      { id: "provider", label: "Fresh broad provider value can update all context consumers", correct: "SHOULD FIX" },
      { id: "inline", label: "Inline button callbacks are automatically defects", correct: "FINE AS-IS" },
      field({ id: "refactor", label: "Best refactor", options: ["Guard requests; derive totals; use functional updates and product IDs; keep local note/modal state; measure cache/provider changes",
        "React.memo every component and remove all Effects", "Move products, notes, search and modal into TanStack Query"],
        correct: ["Guard requests; derive totals; use functional updates and product IDs; keep local note/modal state; measure cache/provider changes"], tag: "review-refactor", critical: true }),
    ],
    explanation: "Fix the effect lifecycle, status, HTTP and race behavior; derive total (or depend on products), use functional updates and product IDs. Keep row-local note state. Consider query caching/provider splitting only for lifecycle or measured update needs.",
  }),
  review({
    id: "realistic-profile", concepts: ["reactReview", "reactEffects", "reactForms", "reactRecovery", "reactHooks", "reactDesign"], difficulty: "hard", level: 3,
    prompt: "Realistic review: profile identity can change and saving can reject. Find correctness, accessibility, recovery and needless optimization.",
    code: `import { useEffect, useMemo, useState } from "react";
type Profile = { id: string; email: string; bio: string };
type Props = {
  userId: string;
  load: (id: string, signal: AbortSignal) => Promise<Profile>;
  save: (profile: Profile) => Promise<void>;
};
function EmailHint({ email }: { email: string }) {
  return <p>Notifications go to {email}</p>;
}
function ProfileSummary({ profile }: { profile: Profile }) {
  return <aside>
    <h2>Current profile</h2>
    <p>Account: {profile.id}</p>
    <p>Current email: {profile.email}</p>
  </aside>;
}
function isValidEmail(email: string) {
  return email.trim().length > 3 && email.includes("@");
}
export function ProfileEditor({ userId, load, save }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string | undefined>();
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    load(userId, controller.signal).then(next => {
      setProfile(next);
      setEmail(next.email);
      setBio(next.bio);
    }).catch(() => setError("Profile could not be loaded"))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);
  const valid = useMemo(() => isValidEmail(email || ""), [email]);
  if (loading) return <p>Loading profile…</p>;
  async function submit() {
    setSaving(true);
    await save({ id: userId, email: email || "", bio });
    setSaved(true);
    setSaving(false);
  }
  function reset() {
    setEmail(profile?.email);
    setBio(profile?.bio || "");
    setSaved(false);
  }
  return <section>
    <h1>Edit profile</h1>
    {profile && <ProfileSummary profile={profile} />}
    {error && <p role="alert">{error}</p>}
    <form onSubmit={submit}>
      <span>Email</span>
      <input value={email} onChange={event => setEmail(event.target.value)} />
      {!valid && <p>Enter a valid email address.</p>}
      <textarea value={bio} onChange={event => setBio(event.target.value)} />
      <EmailHint email={email || ""} />
      <button disabled={saving}>Save</button>
      <button onClick={reset}>Reset</button>
    </form>
    {saved && <p role="status">Saved</p>}
    <p>Changes are visible to your account team.</p>
    <details><summary>Privacy</summary><p>Profile is visible to your team.</p></details>
  </section>;
}`,
    findings: [
      { id: "hooks", label: "Conditional return occurs before useMemo, violating hook ordering", correct: "MUST FIX", critical: true },
      { id: "deps", label: "Profile effect does not reload when userId changes", correct: "MUST FIX", critical: true },
      { id: "race", label: "Abort signal is passed, but obsolete completion can still set state", correct: "SHOULD FIX" },
      { id: "controlled", label: "Email transitions from undefined to a string", correct: "MUST FIX", critical: true },
      { id: "submit", label: "Submit does not prevent default or validate before saving", correct: "MUST FIX", critical: true },
      { id: "save", label: "Rejected save leaves saving true and has no recovery message", correct: "MUST FIX", critical: true },
      { id: "reset", label: "Reset button defaults to submit", correct: "MUST FIX", critical: true },
      { id: "labels", label: "Email and bio controls have no associated labels", correct: "MUST FIX", critical: true },
      { id: "memo", label: "Memoizing the cheap email validity check", correct: "SHOULD FIX" },
      { id: "preview", label: "EmailHint is a small explicit-prop component", correct: "FINE AS-IS" },
      { id: "privacy", label: "Native details/summary disclosure", correct: "FINE AS-IS" },
      { id: "status", label: "Saved status should be cleared on edits", correct: "SHOULD FIX" },
      field({ id: "refactor", label: "Best refactor", options: ["Keep hooks unconditional; guard profile load; validate/handle save with finally; define and label fields; use type=button for reset",
        "Move hooks into handlers and let Error Boundary catch every request", "Memoize all callbacks and move form fields to a query cache"],
        correct: ["Keep hooks unconditional; guard profile load; validate/handle save with finally; define and label fields; use type=button for reset"], tag: "review-refactor", critical: true }),
    ],
    explanation: "Keep hooks unconditional; guard load completion, depend on userId, initialize email as a string, prevent default/validate, catch save failure and clear saving in finally. Use labels and a non-submit reset. Leave EmailHint/native disclosure as-is.",
  }),
  review({
    id: "realistic-checkout", concepts: ["reactReview", "reactState", "reactEffects", "reactForms", "reactRecovery", "reactDesign"], difficulty: "hard", level: 3,
    prompt: "Realistic review: checkout combines UI state, server state, derived values and mutation handling. Classify all 10 decisions.",
    code: `import { createContext, useContext, useEffect, useState } from "react";
type CartLine = { id: string; title: string; price: number; quantity: number };
type CheckoutValue = { cart: CartLine[]; setCart: (cart: CartLine[]) => void };
const CheckoutContext = createContext<CheckoutValue | null>(null);
function DeliveryNotice({ count }: { count: number }) {
  return <aside>
    <h2>Delivery</h2>
    <p>{count} items are ready for review.</p>
    <p>Delivery options are confirmed before payment.</p>
  </aside>;
}
export function CheckoutProvider({ children }: Props) {
  const [cart, setCart] = useState<CartLine[]>([]);
  useEffect(() => {
    fetch("/api/cart").then(response => response.json()).then(setCart);
  }, []);
  return <CheckoutContext.Provider value={{ cart, setCart }}>
    {children}
  </CheckoutContext.Provider>;
}
export function Checkout() {
  const checkout = useContext(CheckoutContext)!;
  const [coupon, setCoupon] = useState("");
  const [open, setOpen] = useState(false);
  const [total, setTotal] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  useEffect(() => {
    setTotal(checkout.cart.reduce((sum, line) => sum + line.price * line.quantity, 0));
  }, [checkout.cart]);
  function increment(id: string) {
    const line = checkout.cart.find(item => item.id === id)!;
    line.quantity += 1;
    checkout.setCart(checkout.cart);
  }
  async function placeOrder() {
    setPending(true);
    await fetch("/api/orders", { method: "POST", body: JSON.stringify(checkout.cart) });
    setPending(false);
  }
  function applyCoupon() {
    if (coupon.trim()) setError("");
  }
  function toggleTerms() {
    setAcceptedTerms(value => !value);
  }
  function showConfirmation() {
    setConfirmation("Review delivery details before placing your order.");
  }
  return <main>
    <h1>Checkout</h1>
    <DeliveryNotice count={checkout.cart.length} />
    <label>Coupon <input value={coupon} onChange={e => setCoupon(e.target.value)} /></label>
    <button type="button" onClick={applyCoupon}>Apply coupon</button>
    <button type="button" onClick={() => setOpen(true)}>Delivery details</button>
    {open && <aside><button onClick={() => setOpen(false)}>Close</button></aside>}
    <button type="button" onClick={showConfirmation}>Review order</button>
    {confirmation && <p role="status">{confirmation}</p>}
    <label><input type="checkbox" checked={acceptedTerms} onChange={toggleTerms} />
      I accept the purchase terms
    </label>
    {error && <p role="alert">{error}</p>}
    <ul>{checkout.cart.map((line, index) =>
      <li key={index}>{line.title} × {line.quantity}
        <button onClick={() => increment(line.id)}>Add one</button>
      </li>)}
    </ul>
    <p>Total: {total}</p>
    <button disabled={pending} onClick={placeOrder}>Place order</button>
  </main>;
}`,
    findings: [
      { id: "server-cache", label: "API cart cache/lifecycle is hand-managed in broad Context", correct: "SHOULD FIX" },
      { id: "request", label: "Cart load lacks pending/error/HTTP and obsolete-result handling", correct: "SHOULD FIX" },
      { id: "derived", label: "Total is derivable but copied into state through an Effect", correct: "SHOULD FIX" },
      { id: "mutation", label: "Cart line and array are mutated in place", correct: "MUST FIX", critical: true },
      { id: "render", label: "Same array reference is sent after mutation", correct: "MUST FIX", critical: true },
      { id: "race", label: "Order rejection is unhandled and pending remains true", correct: "MUST FIX", critical: true },
      { id: "http", label: "Order response status is not checked", correct: "SHOULD FIX" },
      { id: "keys", label: "Index keys are unsafe if cart lines reorder", correct: "SHOULD FIX" },
      { id: "local", label: "Coupon and details visibility are appropriately local UI state", correct: "FINE AS-IS" },
      { id: "terms", label: "Placing an order is not gated by the visible terms acceptance", correct: "MUST FIX", critical: true },
      { id: "boundary", label: "A small checkout component must be split into many hooks immediately", correct: "FINE AS-IS" },
      field({ id: "refactor", label: "Best refactor", options: ["Use immutable cart updates; derive total; use query cache for server cart if lifecycle needs it; handle mutation recovery and terms",
        "Put modal and coupon in a query cache and wrap every row in memo", "Keep in-place mutation but call setCart twice"],
        correct: ["Use immutable cart updates; derive total; use query cache for server cart if lifecycle needs it; handle mutation recovery and terms"], tag: "review-refactor", critical: true }),
    ],
    explanation: "Use immutable cart updates and stable line IDs; derive total directly. Query cache can own server cart lifecycle. Handle HTTP/rejection/pending recovery for both requests. Coupon/modal remain local; extract only when boundaries help.",
  }),
  review({
    id: "realistic-search", concepts: ["reactReview", "reactEffects", "reactPerformance", "reactRecovery", "reactDesign"], difficulty: "hard", level: 3,
    prompt: "Realistic review: a search page works but has possible race, unnecessary cache and boundary decisions. Distinguish MUST/SHOULD from fine.",
    code: `import { memo, useEffect, useMemo, useState } from "react";
type Result = { id: string; title: string; summary: string; score: number };
const ResultRow = memo(function ResultRow({ result, onOpen }: Props) {
  return <article>
    <h2>{result.title}</h2>
    <p>{result.summary}</p>
    <button type="button" onClick={() => onOpen(result.id)}>Open</button>
  </article>;
});
export function SearchPage({ endpoint }: { endpoint: string }) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeId, setActiveId] = useState("");
  const [category, setCategory] = useState("all");
  const [sortOrder, setSortOrder] = useState("score");
  const [page, setPage] = useState(1);
  useEffect(() => {
    if (!term) {
      setResults([]);
      return;
    }
    setLoading(true);
    fetch(endpoint + "?q=" + encodeURIComponent(term))
      .then(response => response.json())
      .then(setResults)
      .catch(() => setError("Search failed"))
      .finally(() => setLoading(false));
  }, [endpoint, term]);
  const sorted = useMemo(() => results.toSorted((a, b) => b.score - a.score), []);
  function open(id: string) { setActiveId(id); }
  function changeCategory(value: string) {
    setCategory(value);
    setPage(1);
  }
  function changeSort(value: string) {
    setSortOrder(value);
    setPage(1);
  }
  function clearSearch() {
    setTerm("");
    setActiveId("");
  }
  return <main>
    <h1>Search</h1>
    <label>Search terms
      <input value={term} onChange={event => setTerm(event.target.value)} />
    </label>
    <label>Category
      <select value={category} onChange={event => changeCategory(event.target.value)}>
        <option value="all">All categories</option>
        <option value="docs">Documentation</option>
      </select>
    </label>
    <label>Order
      <select value={sortOrder} onChange={event => changeSort(event.target.value)}>
        <option value="score">Best match</option>
        <option value="recent">Most recent</option>
      </select>
    </label>
    <button type="button" onClick={clearSearch}>Clear search</button>
    {loading && <p>Searching…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && sorted.length === 0 && <p>No results.</p>}
    <section aria-label="Search results">
      {sorted.map(result => <ResultRow key={result.id} result={result} onOpen={open} />)}
    </section>
    {activeId && <aside><p>Selected {activeId}</p></aside>}
    <nav aria-label="Search result pages">
      <button type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</button>
      <span>Page {page}</span>
      <button type="button" onClick={() => setPage(value => value + 1)}>Next</button>
    </nav>
  </main>;
}`,
    findings: [
      { id: "race", label: "Prior search may publish after a later term's result", correct: "MUST FIX", critical: true },
      { id: "http", label: "Non-OK response is accepted as a valid result", correct: "SHOULD FIX" },
      { id: "error", label: "Old error is not reset when a new term starts", correct: "SHOULD FIX" },
      { id: "memo", label: "Sorted result memo has empty dependencies", correct: "MUST FIX", critical: true },
      { id: "sort", label: "Sorting can be performed during render unless profiling supports a memo", correct: "SHOULD FIX" },
      { id: "identity", label: "Rows have stable result IDs as keys", correct: "FINE AS-IS" },
      { id: "button", label: "Open action is a native button", correct: "FINE AS-IS" },
      { id: "label", label: "Search input has a visible label", correct: "FINE AS-IS" },
      { id: "boundary", label: "A separate row component is an acceptable boundary", correct: "FINE AS-IS" },
      { id: "memo-child", label: "Memo row is automatically harmful and must be removed", correct: "MEASURE / OPTIONAL" },
      { id: "filters", label: "Category and sort controls currently do not affect the request/results", correct: "MUST FIX", critical: true },
      { id: "page", label: "Page control updates local state but does not request/display a page", correct: "SHOULD FIX" },
      { id: "empty", label: "Clearing the term can leave stale pending/error state or let obsolete work publish", correct: "SHOULD FIX" },
      field({ id: "refactor", label: "Best refactor", options: ["Apply filters/paging; guard requests; check HTTP status; derive sort with correct deps; preserve accessible controls",
        "Memoize everything and suppress dependency warnings", "Replace labels and buttons with custom spans"],
        correct: ["Apply filters/paging; guard requests; check HTTP status; derive sort with correct deps; preserve accessible controls"], tag: "review-refactor", critical: true }),
    ],
    explanation: "Guard obsolete requests, check HTTP status and clear error; derive sorted from results (memo only if justified). Existing labels, buttons, keys and component boundary are good. Profile before deciding whether React.memo pays off.",
  }),
];

export const reactExpandedQuestions: Question[] = [
  ...prediction,
  ...reconstruction,
  ...debugging,
  ...reviews,
];
