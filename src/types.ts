/**
 * Authentication state
 * Clean public API - only exposes what users need
 * Tokens and expiration times are cached internally
 */
export type AuthState = {
  authenticated: boolean;
  authProviderId: string | null;
  profileId: string | null;
  /**
   * True when the session check failed due to a network-level error
   * (no response received — backend is down, timed out, or connection refused).
   * Guards should show a "service unavailable" screen instead of redirecting to login.
   */
  backendUnreachable?: boolean;
};

/**
 * Authentication configuration
 */
export type AuthConfig<Session extends Record<string, any> = Record<string, any>> = {
  apiBaseUrl: string;
  /**
   * Base path for all auth endpoints. Defaults to '/auth'.
   * Set to '/auth/customer' for the customer app or '/auth/staff' for the admin app.
   */
  authBasePath?: string;
  /** Optional - if not provided, uses cookies only (web) */
  tokenPersistence?: ITokenPersistenceAdapter;
  sessionToAuthState: (session: Session) => AuthState;
};

/**
 * Token persistence adapter interface (mobile)
 */
export interface ITokenPersistenceAdapter {
  saveTokens(access: string, refresh: string): Promise<void>;
  getTokens(): Promise<{ access: string | null; refresh: string | null }>;
  clearTokens(): Promise<void>;
}

/**
 * Auth response from backend (/login, /register, /complete-registration).
 * The `user` field must be the same shape your `/auth/session` endpoint returns,
 * so it can be passed directly to `sessionToAuthState`.
 *
 * `tokens` is present only in the mobile flow (includeTokens=true).
 * Web flow relies on httpOnly cookies; tokens are never sent in the body.
 */
export type AuthResponse<Session = Record<string, any>> = {
  user: Session;
  tokens?: {
    access: string;
    refresh: string;
  };
};

/**
 * Auth state change callback
 */
export type AuthStateChangeCallback = (state: AuthState) => void;

/**
 * Unsubscribe function returned by onAuthStateChanged
 */
export type UnsubscribeFunction = () => void;
