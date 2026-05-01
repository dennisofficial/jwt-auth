import { Inject, Injectable } from '@nestjs/common';
import type { JWTPayload } from 'jose';
import { JWT_MODULE_OPTIONS_TOKEN } from './jwt-module-builder';
import type { JwtModuleOptions } from './jwt-module-options.interface';

@Injectable()
export class JwtService {
  constructor(@Inject(JWT_MODULE_OPTIONS_TOKEN) private readonly opts: JwtModuleOptions) {}

  private encodeSecret(secret: string): Uint8Array {
    return new TextEncoder().encode(secret);
  }

  /**
   * Dynamic import keeps jose (pure ESM) compatible with CJS NestJS apps.
   * The module is cached by the Node.js module system after the first call.
   */
  private async jose() {
    return await import('jose');
  }

  async signAccessToken(sub: string, payload: Record<string, unknown> = {}): Promise<string> {
    const { SignJWT } = await this.jose();
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(sub)
      .setIssuedAt()
      .setIssuer(this.opts.issuer)
      .setExpirationTime(this.opts.accessExpiresIn ?? '15m')
      .sign(this.encodeSecret(this.opts.accessSecret));
  }

  async signRefreshToken(sub: string, payload: Record<string, unknown> = {}): Promise<string> {
    const { SignJWT } = await this.jose();
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(sub)
      .setIssuedAt()
      .setIssuer(this.opts.issuer)
      .setExpirationTime(this.opts.refreshExpiresIn ?? '7d')
      .sign(this.encodeSecret(this.opts.refreshSecret));
  }

  async verifyAccessToken(token: string): Promise<JWTPayload> {
    const { jwtVerify } = await this.jose();
    const { payload } = await jwtVerify(token, this.encodeSecret(this.opts.accessSecret), {
      issuer: this.opts.issuer,
      algorithms: ['HS256'],
    });
    return payload;
  }

  async verifyRefreshToken(token: string): Promise<JWTPayload> {
    const { jwtVerify } = await this.jose();
    const { payload } = await jwtVerify(token, this.encodeSecret(this.opts.refreshSecret), {
      issuer: this.opts.issuer,
      algorithms: ['HS256'],
    });
    return payload;
  }

  /** Decode without verification — useful for reading expiry to set cookie maxAge. */
  async decodeToken(token: string): Promise<JWTPayload> {
    const { decodeJwt } = await this.jose();
    return decodeJwt(token);
  }
}
