import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAdminMutations } from '../useAdminMutations';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import * as fetchAuthModule from '@/utils/fetchAuth';

vi.mock('@/utils/fetchAuth', () => ({
  fetchAuth: vi.fn(),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useAdminMutations', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient();
  });

  it('should optimistically delete a user', async () => {
    const initialUsers = [{ id: 1, full_name: 'Test User' }];
    queryClient.setQueryData(['admin', 'users'], initialUsers);

    (fetchAuthModule.fetchAuth as any).mockResolvedValue({ data: {} });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useAdminMutations(), { wrapper });

    result.current.deleteUser.mutate(1);

    // Check optimistic update
    await waitFor(() => {
      const usersInCache = queryClient.getQueryData(['admin', 'users']);
      expect(usersInCache).toEqual([]);
    });

    await waitFor(() => expect(result.current.deleteUser.isSuccess).toBe(true));
  });

  it('should rollback user deletion on error', async () => {
    const initialUsers = [{ id: 1, full_name: 'Test User' }];
    queryClient.setQueryData(['admin', 'users'], initialUsers);

    (fetchAuthModule.fetchAuth as any).mockRejectedValue(new Error('Delete Failed'));

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useAdminMutations(), { wrapper });

    result.current.deleteUser.mutate(1);

    // Verify rollback
    await waitFor(() => {
      const usersInCache = queryClient.getQueryData(['admin', 'users']);
      expect(usersInCache).toEqual(initialUsers);
    });
  });
});
