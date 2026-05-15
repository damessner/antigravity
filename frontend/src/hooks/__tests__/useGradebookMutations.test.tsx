import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useGradebookMutations } from "../useGradebookMutations";
import * as fetchAuthModule from "@/utils/fetchAuth";
import { GradebookMatrix } from "@/types";

vi.mock("@/utils/fetchAuth", () => ({
  fetchAuth: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useGradebookMutations", () => {
  let queryClient: QueryClient;
  const fetchAuthMock = vi.mocked(fetchAuthModule.fetchAuth);

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it("rolls back a single failed optimistic grade update", async () => {
    const matrix: GradebookMatrix = {
      categories: [],
      pupil_tags: [],
      grades: [{
        category_id: 1,
        pupil_id: 1,
        assessment_name: "A1",
        grade_value: "1",
        is_visible: true,
      }],
    };
    queryClient.setQueryData(["matrix", 10], matrix);
    fetchAuthMock.mockRejectedValueOnce(new Error("Server 500"));

    const { result } = renderHook(() => useGradebookMutations(10), { wrapper });

    act(() => {
      result.current.updateGrade.mutate({
        category_id: 1,
        pupil_id: 1,
        assessment_name: "A1",
        grade_value: "2",
        is_visible: true,
      });
    });

    await waitFor(() => {
      const rolledBack = queryClient.getQueryData<GradebookMatrix>(["matrix", 10]);
      expect(rolledBack?.grades[0]?.grade_value).toBe("1");
    });
  });

  it("does not rollback newer optimistic value when an older request fails", async () => {
    const matrix: GradebookMatrix = {
      categories: [],
      pupil_tags: [],
      grades: [{
        category_id: 1,
        pupil_id: 1,
        assessment_name: "A1",
        grade_value: "1",
        is_visible: true,
      }],
    };
    queryClient.setQueryData(["matrix", 10], matrix);

    const first = createDeferred<{ data: unknown }>();
    const second = createDeferred<{ data: { grade: { grade_value: string; is_visible: boolean } } }>();

    fetchAuthMock
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    const { result } = renderHook(() => useGradebookMutations(10), { wrapper });

    act(() => {
      result.current.updateGrade.mutate({
        category_id: 1,
        pupil_id: 1,
        assessment_name: "A1",
        grade_value: "2",
        is_visible: true,
      });
      result.current.updateGrade.mutate({
        category_id: 1,
        pupil_id: 1,
        assessment_name: "A1",
        grade_value: "3",
        is_visible: true,
      });
    });

    await waitFor(() => {
      const optimistic = queryClient.getQueryData<GradebookMatrix>(["matrix", 10]);
      expect(optimistic?.grades[0]?.grade_value).toBe("3");
    });

    act(() => {
      first.reject(new Error("Old request failed"));
      second.resolve({ data: { grade: { grade_value: "3", is_visible: true } } });
    });

    await waitFor(() => {
      const finalState = queryClient.getQueryData<GradebookMatrix>(["matrix", 10]);
      expect(finalState?.grades[0]?.grade_value).toBe("3");
    });
  });
});
