import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AuthManager } from '../auth-manager';
import type { AuthConfig, UserIdentity } from '../auth-manager';

describe('AuthManager', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Constructor
  // ==========================================================================

  describe('constructor', () => {
    it('should create an instance with minimal public config', () => {
      const manager = new AuthManager({ mode: 'public' });
      expect(manager).toBeDefined();
      expect(manager.getMode()).toBe('public');
    });

    it('should store the initial token from config', () => {
      const manager = new AuthManager({
        mode: 'jwt',
        token: 'initial-token',
      });
      expect(manager.isAuthenticated()).toBe(true);
    });

    it('should not have a token when none is provided', () => {
      const manager = new AuthManager({ mode: 'jwt' });
      expect(manager.isAuthenticated()).toBe(false);
    });
  });

  // ==========================================================================
  // getAuthHeaders()
  // ==========================================================================

  describe('getAuthHeaders()', () => {
    it('should return empty object in public mode', () => {
      const manager = new AuthManager({ mode: 'public' });
      expect(manager.getAuthHeaders()).toEqual({});
    });

    it('should return empty object in public mode even with a token', () => {
      const manager = new AuthManager({
        mode: 'public',
        token: 'some-token',
      });
      expect(manager.getAuthHeaders()).toEqual({});
    });

    it('should return Authorization Bearer header in jwt mode', () => {
      const manager = new AuthManager({
        mode: 'jwt',
        token: 'my-jwt-token',
      });
      expect(manager.getAuthHeaders()).toEqual({
        Authorization: 'Bearer my-jwt-token',
      });
    });

    it('should return empty object in jwt mode when token is not set', () => {
      const manager = new AuthManager({ mode: 'jwt' });
      expect(manager.getAuthHeaders()).toEqual({});
    });

    it('should return custom header name and prefix in custom mode', () => {
      const manager = new AuthManager({
        mode: 'custom',
        token: 'custom-token-value',
        headerName: 'X-Custom-Auth',
        headerPrefix: 'Token',
      });
      expect(manager.getAuthHeaders()).toEqual({
        'X-Custom-Auth': 'Token custom-token-value',
      });
    });

    it('should use default header name and prefix in custom mode when not specified', () => {
      const manager = new AuthManager({
        mode: 'custom',
        token: 'token-value',
      });
      expect(manager.getAuthHeaders()).toEqual({
        Authorization: 'Bearer token-value',
      });
    });

    it('should return empty object in custom mode when token is null', () => {
      const manager = new AuthManager({ mode: 'custom' });
      expect(manager.getAuthHeaders()).toEqual({});
    });
  });

  // ==========================================================================
  // setToken()
  // ==========================================================================

  describe('setToken()', () => {
    it('should update the token', () => {
      const manager = new AuthManager({ mode: 'jwt' });
      expect(manager.isAuthenticated()).toBe(false);

      manager.setToken('new-token');
      expect(manager.isAuthenticated()).toBe(true);
      expect(manager.getAuthHeaders()).toEqual({
        Authorization: 'Bearer new-token',
      });
    });

    it('should replace an existing token', () => {
      const manager = new AuthManager({
        mode: 'jwt',
        token: 'old-token',
      });

      manager.setToken('new-token');
      expect(manager.getAuthHeaders()).toEqual({
        Authorization: 'Bearer new-token',
      });
    });
  });

  // ==========================================================================
  // clearToken()
  // ==========================================================================

  describe('clearToken()', () => {
    it('should remove the token', () => {
      const manager = new AuthManager({
        mode: 'jwt',
        token: 'my-token',
      });
      expect(manager.isAuthenticated()).toBe(true);

      manager.clearToken();
      expect(manager.isAuthenticated()).toBe(false);
      expect(manager.getAuthHeaders()).toEqual({});
    });

    it('should be safe to call when no token exists', () => {
      const manager = new AuthManager({ mode: 'jwt' });
      expect(() => manager.clearToken()).not.toThrow();
      expect(manager.isAuthenticated()).toBe(false);
    });
  });

  // ==========================================================================
  // handleUnauthorized()
  // ==========================================================================

  describe('handleUnauthorized()', () => {
    it('should call onTokenRefresh and update token on success', async () => {
      const refreshFn = vi.fn().mockResolvedValue('refreshed-token');
      const manager = new AuthManager({
        mode: 'jwt',
        token: 'expired-token',
        onTokenRefresh: refreshFn,
      });

      const result = await manager.handleUnauthorized();

      expect(result).toBe(true);
      expect(refreshFn).toHaveBeenCalledOnce();
      expect(manager.getAuthHeaders()).toEqual({
        Authorization: 'Bearer refreshed-token',
      });
    });

    it('should return false when no onTokenRefresh callback is provided', async () => {
      const manager = new AuthManager({
        mode: 'jwt',
        token: 'expired-token',
      });

      const result = await manager.handleUnauthorized();
      expect(result).toBe(false);
    });

    it('should return false in public mode', async () => {
      const refreshFn = vi.fn().mockResolvedValue('new-token');
      const manager = new AuthManager({
        mode: 'public',
        onTokenRefresh: refreshFn,
      });

      const result = await manager.handleUnauthorized();
      expect(result).toBe(false);
      expect(refreshFn).not.toHaveBeenCalled();
    });

    it('should return false when refresh callback throws', async () => {
      const refreshFn = vi.fn().mockRejectedValue(new Error('Refresh failed'));
      const manager = new AuthManager({
        mode: 'jwt',
        token: 'expired-token',
        onTokenRefresh: refreshFn,
      });

      const result = await manager.handleUnauthorized();
      expect(result).toBe(false);
    });

    it('should return false when refresh returns empty string', async () => {
      const refreshFn = vi.fn().mockResolvedValue('');
      const manager = new AuthManager({
        mode: 'jwt',
        token: 'expired-token',
        onTokenRefresh: refreshFn,
      });

      const result = await manager.handleUnauthorized();
      expect(result).toBe(false);
    });

    it('should return false when refresh returns whitespace-only string', async () => {
      const refreshFn = vi.fn().mockResolvedValue('   ');
      const manager = new AuthManager({
        mode: 'jwt',
        token: 'expired-token',
        onTokenRefresh: refreshFn,
      });

      const result = await manager.handleUnauthorized();
      expect(result).toBe(false);
    });

    it('should deduplicate concurrent refresh calls', async () => {
      let resolveRefresh: ((value: string) => void) | null = null;
      const refreshFn = vi.fn().mockImplementation(
        () =>
          new Promise<string>((resolve) => {
            resolveRefresh = resolve;
          })
      );

      const manager = new AuthManager({
        mode: 'jwt',
        token: 'expired-token',
        onTokenRefresh: refreshFn,
      });

      // Fire 3 concurrent calls
      const p1 = manager.handleUnauthorized();
      const p2 = manager.handleUnauthorized();
      const p3 = manager.handleUnauthorized();

      // Only one refresh call should have been made
      expect(refreshFn).toHaveBeenCalledOnce();

      // Resolve the single refresh
      resolveRefresh!('deduplicated-token');

      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
      expect(r1).toBe(true);
      expect(r2).toBe(true);
      expect(r3).toBe(true);

      // Token should be updated once
      expect(manager.getAuthHeaders()).toEqual({
        Authorization: 'Bearer deduplicated-token',
      });
    });

    it('should allow a new refresh after the previous one completes', async () => {
      let callCount = 0;
      const refreshFn = vi.fn().mockImplementation(async () => {
        callCount++;
        return `token-${callCount}`;
      });

      const manager = new AuthManager({
        mode: 'jwt',
        token: 'expired',
        onTokenRefresh: refreshFn,
      });

      // First refresh
      const r1 = await manager.handleUnauthorized();
      expect(r1).toBe(true);
      expect(manager.getAuthHeaders()).toEqual({
        Authorization: 'Bearer token-1',
      });

      // Second refresh (should trigger a new call)
      const r2 = await manager.handleUnauthorized();
      expect(r2).toBe(true);
      expect(manager.getAuthHeaders()).toEqual({
        Authorization: 'Bearer token-2',
      });

      expect(refreshFn).toHaveBeenCalledTimes(2);
    });

    it('should work in custom mode', async () => {
      const refreshFn = vi.fn().mockResolvedValue('custom-refreshed');
      const manager = new AuthManager({
        mode: 'custom',
        token: 'expired-custom',
        headerName: 'X-Auth',
        headerPrefix: 'Key',
        onTokenRefresh: refreshFn,
      });

      const result = await manager.handleUnauthorized();
      expect(result).toBe(true);
      expect(manager.getAuthHeaders()).toEqual({
        'X-Auth': 'Key custom-refreshed',
      });
    });
  });

  // ==========================================================================
  // getMode()
  // ==========================================================================

  describe('getMode()', () => {
    it('should return public for public mode', () => {
      const manager = new AuthManager({ mode: 'public' });
      expect(manager.getMode()).toBe('public');
    });

    it('should return jwt for jwt mode', () => {
      const manager = new AuthManager({ mode: 'jwt' });
      expect(manager.getMode()).toBe('jwt');
    });

    it('should return custom for custom mode', () => {
      const manager = new AuthManager({ mode: 'custom' });
      expect(manager.getMode()).toBe('custom');
    });
  });

  // ==========================================================================
  // isAuthenticated()
  // ==========================================================================

  describe('isAuthenticated()', () => {
    it('should return false in public mode even with a token', () => {
      const manager = new AuthManager({
        mode: 'public',
        token: 'some-token',
      });
      expect(manager.isAuthenticated()).toBe(false);
    });

    it('should return true in jwt mode when token is present', () => {
      const manager = new AuthManager({
        mode: 'jwt',
        token: 'jwt-token',
      });
      expect(manager.isAuthenticated()).toBe(true);
    });

    it('should return false in jwt mode when token is absent', () => {
      const manager = new AuthManager({ mode: 'jwt' });
      expect(manager.isAuthenticated()).toBe(false);
    });

    it('should return true in custom mode when token is present', () => {
      const manager = new AuthManager({
        mode: 'custom',
        token: 'custom-token',
      });
      expect(manager.isAuthenticated()).toBe(true);
    });

    it('should return false after clearToken()', () => {
      const manager = new AuthManager({
        mode: 'jwt',
        token: 'my-token',
      });
      expect(manager.isAuthenticated()).toBe(true);

      manager.clearToken();
      expect(manager.isAuthenticated()).toBe(false);
    });
  });

  // ==========================================================================
  // getUserIdentity()
  // ==========================================================================

  describe('getUserIdentity()', () => {
    it('should return null when no user identity is configured', () => {
      const manager = new AuthManager({ mode: 'jwt', token: 'tok' });
      expect(manager.getUserIdentity()).toBeNull();
    });

    it('should return the configured user identity', () => {
      const identity: UserIdentity = {
        userId: 'user_123',
        name: 'John Doe',
        email: 'john@example.com',
        avatar: 'https://example.com/avatar.jpg',
        metadata: { plan: 'premium' },
      };

      const manager = new AuthManager({
        mode: 'jwt',
        token: 'tok',
        userIdentity: identity,
      });

      const result = manager.getUserIdentity();
      expect(result).toEqual(identity);
      expect(result?.userId).toBe('user_123');
      expect(result?.name).toBe('John Doe');
      expect(result?.email).toBe('john@example.com');
      expect(result?.avatar).toBe('https://example.com/avatar.jpg');
      expect(result?.metadata).toEqual({ plan: 'premium' });
    });

    it('should return identity with only userId (minimal)', () => {
      const manager = new AuthManager({
        mode: 'jwt',
        token: 'tok',
        userIdentity: { userId: 'user_min' },
      });

      const result = manager.getUserIdentity();
      expect(result?.userId).toBe('user_min');
      expect(result?.name).toBeUndefined();
      expect(result?.email).toBeUndefined();
    });
  });

  // ==========================================================================
  // destroy()
  // ==========================================================================

  describe('destroy()', () => {
    it('should clear the token after destroy', () => {
      const manager = new AuthManager({
        mode: 'jwt',
        token: 'my-token',
      });
      expect(manager.isAuthenticated()).toBe(true);

      manager.destroy();
      expect(manager.isAuthenticated()).toBe(false);
      expect(manager.getAuthHeaders()).toEqual({});
    });

    it('should be safe to call destroy multiple times', () => {
      const manager = new AuthManager({
        mode: 'jwt',
        token: 'tok',
      });

      expect(() => {
        manager.destroy();
        manager.destroy();
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // Token refresh error handling
  // ==========================================================================

  describe('token refresh error handling', () => {
    it('should not modify the existing token when refresh fails', async () => {
      const refreshFn = vi.fn().mockRejectedValue(new Error('Network error'));
      const manager = new AuthManager({
        mode: 'jwt',
        token: 'existing-token',
        onTokenRefresh: refreshFn,
      });

      const result = await manager.handleUnauthorized();
      expect(result).toBe(false);

      // Original token should remain unchanged
      expect(manager.getAuthHeaders()).toEqual({
        Authorization: 'Bearer existing-token',
      });
    });

    it('should clear refresh promise after failure so next attempt works', async () => {
      let callNum = 0;
      const refreshFn = vi.fn().mockImplementation(async () => {
        callNum++;
        if (callNum === 1) throw new Error('First attempt fails');
        return 'second-attempt-token';
      });

      const manager = new AuthManager({
        mode: 'jwt',
        token: 'old-token',
        onTokenRefresh: refreshFn,
      });

      // First attempt fails
      const r1 = await manager.handleUnauthorized();
      expect(r1).toBe(false);

      // Second attempt succeeds (proves refreshPromise was cleared)
      const r2 = await manager.handleUnauthorized();
      expect(r2).toBe(true);
      expect(manager.getAuthHeaders()).toEqual({
        Authorization: 'Bearer second-attempt-token',
      });

      expect(refreshFn).toHaveBeenCalledTimes(2);
    });

    it('should handle concurrent callers when refresh fails', async () => {
      let resolveRefresh: ((value: never) => void) | null = null;
      let rejectRefresh: ((reason: Error) => void) | null = null;

      const refreshFn = vi.fn().mockImplementation(
        () =>
          new Promise<string>((_resolve, reject) => {
            resolveRefresh = _resolve as (value: never) => void;
            rejectRefresh = reject;
          })
      );

      const manager = new AuthManager({
        mode: 'jwt',
        token: 'expired',
        onTokenRefresh: refreshFn,
      });

      const p1 = manager.handleUnauthorized();
      const p2 = manager.handleUnauthorized();

      expect(refreshFn).toHaveBeenCalledOnce();

      // Reject the refresh
      rejectRefresh!(new Error('Auth service down'));

      const [r1, r2] = await Promise.all([p1, p2]);

      // First caller gets false from the catch
      expect(r1).toBe(false);
      // Second caller also gets false from the catch
      expect(r2).toBe(false);
    });
  });
});
