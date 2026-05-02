import axios, { AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { jwtDecode } from 'jwt-decode';
import type {
  AuthConfig,
  AuthResponse,
  AuthState,
  AuthStateChangeCallback,
  UnsubscribeFunction,
} from './types';

interface JwtPayload {
  sub: string;
  userId?: string | null;
  exp: number;
  iat: number;
}

interface CustomAxiosRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

/**
 * Core authentication class.
 * Manages auth state and auth operations.
 * Web: uses httpOnly cookies (no token storage in JS).
 * Mobile: uses tokenPersistence adapter.
 */
export class Auth<Session extends Record<string, any> = Record<string, any>> {
  private config: AuthConfig<Session> | null = null;
  private state: AuthState = { authenticated: false, authProviderId: null, profileId: null };
  private listeners: Set<AuthStateChangeCallback> = new Set();
  private refreshPromise: Promise<void> | null = null;
  private _axiosInstance: AxiosInstance | null = null;
  private initializing: boolean = true;

  // In-memory token cache (fast access, cleared on logout)
  private _accessToken: string | null = null;
  private _refreshToken: string | null = null;
  private _accessExpiresAt: number | null = null;
  private _refreshExpiresAt: number | null = null;

  configure(config: AuthConfig<Session>): void {
    this.config = config;
    this._axiosInstance = axios.create({
      baseURL: config.apiBaseUrl,
      timeout: 30000,
      withCredentials: !config.tokenPersistence,
    });
  }

  hasTokenPersistence(): boolean {
    return !!this.config?.tokenPersistence;
  }

  async initialize(): Promise<void> {
    this.ensureConfigured();
    try {
      if (this.hasTokenPersistence()) {
        await this.initializeFromStorage();
      } else {
        await this.checkSession();
      }
    } finally {
      this.initializing = false;
      this.notifyListeners();
    }
  }

  private async initializeFromStorage(): Promise<void> {
    try {
      const { access, refresh } = await this.config!.tokenPersistence!.getTokens();
      if (!this.validateTokens(access, refresh)) {
        await this.clearTokensSafely();
        return;
      }
      const accessData = this.extractAccessTokenData(access!);
      const refreshExpiresAt = this.extractRefreshTokenExpiry(refresh!);
      if (!accessData || !refreshExpiresAt) {
        await this.clearTokensSafely();
        return;
      }
      const now = Date.now();
      if (now >= refreshExpiresAt) {
        await this.clearTokensSafely();
        return;
      }
      this._accessToken = access;
      this._refreshToken = refresh;
      this._accessExpiresAt = accessData.expiresAt;
      this._refreshExpiresAt = refreshExpiresAt;
      const threshold = 60 * 1000;
      if (now >= accessData.expiresAt - threshold) {
        await this.refreshTokensFromStorage(refresh!);
        return;
      }
      this.updateState({
        authenticated: true,
        authProviderId: accessData.authProviderId,
        profileId: accessData.userId,
      });
    } catch {
      await this.clearTokensSafely();
    }
  }

  private async refreshTokensFromStorage(refreshToken: string): Promise<void> {
    try {
      const response = await this._axiosInstance!.request<AuthResponse<Session>>({
        method: 'POST',
        url: '/auth/refresh',
        headers: { 'X-Refresh-Token': refreshToken },
        params: { includeTokens: 'true' },
        withCredentials: true,
      });
      await this.handleAuthResponse(response.data);
    } catch (error) {
      if (this.isAuthError(error)) {
        await this.clearTokensSafely();
      }
    }
  }

  async signIn(email: string, password: string): Promise<AuthResponse<Session>> {
    this.ensureConfigured();
    const config: AxiosRequestConfig = this.hasTokenPersistence()
      ? { params: { includeTokens: 'true' } }
      : {};
    const response = await this._axiosInstance!.post<AuthResponse<Session>>(
      '/auth/login',
      { email, password },
      { ...config, withCredentials: true },
    );
    await this.handleAuthResponse(response.data);
    return response.data;
  }

  async register(email: string, password: string): Promise<AuthResponse<Session>> {
    this.ensureConfigured();
    const config: AxiosRequestConfig = this.hasTokenPersistence()
      ? { params: { includeTokens: 'true' } }
      : {};
    const response = await this._axiosInstance!.post<AuthResponse<Session>>(
      '/auth/register',
      { email, password },
      { ...config, withCredentials: true },
    );
    await this.handleAuthResponse(response.data);
    return response.data;
  }

  signOut(): void {
    this.ensureConfigured();
    this.updateState({ authenticated: false, authProviderId: null, profileId: null });
    const fireAndForget = async () => {
      try {
        const config: AxiosRequestConfig = { withCredentials: true };
        if (this.hasTokenPersistence() && this._accessToken) {
          config.headers = { Authorization: `Bearer ${this._accessToken}` };
        }
        await this._axiosInstance!.post('/auth/logout', {}, config);
      } catch {
        /* ignore */
      }
      await this.clearTokensSafely();
      this._accessToken = null;
      this._refreshToken = null;
      this._accessExpiresAt = null;
      this._refreshExpiresAt = null;
    };
    void fireAndForget();
  }

  async getIdToken(force: boolean = false): Promise<string | null> {
    if (!this.hasTokenPersistence()) return null;
    this.ensureConfigured();
    if (this.isRefreshTokenExpired()) {
      this.signOut();
      return null;
    }
    if (force || this.isTokenExpired()) {
      try {
        await this.refreshToken();
      } catch {
        this.signOut();
        return null;
      }
    }
    if (!this._accessToken) {
      this.signOut();
      return null;
    }
    return this._accessToken;
  }

  async refreshToken(): Promise<void> {
    this.ensureConfigured();
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.hasTokenPersistence() ? this._doRefresh() : this._doRefreshWeb();
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async _doRefresh(): Promise<void> {
    if (this.isRefreshTokenExpired()) throw new Error('Refresh token expired');
    const access = this._accessToken;
    const refresh = this._refreshToken;
    if (!this.validateTokens(access, refresh)) throw new Error('Invalid tokens');
    try {
      const response = await axios.request<AuthResponse<Session>>({
        method: 'POST',
        baseURL: this.config!.apiBaseUrl,
        url: '/auth/refresh',
        headers: { Authorization: `Bearer ${access}`, 'X-Refresh-Token': refresh },
        timeout: 30000,
        params: { includeTokens: 'true' },
        withCredentials: true,
      });
      await this.handleAuthResponse(response.data);
    } catch (error) {
      if (this.isAuthError(error)) this.signOut();
      throw error;
    }
  }

  private async _doRefreshWeb(): Promise<void> {
    try {
      await this._axiosInstance!.post('/auth/refresh');
    } catch (error) {
      if (this.isAuthError(error)) {
        this.updateState({ authenticated: false, authProviderId: null, profileId: null });
      }
      throw error;
    }
  }

  private isTokenExpired(): boolean {
    if (!this._accessExpiresAt) return false;
    return Date.now() >= this._accessExpiresAt - 60 * 1000;
  }

  private isRefreshTokenExpired(): boolean {
    if (!this._refreshExpiresAt) return false;
    return Date.now() >= this._refreshExpiresAt;
  }

  private async handleAuthResponse(data: AuthResponse<Session>): Promise<void> {
    const authState = this.config!.sessionToAuthState(data.user);
    if (this.hasTokenPersistence() && data.tokens) {
      try {
        const accessData = this.extractAccessTokenData(data.tokens.access);
        const refreshExpiresAt = this.extractRefreshTokenExpiry(data.tokens.refresh);
        if (!accessData || !refreshExpiresAt) throw new Error('Failed to decode tokens');
        await this.config!.tokenPersistence!.saveTokens(data.tokens.access, data.tokens.refresh);
        this._accessToken = data.tokens.access;
        this._refreshToken = data.tokens.refresh;
        this._accessExpiresAt = accessData.expiresAt;
        this._refreshExpiresAt = refreshExpiresAt;
        this.updateState(authState);
      } catch (error) {
        console.error('Failed to save tokens:', error);
        throw new Error('Failed to save authentication tokens');
      }
    } else {
      this.updateState(authState);
    }
  }

  attachInterceptors(axiosInstance: AxiosInstance): void {
    axiosInstance.interceptors.request.use(
      async (config) => {
        if (this.hasTokenPersistence()) {
          if (this.isRefreshTokenExpired()) {
            this.signOut();
            return Promise.reject(new Error('Refresh token expired'));
          }
          if (this.isTokenExpired()) {
            try {
              await this.refreshToken();
            } catch (error) {
              return Promise.reject(error);
            }
          }
          if (this._accessToken) {
            config.headers = config.headers || {};
            config.headers.Authorization = `Bearer ${this._accessToken}`;
          }
        }
        return config;
      },
      (error) => Promise.reject(error),
    );

    axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config as CustomAxiosRequestConfig;
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          try {
            await this.refreshToken();
            return axiosInstance(originalRequest);
          } catch {
            if (!this.hasTokenPersistence()) await this.checkSession();
            return Promise.reject(error);
          }
        }
        return Promise.reject(error);
      },
    );
  }

  onAuthStateChanged(callback: AuthStateChangeCallback): UnsubscribeFunction {
    this.listeners.add(callback);
    if (!this.initializing) callback(this.state);
    return () => {
      this.listeners.delete(callback);
    };
  }

  get currentAuthState(): AuthState {
    return { ...this.state };
  }

  /**
   * The pre-configured axios instance (withCredentials already set).
   * Use this in UI code to make API requests without re-creating a client.
   */
  get httpClient(): AxiosInstance {
    this.ensureConfigured();
    return this._axiosInstance!;
  }

  private updateState(newState: Partial<AuthState>): void {
    const mergedState = { ...this.state, ...newState };
    if (!this.hasStateChanged(this.state, mergedState)) return;
    this.state = mergedState;
    if (!this.initializing) this.notifyListeners();
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      try {
        listener(this.state);
      } catch (error) {
        console.error('Error in auth state listener:', error);
      }
    });
  }

  private hasStateChanged(oldState: AuthState, newState: AuthState): boolean {
    return (
      oldState.authenticated !== newState.authenticated ||
      oldState.authProviderId !== newState.authProviderId ||
      oldState.profileId !== newState.profileId
    );
  }

  private ensureConfigured(): void {
    if (!this.config) throw new Error('Auth not configured. Call auth().configure() first.');
  }

  private validateTokens(access: string | null, refresh: string | null): boolean {
    return !!(access && refresh && access.trim().length > 0 && refresh.trim().length > 0);
  }

  private decodeToken(token: string): JwtPayload | null {
    try {
      return jwtDecode<JwtPayload>(token);
    } catch {
      return null;
    }
  }

  private extractAccessTokenData(
    accessToken: string,
  ): { userId: string | null; authProviderId: string; expiresAt: number } | null {
    const payload = this.decodeToken(accessToken);
    if (!payload) return null;
    return {
      userId: payload.userId ?? null,
      authProviderId: payload.sub,
      expiresAt: payload.exp * 1000,
    };
  }

  private extractRefreshTokenExpiry(refreshToken: string): number | null {
    const payload = this.decodeToken(refreshToken);
    if (!payload) return null;
    return payload.exp * 1000;
  }

  private async clearTokensSafely(): Promise<void> {
    if (this.hasTokenPersistence()) {
      try {
        await this.config!.tokenPersistence!.clearTokens();
      } catch (error) {
        console.error('Failed to clear tokens:', error);
      }
    }
  }

  private isAuthError(error: any): boolean {
    return error?.response?.status === 401;
  }

  async checkSession(): Promise<void> {
    this.ensureConfigured();
    try {
      const response = await this._axiosInstance!.get<Session>('/auth/session');
      this.updateState(this.config!.sessionToAuthState(response.data));
    } catch (error) {
      if (this.isAuthError(error)) {
        if (!this.hasTokenPersistence()) {
          try {
            await this.refreshToken();
            const response = await this._axiosInstance!.get<Session>('/auth/session');
            this.updateState(this.config!.sessionToAuthState(response.data));
            return;
          } catch {
            this.updateState({ authenticated: false, authProviderId: null, profileId: null });
            return;
          }
        }
        this.updateState({ authenticated: false, authProviderId: null, profileId: null });
      }
    }
  }
}
