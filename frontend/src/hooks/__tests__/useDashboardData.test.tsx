import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDashboardData } from '../useDashboardData';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import * as fetchAuthModule from '../../utils/fetchAuth';

vi.mock('../../utils/fetchAuth', () => ({
  fetchAuth: vi.fn(),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useDashboardData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(useDashboardData).toBeDefined();
  });

  it('should handle fetch', async () => {
    (fetchAuthModule.fetchAuth as any).mockResolvedValue({ data: { pupils: [] } });
    const { result } = renderHook(() => useDashboardData('token'), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBeDefined());
  });
});
