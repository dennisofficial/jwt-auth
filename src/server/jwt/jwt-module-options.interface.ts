export interface JwtModuleOptions {
  /** Secret used to sign access tokens — e.g. JWT_ACCESS_SECRET */
  accessSecret: string;
  /** Secret used to sign refresh tokens — e.g. JWT_REFRESH_SECRET */
  refreshSecret: string;
  /**
   * Issuer claim written into every token and validated on verify.
   * Typically your backend's base URL — e.g. https://api.example.com
   */
  issuer: string;
  /** Access token lifetime. Defaults to '15m'. */
  accessExpiresIn?: string;
  /** Refresh token lifetime. Defaults to '7d'. */
  refreshExpiresIn?: string;
}
