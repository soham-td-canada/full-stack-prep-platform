import { runInNewContext } from "node:vm";
import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";
import { questions } from "@/data/questions";

const implementations = questions.filter(q => q.mode === "implement");

function reference<T>(id: string, expression: string): T {
  const q = implementations.find(q => q.id === id);
  if (!q?.reference) throw new Error(`Missing reference: ${id}`);
  const code = ts.transpileModule(q.reference, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return runInNewContext(`${code}\n${expression}`, {
    setTimeout, clearTimeout, queueMicrotask,
    performance: { now: () => Date.now() },
  }, { timeout: 1000 }) as T;
}

afterEach(() => vi.useRealTimers());

it.each(implementations)("$id has syntactically valid reference code and strict TypeScript when applicable", q => {
  const source = ts.createSourceFile("reference.ts", q.reference!, ts.ScriptTarget.ES2022, true);
  function containsTypes(node: ts.Node): boolean {
    return ts.isTypeNode(node) || ts.forEachChild(node, containsTypes) === true;
  }
  const typed = containsTypes(source);
  const file = `/reference-${q.id}.${typed ? "ts" : "js"}`;
  const options: ts.CompilerOptions = {
    noEmit: true, strict: true, allowJs: true, checkJs: false,
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, types: [], skipLibCheck: true,
  };
  const host = ts.createCompilerHost(options);
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (name, language, onError, shouldCreateNewSourceFile) => name === file
    ? ts.createSourceFile(file, q.reference!, language, true, typed ? ts.ScriptKind.TS : ts.ScriptKind.JS)
    : original(name, language, onError, shouldCreateNewSourceFile);
  const program = ts.createProgram([file], options, host);
  const diagnostics = typed ? ts.getPreEmitDiagnostics(program) : program.getSyntacticDiagnostics();
  expect(diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n")), q.id).toEqual([]);
});

it("keeps private toggles and counter instances independent", () => {
  const toggle = reference<() => { toggle: () => boolean; read: () => boolean }>("implement-private-toggle", "makeToggle");
  const a = toggle(), b = toggle();
  expect(a.toggle()).toBe(true);
  expect(a.read()).toBe(true);
  expect(b.read()).toBe(false);
  expect(reference<boolean>("implement-prototype-instance",
    "(() => { const a = createCounter(), b = createCounter(); a.increment(); return a.count === 1 && b.count === 0 && a.increment === b.increment; })()")).toBe(true);
});

it("preserves bound receivers and stable class callbacks", () => {
  expect(reference<number>("implement-bind-method",
    "bindMethod({ n: 4, add(a, b) { return this.n + a + b; } }, 'add', 2).call({ n: 99 }, 3)")).toBe(9);
  expect(reference<boolean>("implement-class-callback",
    "(() => { const a = new Counter(), b = new Counter(); const fn = a.callback; fn(); return a.count === 1 && b.count === 0 && fn === a.callback && fn !== b.callback && a.increment === b.increment; })()")).toBe(true);
});

it("once caches falsy success but allows retries after a throw", () => {
  expect(reference<boolean>("reasoning-once",
    "(() => { let calls = 0; const fn = once(function () { if (++calls === 1) throw Error('retry'); return this.value; }); try { fn(); } catch {} return fn.call({ value: 0 }) === 0 && fn.call({ value: 9 }) === 0 && calls === 2; })()")).toBe(true);
});

it("curries without cross-branch accumulation and distinguishes zero from termination", () => {
  expect(reference<boolean>("curry-sum",
    "(() => { const a = sum(1); return a(2)() === 3 && a(3)() === 4 && a(0)(-1)() === 0; })()")).toBe(true);
  expect(reference<boolean>("curry-generic",
    "(() => { const c = curry((a,b,c) => a+b+c), branch = c(1); return branch(2)(3) === 6 && branch(4,5) === 10; })()")).toBe(true);
});

it("partial application preserves dynamic this and pipe handles no stages", () => {
  expect(reference<number>("implement-partial-application",
    "partial(function(a,b) { return this.n+a+b; }, 2).call({ n: 4 }, 3)")).toBe(9);
  expect(reference<boolean>("implement-pipe-functions",
    "pipe()(7) === 7 && pipe(n => n + 1, n => n * 3)(2) === 9")).toBe(true);
});

it("memoizes falsy values and undefined by membership, not truthiness", () => {
  expect(reference<boolean>("implement-memoize-one-arg",
    "(() => { let calls = 0; const fn = memoize(x => { calls++; return x; }); fn(0); fn(0); fn(undefined); fn(undefined); return calls === 2; })()")).toBe(true);
});

it("groupBy supports identity keys and __proto__ without prototype collisions", () => {
  expect(reference<boolean>("reasoning-group",
    "(() => { const key = {}; const groups = groupBy([key, key, '__proto__'], x => x); return groups.get(key).length === 2 && groups.get('__proto__')[0] === '__proto__'; })()")).toBe(true);
});

it("validates unknown data and preserves generic projection contracts at runtime", () => {
  expect(reference<boolean>("ts-guard",
    "isUser({ id: 'a', age: 0 }) && !isUser(null) && !isUser({ id: 'a', age: Infinity }) && !isUser({ age: 2 })")).toBe(true);
  expect(reference<boolean>("implement-unknown-array-guard",
    "isStringArray([]) && isStringArray(['a']) && !isStringArray(null) && !isStringArray(['a', 1]) && !isStringArray(Array(1))")).toBe(true);
  expect(reference<number>("ts-generic", "getProperty({ count: 4 }, 'count')")).toBe(4);
  expect(reference<boolean>("ts-identity", "(() => { const obj = {}; return identity(obj) === obj; })()")).toBe(true);
  expect(reference<number>("ts-discriminated", "area({ kind: 'square', side: 3 })")).toBe(9);
  expect(reference<boolean>("implement-generic-pick",
    "(() => { const nested = {}; const obj = { nested, ['__proto__']: 7 }; const out = pick(obj, ['nested', '__proto__']); return out.nested === nested && Object.hasOwn(out, '__proto__') && out['__proto__'] === 7; })()")).toBe(true);
});

it("copies only changed paths and clones cyclic graph topology", () => {
  expect(reference<boolean>("implement-immutable-row",
    "(() => { const users = [{ id: 'a', profile: { name: 'Ada', age: 20 } }, { id: 'b', profile: { name: 'Lin', age: 21 } }]; const out = renameUser(users, 'a', 'Grace'); return users[0].profile.name === 'Ada' && out[0].profile.name === 'Grace' && out[1] === users[1] && out[0].profile !== users[0].profile; })()")).toBe(true);
  expect(reference<boolean>("implement-clone-data-graph",
    "(() => { const shared = { n: 1 }; const obj = { a: shared, b: shared, ['__proto__']: 7 }; obj.self = obj; const out = cloneGraph(obj); return out !== obj && out.a !== shared && out.a === out.b && out.self === out && Object.hasOwn(out, '__proto__') && out['__proto__'] === 7; })()")).toBe(true);
});

it("debounce keeps the latest receiver and supports cancel, flush and reentrant calls", async () => {
  vi.useFakeTimers();
  const make = reference<(fn: (this: { name: string }, n: number) => void, wait: number) =>
    ((this: { name: string }, n: number) => void) & { cancel: () => void; flush: () => void }>("implement-debounce-controls", "debounce");
  const seen: string[] = [];
  const fn = make(function (n) { seen.push(`${this.name}:${n}`); if (n === 2) fn.call(this, 3); }, 10);
  fn.call({ name: "first" }, 1);
  fn.call({ name: "last" }, 2);
  fn.flush();
  expect(seen).toEqual(["last:2"]);
  await vi.runAllTimersAsync();
  expect(seen).toEqual(["last:2", "last:3"]);
  fn.call({ name: "cancelled" }, 4);
  fn.cancel();
  fn.flush();
  await vi.runAllTimersAsync();
  expect(seen).toHaveLength(2);
  const plain = reference<(fn: (n: number) => void, wait: number) => (n: number) => void>("timing-debounce", "debounce");
  const log = plain(n => seen.push(String(n)), 10);
  log(1); log(2);
  await vi.runAllTimersAsync();
  expect(seen.at(-1)).toBe("2");
});

it("throttle policies keep their specified window boundaries", async () => {
  vi.useFakeTimers();
  const leading = reference<(fn: (n: number) => void, wait: number) => (n: number) => void>("timing-throttle", "throttle");
  const trailing = reference<(fn: (n: number) => void, wait: number) => (n: number) => void>("implement-trailing-throttle", "throttleTrailing");
  const starts: number[] = [], ends: number[] = [];
  const a = leading(n => starts.push(n), 10), b = trailing(n => ends.push(n), 10);
  a(1); b(1);
  await vi.advanceTimersByTimeAsync(5);
  a(2); b(2);
  await vi.advanceTimersByTimeAsync(5);
  a(3);
  expect(starts).toEqual([1, 3]);
  expect(ends).toEqual([2]);
});

it("batches one turn and handles reentrant enqueue as a separate batch", async () => {
  const make = reference<(fn: (batch: number[]) => void) => (value: number) => void>("implement-microtask-batch", "makeBatcher");
  const batches: number[][] = [];
  const enqueue = make(batch => { batches.push([...batch]); if (batch[0] === 1) enqueue(3); });
  enqueue(1); enqueue(2);
  expect(batches).toEqual([]);
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  expect(batches).toEqual([[1, 2], [3]]);
});

it("processes chunks in order, yields between chunks, and rejects invalid sizes", async () => {
  vi.useFakeTimers();
  const process = reference<(items: number[], visit: (n: number) => void, size: number) => Promise<void>>("implement-yield-chunks", "processChunks");
  const seen: number[] = [];
  const done = process([1, 2, 3], n => seen.push(n), 2);
  expect(seen).toEqual([1, 2]);
  await vi.runAllTimersAsync();
  await done;
  expect(seen).toEqual([1, 2, 3]);
  await expect(process([], () => {}, 0)).rejects.toThrow("Invalid chunk size");
});

it("retries only failures and converts sync throws to explicit settlements", async () => {
  const retry = reference<(tasks: Array<() => Promise<number>>) => Promise<PromiseSettledResult<number>[]>>("promise-retry", "runWithRetry");
  const counts = [0, 0, 0];
  const results = await retry([
    async () => { counts[0]++; return 4; },
    async () => { if (++counts[1] === 1) throw Error("once"); return 5; },
    () => { counts[2]++; throw Error("always"); },
  ]);
  expect(counts).toEqual([1, 2, 2]);
  expect(results.map(r => r.status)).toEqual(["fulfilled", "fulfilled", "rejected"]);
  expect(results[1]).toMatchObject({ value: 5 });
});

it("bounded retry re-invokes work and propagates final failures", async () => {
  vi.useFakeTimers();
  const retry = reference<(task: () => Promise<number>, attempts: number, ms: number) => Promise<number>>("implement-bounded-retry", "retry");
  let calls = 0;
  const done = retry(async () => { if (++calls < 3) throw Error("temporary"); return 7; }, 3, 10);
  await vi.runAllTimersAsync();
  expect(await done).toBe(7);
  expect(calls).toBe(3);
  await expect(retry(() => { throw Error("final"); }, 1, 0)).rejects.toThrow("final");
  await expect(retry(async () => 1, 0, 0)).rejects.toThrow("Invalid retry options");
});

it("starts concurrent work before completion, preserves order and captures sync throws", async () => {
  const map = reference<(items: number[], work: (n: number) => Promise<number>) => Promise<number[]>>("implement-concurrent-map", "mapConcurrent");
  const releases: Array<() => void> = [];
  const done = map([1, 2], n => new Promise(resolve => releases.push(() => resolve(n))));
  await Promise.resolve();
  expect(releases).toHaveLength(2);
  releases[1](); releases[0]();
  expect(await done).toEqual([1, 2]);
  await expect(map([1], () => { throw Error("sync"); })).rejects.toThrow("sync");
});

it("limits active work, continues after failures and returns ordered outcomes", async () => {
  const map = reference<(items: number[], limit: number, work: (n: number) => Promise<number>) => Promise<PromiseSettledResult<number>[]>>("implement-concurrency-limit", "mapLimit");
  let active = 0, peak = 0;
  const done = await map([0, 1, 2, 3], 2, async n => {
    active++; peak = Math.max(peak, active);
    await Promise.resolve();
    active--;
    if (n === 1) throw Error("failed");
    return n * 2;
  });
  expect(peak).toBe(2);
  expect(done.map(r => r.status)).toEqual(["fulfilled", "rejected", "fulfilled", "fulfilled"]);
  expect(done[3]).toMatchObject({ value: 6 });
  await expect(map([], 0, async n => n)).rejects.toThrow("Invalid limit");
  expect(await map([], 2, async n => n)).toEqual([]);
});

it("cleans up timeout timers on both fulfillment and expiration", async () => {
  vi.useFakeTimers();
  const timeout = reference<(promise: Promise<number>, ms: number) => Promise<number>>("implement-timeout-cleanup", "withTimeout");
  expect(await timeout(Promise.resolve(4), 10)).toBe(4);
  expect(vi.getTimerCount()).toBe(0);
  const done = timeout(new Promise(() => {}), 10);
  const failed = expect(done).rejects.toThrow("Timed out");
  await vi.runAllTimersAsync();
  await failed;
  expect(vi.getTimerCount()).toBe(0);
});
