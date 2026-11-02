import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionHeader, SessionTimer } from "@/components/progress-ui";
import { endSession, recordAttempt, sessionElapsed, startSession } from "@/lib/learning";
import { emptyProgress } from "@/lib/model";
import { moduleRegistry } from "@/lib/modules";
import { loadProgress, saveProgress } from "@/lib/persistence";

afterEach(() => vi.useRealTimers());

describe("isolated session clock", () => {
  it("starts, survives questions and re-renders, and never writes storage on ticks", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const trainingModule = moduleRegistry["javascript-typescript"];
    const progress = startSession(emptyProgress(), 10, trainingModule.questions, trainingModule.readinessConfig, 1000);
    const session = progress.session!;
    const writes = vi.spyOn(Storage.prototype, "setItem");
    const { rerender } = render(<SessionHeader title="JS / TS" mode="prints" required={14} session={session} answered={0} graded={false} />);
    expect(screen.getByText("Elapsed: 00:00")).toBeInTheDocument();
    expect(screen.getByText("Question 1 / 10")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(42000));
    rerender(<SessionHeader title="JS / TS" mode="debug" required={13} session={session} answered={1} graded={false} />);
    expect(screen.getByText("Elapsed: 00:42")).toBeInTheDocument();
    expect(screen.getByText("Question 2 / 10")).toBeInTheDocument();
    expect(writes).not.toHaveBeenCalled();
    writes.mockRestore();
  });

  it("restores its timestamp after refresh without changing score or completed answers", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const trainingModule = moduleRegistry["javascript-typescript"];
    let progress = startSession(emptyProgress(), 10, trainingModule.questions, trainingModule.readinessConfig, 1000);
    progress = recordAttempt(progress, trainingModule.questions[0], true, 2000);
    saveProgress(window.localStorage, progress);
    vi.setSystemTime(61000);
    const restored = loadProgress(window.localStorage);
    expect(restored.attempts).toEqual(progress.attempts);
    render(<SessionTimer session={restored.session!} />);
    expect(screen.getByText("Elapsed: 01:00")).toBeInTheDocument();
    const finished = endSession(restored, 64000);
    expect(sessionElapsed(finished.session?.startedAt, 100000, finished.session?.endedAt)).toBe(63);
  });
});
