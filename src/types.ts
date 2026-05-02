/**
 * Authentication state
 * Clean public API - only exposes what users need
 * Tokens and expiration times are cached internally
 */
export interface AuthState {
  authenticated: boolean;
  authProviderId: string | null;
  profileId: string | null;
}

/**
 * Authentication configuration
 */
export interface AuthConfig<Session extends Record<string, any> = Record<string, any>> {
  apiBaseUrl: string;
  /** Optional - if not provided, uses cookies only (web) */
  tokenPersistence?: ITokenPersistenceAdapter;
  sessionToAuthState: (session: Session) => AuthState;
}

/**
 * Token persistence adapter interface (mobile)
 */
export interface ITokenPersistenceAdapter {
  saveTokens(access: string, refresh: string): Promise<void>;
  getTokens(): Promise<{ access: string | null; refresh: string | null }>;
  clearTokens(): Promise<void>;
}

/**
 * Auth response from backend.
 * `tokens` is present only in the mobile flow (includeTokens=true).
 * Web flow relies on httpOnly cookies; tokens are never sent in the body.
 */
export interface AuthResponse {
  user: {
    id: string;
    profile?: { id: string } | null;
  };
  tokens?: {
    access: string;
    refresh: string;
  };
}

/**
 * Auth state change callback
 */
export type AuthStateChangeCallback = (state: AuthState) => void;

/**
 * Unsubscribe function returned by onAuthStateChanged
 */
export type UnsubscribeFunction = () => void;
