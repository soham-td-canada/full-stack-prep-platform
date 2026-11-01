import type { Concept, Difficulty, Mode, Question, QuestionType, StructuredField } from "@/lib/model";
import { reactExpandedQuestions } from "./react-expanded-questions";

const text = (id: string, label: string, ...accepted: string[]): StructuredField => ({ id, label, kind: "text", accepted });
const exactValue = (id: string, label: string, ...accepted: string[]): StructuredField => ({ id, label, kind: "text", accepted, exact: true });
const select = (id: string, label: string, options: string[], correct: string[], multiple = false,
  misconceptionTag?: string, severity?: "critical"): StructuredField =>
  ({ id, label, kind: "select", choices: options.map((label) => ({ id: label, label })), correct, multiple, misconceptionTag, severity });
const one = (label: string, options: string[], correct: string, tag?: string) =>
  select("answer", label, options, [correct], false, tag);

function exercise(id: string, mode: Mode, type: QuestionType, concepts: Concept[], difficulty: Difficulty,
  prompt: string, fields: StructuredField[], explanation: string, code?: string,
  extra: Partial<Pick<Question, "depth" | "reviewLevel" | "reference">> = {}): Question {
  return {
    id: `react-${id}`, module: "react", mode, concepts, difficulty, prompt, code,
    structured: { type, fields }, depth: "core", ...extra,
    answer: fields.map((field) => `${field.label}: ${field.kind === "text" ? field.accepted[0] : field.correct.join(", ")}`).join("\n"),
    explanation, misconception: { prompt: `Recall the mental model: ${prompt}`, answer: explanation },
  };
}

const priorities = ["MUST FIX", "SHOULD FIX", "MEASURE / OPTIONAL", "FINE AS-IS"];
const judgment = (id: string, label: string, correct: string, critical = false) =>
  select(id, label, priorities, [correct], false, critical ? `review-${id}` : undefined, critical ? "critical" : undefined);
const stateCategories = ["LOCAL STATE", "CONTEXT", "REDUX / ZUSTAND", "TANSTACK QUERY"];
const hookRoles = ["Synchronize with an external system", "Persist mutable data without rendering",
  "Memoize a calculated value", "Memoize a function reference", "Subscribe to shared context", "Schedule a state update"];

const fundamentals = `import { useEffect, useState } from "react";
type Item = { id: string; name: string };
export function Search({ items }: { items: Item[] }) {
  const [query, setQuery] = useState("");
  const [filtered, setFiltered] = useState(items);
  useEffect(() => { setFiltered(items.filter(i => i.name.includes(query))); }, []);
  return <section>
    <input value={query} onChange={e => setQuery(e.target.value)} />
    <div onClick={() => setQuery("")}>Clear</div>
    <ul>{filtered.map((item, index) => <li key={index}>{item.name}<input /></li>)}</ul>
  </section>;
}`;

const senior = `import { createContext, useEffect, useMemo, useState } from "react";
type Product = { id: string; name: string };
export const CatalogContext = createContext({ modalOpen: false, products: [] as Product[] });
export function Catalog({ url }: { url: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  useEffect(() => {
    fetch(url).then(r => r.json()).then(setProducts);
  }, [url]);
  const count = useMemo(() => products.length, [products]);
  return <CatalogContext.Provider value={{ modalOpen, products }}>
    <button onClick={() => setModalOpen(true)}>Open details</button>
    <p>{count} products</p>
    {products.map(p => <article key={p.id}>{p.name}</article>)}
    {modalOpen && <aside><button onClick={() => setModalOpen(false)}>Close</button></aside>}
  </CatalogContext.Provider>;
}`;

const realistic = `import {
  createContext, useContext, useEffect, useMemo, useState
} from "react";

type Product = { id: string; name: string; price: number };
type CatalogValue = {
  products: Product[];
  selectedId: string | null;
  currency: string;
};
const CatalogContext = createContext<CatalogValue>({
  products: [], selectedId: null, currency: "USD"
});

function Price({ amount }: { amount: number }) {
  const { currency } = useContext(CatalogContext);
  return <span>{currency} {amount.toFixed(2)}</span>;
}

function ProductRow({ product, onSelect }: {
  product: Product;
  onSelect: (id: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <li>
      <h3>{product.name}</h3>
      <Price amount={product.price} />
      <input value={note} onChange={e => setNote(e.target.value)} />
      <span onClick={() => onSelect(product.id)}>Select</span>
    </li>
  );
}

export function ProductSearch({ endpoint }: { endpoint: string }) {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(endpoint + "?q=" + query)
      .then(response => response.json())
      .then(next => {
        setProducts(next);
        setCount(next.length);
      })
      .catch(() => setError("Search failed"));
  }, [endpoint]);

  const total = useMemo(
    () => products.reduce((sum, product) => sum + product.price, 0),
    []
  );

  function refreshCount() {
    setCount(count + 1);
    setCount(count + 1);
  }

  return (
    <CatalogContext.Provider value={{ products, selectedId, currency: "USD" }}>
      <section>
        <h2>Products</h2>
        <input value={query} onChange={e => setQuery(e.target.value)} />
        <button onClick={refreshCount}>Record two refreshes</button>
        <p>{count} products / Total: {total}</p>
        {error && <p role="alert">{error}</p>}
        <ul>
          {products.map((product, index) => (
            <ProductRow key={index} product={product} onSelect={setSelectedId} />
          ))}
        </ul>
        {selectedId && <p>Selected: {selectedId}</p>}
      </section>
    </CatalogContext.Provider>
  );
}`;

const formReview = `import { useEffect, useMemo, useState } from "react";

type Profile = { id: string; email: string; bio: string };
type Props = {
  userId: string;
  save: (userId: string, email: string, bio: string) => Promise<void>;
};

function EmailPreview({ email }: { email: string }) {
  return <p>Notifications will go to {email}</p>;
}

export function ProfileEditor({ userId, save }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string | undefined>(undefined);
  const [bio, setBio] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/users/" + userId)
      .then(response => response.json())
      .then((next: Profile) => {
        setProfile(next);
        setEmail(next.email);
        setBio(next.bio);
      });
  }, []);

  if (!profile) return <p>Loading profile...</p>;

  const emailValid = useMemo(
    () => Boolean(email && email.includes("@")),
    [email]
  );

  async function submit() {
    setSaving(true);
    await save(userId, email || "", bio);
    setSaved(true);
    setSaving(false);
  }

  function reset() {
    setEmail(profile?.email);
    setBio(profile?.bio || "");
    setSaved(false);
  }

  return (
    <section>
      <h2>Edit profile</h2>
      {error && <p role="alert">{error}</p>}
      <form onSubmit={submit}>
        <input value={email} onChange={e => setEmail(e.target.value)} />
        {!emailValid && <p>Enter a valid email</p>}
        <textarea value={bio} onChange={e => setBio(e.target.value)} />
        <EmailPreview email={email || ""} />
        <button disabled={saving}>Save</button>
        <button onClick={reset}>Reset</button>
      </form>
      {saved && <p role="status">Saved</p>}
      <p>Your profile is visible to your team.</p>
      <details>
        <summary>Privacy</summary>
        <p>Contact support to delete your account.</p>
      </details>
    </section>
  );
}

export function ProfilePage(props: Props) {
  return (
    <main>
      <h1>Account settings</h1>
      <ProfileEditor {...props} />
    </main>
  );
}`;

export const reactQuestions: Question[] = [
  exercise("batch", "prediction", "prediction", ["reactRender", "reactHooks"], "easy",
    "After this click, what count appears? Assume a normal React event, no Strict Mode, and an initial count of 0.",
    [exactValue("count", "Committed count", "1")],
    "Both replacements read the same render's count (0). React batches them into one committed value, 1. Functional updaters would compose.",
    "const [count, setCount] = useState(0);\n<button onClick={() => {\n  setCount(count + 1);\n  setCount(count + 1);\n}}>Add</button>"),
  exercise("parent", "prediction", "prediction", ["reactRender", "reactPerformance"], "medium",
    "Parent updates unrelated state. Child is not memoized, has unchanged props, and no compiler optimization is enabled. Does Child render?",
    [one("Child renders?", ["Yes", "No"], "Yes", "parent-render")],
    "A normal child is rendered when its parent renders. Unchanged props alone do not skip it. Rendering does not imply a DOM mutation.",
    "function Parent() {\n  const [count, setCount] = useState(0);\n  return <><button onClick={() => setCount(c => c + 1)}>{count}</button><Child label=\"Stable\" /></>;\n}"),
  exercise("ref", "prediction", "trueFalse", ["reactHooks", "reactRender"], "easy",
    "Changing ref.current schedules a React render. Select truth and the correction.",
    [select("truth", "Truth", ["True", "False"], ["False"], false, "ref-renders"),
      select("reason", "Correction", ["Refs persist mutable values without scheduling renders", "Refs are state", "Refs are reset on every render"], ["Refs persist mutable values without scheduling renders"])],
    "A ref persists between renders; mutating current does not schedule a render. Use state for values that should update the displayed UI.",
    "const clicks = useRef(0);\nfunction handleClick() { clicks.current += 1; }"),
  exercise("closure", "prediction", "prediction", ["reactEffects", "reactHooks"], "medium",
    "The component commits count = 0, then count = 2. What does the saved callback log?",
    [exactValue("value", "Logged value", "0")],
    "An empty dependency array keeps the callback from the initial render. It captures that render's count; use dependencies or a functional updater when updating state.",
    "const [count, setCount] = useState(0);\nconst saved = useCallback(() => console.log(count), []);\n// Later: setCount(2), commit, then saved()."),
  exercise("key", "prediction", "prediction", ["reactIdentity", "reactForms"], "medium",
    "Editor has local draft state. What happens when its key changes from user A to user B?",
    [one("Draft state", ["Preserved", "Reset by unmount and new mount", "Copied to B"], "Reset by unmount and new mount")],
    "A changed key means a new identity. React unmounts the old instance and mounts a fresh one, including new local state and effect setup.",
    "<Editor key={user.id} initialEmail={user.email} />"),
  exercise("context", "prediction", "prediction", ["reactRender", "reactState", "reactPerformance"], "hard",
    "An unrelated provider render creates a new value object. Which memoized components receive a context-driven update?",
    [select("consumers", "Select all context subscribers", ["ThemeBadge reads ThemeContext", "Toolbar reads ThemeContext", "Logo does not read ThemeContext"],
      ["ThemeBadge reads ThemeContext", "Toolbar reads ThemeContext"], true, "context-identity")],
    "Context compares provider values with Object.is. A new object changes identity; all subscribers to that context receive updates, even through memo. Non-subscribers do not get a context-driven update.",
    "<ThemeContext.Provider value={{ theme: 'dark' }}>\n  <MemoThemeBadge /><MemoToolbar /><MemoLogo />\n</ThemeContext.Provider>"),
  exercise("race", "prediction", "prediction", ["reactEffects", "reactRecovery"], "hard",
    "Request A starts, then B starts. B resolves first, A resolves last. Without cleanup or a guard, what is displayed last?",
    [one("Last result", ["A", "B", "Neither"], "A", "request-race")],
    "Completion order wins without a guard. Abort or ignore obsolete requests during cleanup; also handle network errors and non-OK responses.",
    "useEffect(() => {\n  fetch('/api/search?q=' + query).then(r => r.json()).then(setResults);\n}, [query]);"),
  exercise("xyz", "reconstruction", "multiBlank", ["reactHooks", "reactRender"], "easy",
    "Changing X does not schedule a render. X stores mutable data outside Y updates. Z memoizes a calculated value, not component renders.",
    [{ ...text("X", "X", "ref.current", "useRef.current", "ref current"), misconceptionTag: "ref-renders" },
      text("Y", "Y", "state", "React state"),
      { ...text("Z", "Z", "useMemo"), misconceptionTag: "memo-renders" }],
    "Refs persist mutable values, state updates schedule rendering, and useMemo caches a calculated value. It does not prevent component renders."),
  exercise("hook-match", "reconstruction", "matching", ["reactHooks", "reactEffects", "reactState"], "medium",
    "Match each hook to its primary role. Complete every match.",
    ["useRef", "useMemo", "useCallback", "useEffect", "useContext", "useState"].map((hook, index) =>
      select(hook, hook, hookRoles, [hookRoles[[1, 2, 3, 0, 4, 5][index]]])),
    "Effects synchronize external systems, not ordinary derivations. Memo hooks cache values/references at a cost; use them for meaningful measured work or identity needs. Context subscribes; state schedules updates."),
  exercise("reconciliation", "reconstruction", "conceptInference", ["reactIdentity"], "easy",
    "React compares previous and next element trees. Stable keys preserve sibling identity. Identify the missing concept.",
    [text("concept", "Concept", "reconciliation", "React reconciliation")],
    "Reconciliation determines how the UI should change. Rendering/reconciliation computes a result; commit applies host changes."),
  exercise("provider-reason", "reconstruction", "reasonInference", ["reactState", "reactPerformance", "reactRender"], "medium",
    "A: useContext subscribes to a provider. B: subscribers update when its value changes. C: why does recreating an equivalent object trigger this?",
    [text("C", "Missing reason C", "provider value identity changes", "new object reference", "value reference changes", "new reference", "Object.is comparison fails")],
    "Equivalent contents are not equal references. Split contexts or stabilize a value when justified; memoizing consumers does not block context updates."),
  exercise("state-categories", "reconstruction", "categorization", ["reactState", "reactForms", "reactDesign"], "medium",
    "Choose the simplest owner for each state. Theme is low-frequency shared configuration; workflow is complex cross-feature client state.",
    [select("modal", "Modal open", stateCategories, ["LOCAL STATE"], false, "query-ui-state"),
      select("input", "Input value", stateCategories, ["LOCAL STATE"]),
      select("theme", "Theme", stateCategories, ["CONTEXT"]),
      select("workflow", "Complex shared client workflow", stateCategories, ["REDUX / ZUSTAND"]),
      select("products", "Fetched product list and revalidation", stateCategories, ["TANSTACK QUERY"]),
      select("mutation", "Server mutation with retries and cache invalidation", stateCategories, ["TANSTACK QUERY"])],
    "Keep UI state local unless sharing requires otherwise. Context suits shared low-frequency metadata. Redux/Zustand manage complex shared client state. TanStack Query manages server state, cache, mutations, retries and refetching, not general UI state."),
  exercise("fiber-order", "reconstruction", "ordering", ["reactIdentity", "reactRender"], "medium",
    "Order the high-level successful update flow (not individual hook/event timing).",
    [1, 2, 3].map((step, i) => select(String(step), `Step ${step}`,
      ["Commit", "State update scheduled", "Render / reconciliation"], [["State update scheduled", "Render / reconciliation", "Commit"][i]])),
    "Fiber is React's internal unit-of-work architecture. Rendering can be split and prioritized; render/reconciliation is distinct from commit. Not every attempted render commits."),
  exercise("keys-explanation", "reconstruction", "bestExplanation", ["reactIdentity", "reactReview"], "medium",
    "Why can index keys be unsafe when editable rows reorder?",
    [one("Best explanation", ["Numeric keys are prohibited", "Index keys always cause extra renders",
      "Existing component state can follow the wrong logical item", "Index keys disable reconciliation"],
    "Existing component state can follow the wrong logical item")],
    "Keys represent sibling identity. Index keys can associate existing state with a different item after reorder. Stable item IDs preserve logical identity; index keys are not universally forbidden."),
  exercise("memo-inference", "reconstruction", "conceptInference", ["reactPerformance", "reactHooks"], "medium",
    "A = useMemo. B = expensive calculation with stable dependencies. Identify C: what is reused?",
    [{ ...text("C", "C", "memoized computed value", "calculated value", "computed value", "cached value"), misconceptionTag: "memo-renders" }],
    "useMemo reuses a calculated value when dependencies are unchanged. It does not stop rendering. Measure first: cheap calculations often do not justify cache and dependency costs."),
  exercise("recovery-match", "reconstruction", "matching", ["reactRecovery", "reactDesign"], "medium",
    "Match each failure/loading situation to its appropriate recovery boundary.",
    [select("render", "Descendant render throws", ["Error Boundary", "Event handler try/catch", "Suspense", "Per-widget error UI"], ["Error Boundary"]),
      select("event", "User-triggered async save rejects", ["Error Boundary", "Event handler try/catch", "Suspense", "Per-widget error UI"], ["Event handler try/catch"]),
      select("lazy", "Lazy component pending", ["Error Boundary", "Event handler try/catch", "Suspense", "Per-widget error UI"], ["Suspense"]),
      select("partial", "Optional recommendations request fails", ["Error Boundary", "Event handler try/catch", "Suspense", "Per-widget error UI"], ["Per-widget error UI"])],
    "Boundaries handle descendant render/lifecycle failures, not every JS error or ordinary async rejection. Suspense shows fallbacks for supported suspending resources (such as lazy), not arbitrary effect fetches. Catch async errors explicitly, offer retry, and preserve usable parts of the screen."),
  exercise("form-blanks", "reconstruction", "multiBlank", ["reactForms", "reactHooks"], "easy",
    "In a controlled form, X is the source of truth, Y updates it on typing, and submission must Z the default browser navigation.",
    [text("X", "X", "state", "React state"), text("Y", "Y", "onChange", "change handler"),
      text("Z", "Z", "prevent", "preventDefault", "event.preventDefault")],
    "Controlled inputs have a defined value and onChange. Validate before saving, prevent default navigation, display pending/errors, and disable duplicate submissions. Uncontrolled inputs use DOM values/defaultValue instead."),
  exercise("composition", "reconstruction", "bestExplanation", ["reactDesign", "reactReview"], "medium",
    "Several dialogs share layout but have different bodies. What is the strongest starting API?",
    [one("Best API", ["One boolean prop for every body variant", "A small compositional shell accepting children and explicit actions",
      "A global store for every dialog detail", "Extract a hook for every JSX block"], "A small compositional shell accepting children and explicit actions")],
    "Composition keeps APIs explicit and flexible without boolean explosions. Custom hooks share reusable stateful logic, not UI or automatically shared state. Extract only a demonstrated reusable concern."),
  exercise("fiber-model", "reconstruction", "bestExplanation", ["reactIdentity", "reactPerformance"], "medium",
    "Which is the strongest interview-level Fiber model?",
    [one("Best model", ["A second DOM tree that always commits every render",
      "An internal unit-of-work architecture that can split and prioritize rendering work before a separate commit",
      "A hook that prevents all child renders", "A promise cache for every fetch"],
    "An internal unit-of-work architecture that can split and prioritize rendering work before a separate commit")],
    "Fiber organizes internal work so React can split rendering into units and prioritize it. Render/reconciliation is distinct from commit. Lane implementation details are not required."),
  exercise("custom-hook-state", "prediction", "prediction", ["reactDesign", "reactState", "reactHooks"], "medium",
    "Two components call useToggle. A toggles its value. What happens to B's value?",
    [one("B value", ["It toggles too", "It stays false", "Both values reset"], "It stays false")],
    "A custom hook reuses stateful logic; each call has its own state. Sharing state requires lifting ownership or an appropriate shared store/context. Do not introduce shared state just to reuse logic.",
    "function useToggle() {\n  const [on, setOn] = useState(false);\n  return { on, toggle: () => setOn(value => !value) };\n}\n// A and B each call useToggle independently."),
  exercise("debug-race", "debug", "debug", ["reactEffects", "reactRecovery"], "medium",
    "Choose the root cause and smallest robust fix. The endpoint changes rapidly.",
    [select("cause", "Root cause", ["Obsolete requests can overwrite current results", "fetch must be in Redux", "useEffect always blocks painting"],
      ["Obsolete requests can overwrite current results"], false, "request-race", "critical"),
      select("fix", "Best fix", ["Add a request cleanup/ignore guard and loading/error handling", "Wrap setData in useCallback", "Remove dependencies"],
        ["Add a request cleanup/ignore guard and loading/error handling"])],
    "Problem: completions race. Reason: old requests still publish. Smallest fix: abort/ignore obsolete requests, check response.ok, and handle pending/error states. TanStack Query is useful when caching/retries/revalidation are needed.",
    "useEffect(() => {\n  fetch(url).then(r => r.json()).then(setData);\n}, [url]);"),
  exercise("debug-loop", "debug", "debug", ["reactEffects", "reactHooks", "reactPerformance"], "medium",
    "Select all real problems, then choose the smallest fix.",
    [select("issues", "Problems", ["New options identity on each render", "Effect stores derivable state", "Inline callbacks are always bugs", "useState is prohibited"],
      ["New options identity on each render", "Effect stores derivable state"], true, "effect-derived-state"),
      select("fix", "Smallest fix", ["Compute filtered during render; measure before memoizing", "Memoize every function", "Use a global store"],
        ["Compute filtered during render; measure before memoizing"])],
    "The new options object retriggers the effect, whose new array schedules another render. Derive filtered from items/query during render. Memoize only if profiling identifies meaningful cost.",
    "const options = { query };\nconst [filtered, setFiltered] = useState(items);\nuseEffect(() => {\n  setFiltered(items.filter(item => item.name.includes(options.query)));\n}, [items, options]);"),
  exercise("debug-cleanup", "debug", "debug", ["reactEffects", "reactHooks"], "hard",
    "Fix this interval. Select all required changes.",
    [select("fixes", "Required fixes", ["Use setCount(c => c + 1)", "Return cleanup that clears the interval", "Memoize count", "Move interval to render"],
      ["Use setCount(c => c + 1)", "Return cleanup that clears the interval"], true, "effect-cleanup", "critical")],
    "The callback captures the initial count and the interval survives unmount. A functional updater avoids stale increments; return () => clearInterval(id). Effects must clean up external subscriptions/timers.",
    "useEffect(() => {\n  const id = setInterval(() => setCount(count + 1), 1000);\n}, []);"),
  exercise("debug-form", "debug", "debug", ["reactForms", "reactRecovery"], "medium",
    "Choose the required fixes for this controlled submission. Assume save may reject.",
    [select("issues", "Select all required fixes", ["Initialize email to an empty string", "Prevent default and validate before saving",
      "Catch rejection and expose pending/error UI", "Add useMemo to email", "Store email in TanStack Query"],
    ["Initialize email to an empty string", "Prevent default and validate before saving", "Catch rejection and expose pending/error UI"], true, "controlled-form", "critical")],
    "undefined to a string switches uncontrolled to controlled. Initialize to ''. Prevent default, validate, await/catch save and show pending/errors. UI form state is not server-cache state.",
    "const [email, setEmail] = useState<string>();\nreturn <form onSubmit={() => save(email)}>\n  <input value={email} onChange={e => setEmail(e.target.value)} />\n  <button>Save</button>\n</form>;"),
  exercise("debug-state", "debug", "debug", ["reactState", "reactDesign", "reactReview"], "medium",
    "A new app puts modal visibility and product fetch retry/cache flags in Redux. Choose the simplest state-placement refactor.",
    [one("Best refactor", ["Keep modal local; use TanStack Query for product server state",
      "Put everything in Context", "Use TanStack Query for modal visibility", "Extract a custom hook for every field"],
    "Keep modal local; use TanStack Query for product server state", "query-ui-state")],
    "Local UI state belongs near its owner. A query cache owns fetched server data and lifecycle. Redux/Zustand are suitable for genuinely complex shared client workflows; do not duplicate server cache flags without a need.",
    "const modalOpen = useSelector(s => s.catalog.modalOpen);\nconst products = useSelector(s => s.catalog.products);\nconst retries = useSelector(s => s.catalog.retries);\n// No cross-feature client workflow requires sharing these values."),
  exercise("debug-profiler", "debug", "debug", ["reactPerformance", "reactRender"], "hard",
    "Typing feels slow. Child renders often, but you have no timing evidence. Choose the next step and what to leave alone initially.",
    [select("next", "Next step", ["Profile commits and expensive components", "Memoize every component", "Rewrite with a global store"], ["Profile commits and expensive components"]),
      select("leave", "Leave alone initially", ["Cheap inline event callbacks", "Confirmed expensive repeated work", "Incorrect keys"], ["Cheap inline event callbacks"])],
    "Render frequency alone is not a bottleneck. DevTools Profiler identifies costly commits and components. Move state boundaries or memoize meaningful work when evidence warrants it; unstable props can defeat memo, and memoization has costs.",
    "function Filter() {\n  const [query, setQuery] = useState('');\n  return <><input value={query} onChange={e => setQuery(e.target.value)} /><Results query={query} /></>;\n}"),
  exercise("review-basic", "codeReview", "codeReview",
    ["reactReview", "reactEffects", "reactForms", "reactIdentity", "reactDesign"], "easy",
    "Level 1: classify four real problems and one acceptable choice. Stateful rows may reorder.",
    [judgment("derived", "Lines 5-6: filtered state and mount-only effect", "MUST FIX", true),
      judgment("clear", "Line 9: clickable div", "MUST FIX", true),
      judgment("keys", "Line 10: index keys with editable rows", "MUST FIX", true),
      judgment("labels", "Lines 8/10: inputs without accessible labels", "MUST FIX", true),
      judgment("inline", "Line 8: inline onChange", "FINE AS-IS")],
    "Derive filtered on render, use labeled inputs and a real Clear button, and use item IDs. The inline handler is fine without measured identity-sensitive work.",
    fundamentals, { reviewLevel: 1,
      reference: "const filtered = items.filter(i => i.name.includes(query));\n<label>Search <input value={query} onChange={e => setQuery(e.target.value)} /></label>\n<button type=\"button\" onClick={() => setQuery('')}>Clear</button>\n// Render rows with key={item.id} and label each row input." }),
  exercise("review-senior", "codeReview", "codeReview",
    ["reactReview", "reactState", "reactRecovery", "reactPerformance", "reactDesign"], "hard",
    "Level 2: classify the decisions. There are no expensive calculations or profiled bottlenecks. Modal state has no external owner.",
    [judgment("race", "Lines 7-9: request lacks obsolete-result protection", "MUST FIX", true),
      judgment("http", "Line 8: no response.ok or rejection handling", "MUST FIX", true),
      judgment("loading", "Lines 12-16: no pending/retry/empty UI", "SHOULD FIX"),
      judgment("owner", "Line 11: modal state exposed through broad Context", "SHOULD FIX"),
      judgment("cache", "Lines 5-9: query cache if cache/retries/revalidation are needed", "MEASURE / OPTIONAL"),
      judgment("count", "Line 10: memoizing array length", "SHOULD FIX"),
      judgment("inline", "Lines 12/15: inline button handlers", "FINE AS-IS"),
      judgment("keys", "Line 14: stable product ID keys", "FINE AS-IS"),
      judgment("context", "Line 11: stabilize/split provider after measuring broad updates", "MEASURE / OPTIONAL")],
    "Guard async results, check HTTP status, and expose errors with retry. Keep modal state local and remove pointless length memoization. Query caching and provider optimization depend on actual lifecycle/performance needs. Stable keys and cheap inline callbacks are already good.",
    senior, { reviewLevel: 2 }),
  exercise("review-catalog", "codeReview", "codeReview", ["reactReview", "reactEffects", "reactState",
    "reactPerformance", "reactIdentity", "reactRecovery", "reactDesign"], "hard",
    "Level 3: review this catalog. Products can reorder; users may type rapidly. Classify all findings, including acceptable code, and choose a refactor.",
    [judgment("deps", "Effect: query omitted from dependencies", "MUST FIX", true),
      judgment("race", "Effect: obsolete responses can overwrite new results", "MUST FIX", true),
      judgment("http", "Fetch: HTTP failure is parsed as success", "MUST FIX", true),
      judgment("memo", "Total: memo has empty dependencies", "MUST FIX", true),
      judgment("counter", "refreshCount: two stale replacements add only one", "MUST FIX", true),
      judgment("keys", "Rows: index keys can move local notes to another product", "MUST FIX", true),
      judgment("controls", "Note/Search inputs lack labels and Select is a span", "MUST FIX", true),
      judgment("derived", "Count: duplicate derived product count also used as refresh counter", "SHOULD FIX"),
      judgment("recovery", "No pending/empty/retry UI; stale error survives later success", "SHOULD FIX"),
      judgment("context", "Price subscribes to a broad, newly recreated context", "SHOULD FIX"),
      judgment("cache", "Use query caching if cache/revalidation/retries are requirements", "MEASURE / OPTIONAL"),
      judgment("inline", "Row note: inline onChange handler", "FINE AS-IS"),
      judgment("local", "Row note: local useState ownership", "FINE AS-IS"),
      select("refactor", "Best refactor", ["Guard requests and errors; derive totals/count; separate refresh state; stable keys and labeled controls; narrow Context",
        "React.memo everything and keep the existing effects", "Move all form and server state to Redux"],
      ["Guard requests and errors; derive totals/count; separate refresh state; stable keys and labeled controls; narrow Context"], false, "review-refactor", "critical")],
    "Fix correctness/accessibility before optimization: include query, ignore obsolete requests, check response.ok, reset/display errors, and provide retry/pending states. Derive totals/count (or memoize with products after measurement), keep a separate functional refresh counter, use product.id keys, labels and buttons. Narrow currency context; consider query caching for server lifecycle needs. Local notes and cheap inline handlers are fine.",
    realistic, { reviewLevel: 3,
      reference: "useEffect(() => {\n  let active = true;\n  setLoading(true); setError('');\n  async function load() {\n    try {\n      const response = await fetch(endpoint + '?q=' + encodeURIComponent(query));\n      if (!response.ok) throw new Error('Search failed');\n      const next: Product[] = await response.json();\n      if (active) setProducts(next);\n    } catch (error) {\n      if (active) setError(error instanceof Error ? error.message : 'Search failed');\n    } finally { if (active) setLoading(false); }\n  }\n  void load();\n  return () => { active = false; };\n}, [endpoint, query, retryToken]);\nconst count = products.length;\nconst total = products.reduce((sum, p) => sum + p.price, 0);\n// Separate refresh counter: setRefreshes(n => n + 2).\n// Use product.id keys, labels/buttons, a narrow currency provider and retry UI." }),
  exercise("review-profile", "codeReview", "codeReview",
    ["reactReview", "reactForms", "reactHooks", "reactEffects", "reactRecovery", "reactDesign"], "hard",
    "Level 3: review a profile editor. userId can change and save can reject. Classify every finding and choose the safest refactor.",
    [judgment("hooks", "useMemo occurs after a conditional early return", "MUST FIX", true),
      judgment("controlled", "Email starts undefined, then becomes a string", "MUST FIX", true),
      judgment("deps", "Profile effect omits userId and obsolete-request handling", "MUST FIX", true),
      judgment("http", "Profile fetch lacks HTTP/rejection/error recovery", "MUST FIX", true),
      judgment("submit", "Submission neither prevents default nor guards invalid email", "MUST FIX", true),
      judgment("save", "Rejected save leaves saving true with no reported failure", "MUST FIX", true),
      judgment("reset", "Reset button defaults to submit inside form", "MUST FIX", true),
      judgment("labels", "Email/bio inputs have no accessible labels", "MUST FIX", true),
      judgment("memo", "Memoizing this cheap email check", "SHOULD FIX"),
      judgment("status", "Saved status stays visible after editing", "SHOULD FIX"),
      judgment("preview", "Small EmailPreview component with explicit email prop", "FINE AS-IS"),
      judgment("boundary", "Keep editor logic together until a reusable concern emerges", "FINE AS-IS"),
      judgment("privacy", "Native details/summary disclosure", "FINE AS-IS"),
      select("refactor", "Best refactor", ["Defined local fields; guarded profile load; validated async form handler with try/catch/finally; labeled inputs; non-submit reset",
        "Move hooks inside submit and wrap all callbacks in useCallback", "An Error Boundary replaces all fetch/save error handling"],
      ["Defined local fields; guarded profile load; validated async form handler with try/catch/finally; labeled inputs; non-submit reset"], false, "review-refactor", "critical")],
    "Keep hooks unconditional (the cheap validation can simply run during render). Initialize email to '', protect profile loads, prevent default and validate before await save, catch failures and clear saving in finally. Reset is type=button; label fields and reset saved status on edits. Keep explicit component composition/native disclosures. Boundaries do not catch event-driven async save failures.",
    formReview, { reviewLevel: 3,
      reference: "async function submit(event: React.FormEvent) {\n  event.preventDefault();\n  if (saving || !emailValid) return;\n  setSaving(true); setSaved(false); setError('');\n  try { await save(userId, email, bio); setSaved(true); }\n  catch (error) { setError(error instanceof Error ? error.message : 'Save failed'); }\n  finally { setSaving(false); }\n}\n// Keep fields defined, handle/guard profile load, label fields.\n// <button type=\"button\" onClick={reset}>Reset</button>" }),
  exercise("optional-lanes", "reconstruction", "bestExplanation", ["reactIdentity"], "hard",
    "Optional depth: should scheduler lane implementation details block interview readiness?",
    [one("Judgment", ["Yes, memorize lane bitmasks", "No; understand units of work, prioritization and render versus commit"], "No; understand units of work, prioritization and render versus commit")],
    "Fiber implementation internals, lane bitmasks, obscure reconciliation/event details and rare memoization edge cases are optional. The interview-level model is units of work, priority, and render distinct from commit.",
    undefined, { depth: "optional" }),
  ...reactExpandedQuestions,
];
