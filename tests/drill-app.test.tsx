import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DrillApp from "@/components/drill-app";
import { questions } from "@/data/questions";
import { emptyProgress } from "@/lib/model";
import { createProgressStore, loadProgress } from "@/lib/persistence";
import { readiness, recordAttempt, startSession } from "@/lib/learning";
import { readyProgress } from "./fixtures";

vi.mock("@/lib/persistence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/persistence")>();
  const store = actual.createProgressStore(() => window.localStorage);
  const reactStore = actual.createProgressStore(() => window.localStorage, actual.REACT_STORAGE_KEY, []);
  return { ...actual, createProgressStore: (_getStorage: unknown, key?: string) => key === actual.REACT_STORAGE_KEY ? reactStore : store };
});

const store = createProgressStore(() => window.localStorage);
beforeEach(() => {
  window.localStorage.clear();
  store.hydrate();
  store.update(emptyProgress(), true);
});

describe("answer submission", () => {
  it("debounces draft storage and flushes before leaving a question", () => {
    render(<DrillApp />);
    fireEvent.click(screen.getByRole("button", { name: "Concept Reconstruction" }));
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const textField = screen.getByLabelText("X");
    fireEvent.change(textField, { target: { value: "A draft response" } });
    expect(setItem).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Back to dashboard" }));
    expect(loadProgress(window.localStorage).resume?.answer).toContain("A draft response");
    setItem.mockRestore();
  });
  it("requires a nonempty prediction, checks it, locks it and persists exactly once", () => {
    render(<DrillApp />);
    fireEvent.click(screen.getByRole("button", { name: "What Prints?" }));
    expect(screen.queryByRole("heading", { name: "Expected answer" })).not.toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "Submit answer" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Your predicted output / behaviour"), { target: { value: "undefined\n3" } });
    fireEvent.click(submit);
    expect(screen.getByRole("status")).toHaveTextContent("Correct");
    expect(screen.getByLabelText("Your predicted output / behaviour")).toBeDisabled();
    expect(loadProgress(window.localStorage).attempts).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    expect(screen.queryByRole("heading", { name: "Expected answer" })).not.toBeInTheDocument();
    expect(loadProgress(window.localStorage).attempts).toHaveLength(1);
  });
  it("records wrong predictions and displays feedback", () => {
    render(<DrillApp />);
    fireEvent.click(screen.getByRole("button", { name: "What Prints?" }));
    fireEvent.change(screen.getByLabelText("Your predicted output / behaviour"), { target: { value: "3\n3" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));
    expect(screen.getByRole("status")).toHaveTextContent("Not correct");
    expect(loadProgress(window.localStorage).attempts[0].correct).toBe(false);
  });
  it("grades structured concept fields independently and does not offer a prose override", () => {
    render(<DrillApp />);
    fireEvent.click(screen.getByRole("button", { name: "Concept Reconstruction" }));
    fireEvent.change(screen.getByLabelText("X"), { target: { value: "wrong" } });
    fireEvent.change(screen.getByLabelText("Y"), { target: { value: "initialization" } });
    fireEvent.change(screen.getByLabelText("A"), { target: { value: "inner function" } });
    fireEvent.change(screen.getByLabelText("B"), { target: { value: "lexical" } });
    fireEvent.change(screen.getByLabelText("C"), { target: { value: "returned" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));
    expect(screen.getByText("Score: 80%")).toBeInTheDocument();
    expect(loadProgress(window.localStorage).attempts).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Mark as Correct" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Partial");
    expect(loadProgress(window.localStorage).attempts[0]).toMatchObject({
      autoResult: "partial", finalResult: "partial", overridden: false,
    });
    fireEvent.click(screen.getByRole("button", { name: "Back to dashboard" }));
    fireEvent.click(screen.getByRole("button", { name: "Resume saved question" }));
    expect(screen.getByRole("status")).toHaveTextContent("Partial");
    expect(screen.getByLabelText("X")).toHaveValue("wrong");
  });
  it("never counts an unanswered or ungraded reveal as mastery", () => {
    render(<DrillApp />);
    fireEvent.click(screen.getByRole("button", { name: "Implement It" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to dashboard" }));
    expect(loadProgress(window.localStorage).attempts).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Debug It" }));
    fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "Need to consider the loop bound." } });
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to dashboard" }));
    expect(loadProgress(window.localStorage).attempts).toHaveLength(0);
  });
});

describe("dashboard and weakness review", () => {
  it("has exactly four primary modes and only reveals targeted cards after mistakes", () => {
    render(<DrillApp />);
    expect(within(screen.getByRole("navigation", { name: "Training modes" })).getAllByRole("button")).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "Review Weak Areas" })).not.toBeInTheDocument();
    const q = questions.find((q) => q.id === "copy-spread")!;
    const progress = recordAttempt(recordAttempt(emptyProgress(), q, false), q, false);
    act(() => store.update(progress));
    fireEvent.click(screen.getByRole("button", { name: "Review Weak Areas" }));
    expect(screen.getByRole("button", { name: "Reveal explanation" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Your recalled concept / fix"), { target: { value: "The nested object is shared." } });
    fireEvent.click(screen.getByRole("button", { name: "Reveal explanation" }));
    expect(screen.getByText(q.explanation)).toBeInTheDocument();
    const before = readiness(progress, questions);
    fireEvent.click(screen.getByRole("button", { name: "Understood - finish review" }));
    expect(loadProgress(window.localStorage).attempts).toEqual(progress.attempts);
    expect(loadProgress(window.localStorage).reviews["copy-spread"].successful).toBe(true);
    expect(readiness(loadProgress(window.localStorage), questions)).toEqual(before);
  });
  it("shows readiness from actual drill history", () => {
    store.update(readyProgress());
    render(<DrillApp />);
    const row = screen.getByRole("heading", { name: "Scope / Closures" }).parentElement!.parentElement!;
    expect(within(row).getByText("Ready")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue Must-Do Practice" })).not.toBeInTheDocument();
    expect(screen.getByText("Recommended next step: Move to the next interview topic.")).toBeInTheDocument();
  });
  it("resumes an unsubmitted draft after leaving a mode", () => {
    render(<DrillApp />);
    fireEvent.click(screen.getByRole("button", { name: "Concept Reconstruction" }));
    fireEvent.change(screen.getByLabelText("X"), { target: { value: "My unfinished response" } });
    fireEvent.click(screen.getByRole("button", { name: "Back to dashboard" }));
    fireEvent.click(screen.getByRole("button", { name: "Resume saved question" }));
    expect(screen.getByLabelText("X")).toHaveValue("My unfinished response");
    expect(loadProgress(window.localStorage).attempts).toHaveLength(0);
  });
  it("stops a completed session instead of automatically starting another", () => {
    let progress = startSession(emptyProgress(), 10, questions);
    for (let i = 0; i < 9; i++) progress = recordAttempt(progress, questions[0], true);
    store.update(progress);
    render(<DrillApp />);
    fireEvent.click(screen.getByRole("button", { name: "What Prints?" }));
    fireEvent.change(screen.getByLabelText("Your predicted output / behaviour"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish session" }));
    expect(screen.getByRole("heading", { name: "SESSION COMPLETE" })).toBeInTheDocument();
    expect(screen.getByText("Questions completed: 10")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit answer" })).not.toBeInTheDocument();
    expect(loadProgress(window.localStorage).session?.completed).toBe(true);
  });
});
