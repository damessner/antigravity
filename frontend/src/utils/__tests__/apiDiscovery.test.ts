import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getApiUrl } from '../apiDiscovery';

describe('getApiUrl', () => {
  beforeEach(() => {
    vi.stubGlobal('location', {
      hostname: 'localhost',
      protocol: 'http:',
      port: '3000'
    });
    vi.stubGlobal('process', {
      env: {
        NEXT_PUBLIC_API_URL: undefined
      }
    });
  });

  it('should return empty string by default on localhost (for relative fetches)', () => {
    const url = getApiUrl();
    expect(url).toBe('');
  });

  it('should use NEXT_PUBLIC_API_URL if provided', () => {
    vi.stubGlobal('process', {
      env: {
        NEXT_PUBLIC_API_URL: 'https://api.example.com'
      }
    });
    const url = getApiUrl();
    expect(url).toBe('https://api.example.com');
  });

  it('should return empty string on server IP (for relative fetches)', () => {
    vi.stubGlobal('location', {
      hostname: '192.168.1.50',
      protocol: 'http:',
      port: '3000'
    });
    const url = getApiUrl();
    expect(url).toBe('');
  });
});
