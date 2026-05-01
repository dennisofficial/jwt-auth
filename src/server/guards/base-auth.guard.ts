import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_AUTH_ONLY_KEY } from '../decorators/auth-only.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { JwtService } from '../jwt/jwt.service';

/**
 * Abstract global authentication guard.
 *
 * Extend this and implement `findUser(sub)` to look up your user entity.
 * The returned value is attached to `request.user` and injected by @CurrentUser().
 *
 * Supports:
 *   @Public()   — skip auth entirely
 *   @AuthOnly() — valid token required, but findUser() may return null (e.g. onboarding)
 *   @Roles(...) — checks user.role against the provided list
 *
 * Token extraction order:
 *   1. `access_token` httpOnly cookie  (web)
 *   2. `Authorization: Bearer <token>` header  (mobile / API clients)
 *
 * @example
 * @Injectable()
 * export class AuthGuard extends BaseAuthGuard {
 *   constructor(reflector: Reflector, jwtService: JwtService, private users: UsersRepo) {
 *     super(reflector, jwtService);
 *   }
 *   async findUser(sub: string) {
 *     return this.users.findOne({ where: { id: sub }, relations: { profile: true } });
 *   }
 * }
 *
 * // Register globally in AppModule:
 * { provide: APP_GUARD, useClass: AuthGuard }
 */
@Injectable()
export abstract class BaseAuthGuard implements CanActivate {
  constructor(
    protected readonly reflector: Reflector,
    protected readonly jwtService: JwtService,
  ) {}

  abstract findUser(sub: string): Promise<any>;

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.isPublic(context)) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: any }>();

    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('No authentication token provided');

    let payload: Awaited<ReturnType<JwtService['verifyAccessToken']>>;
    try {
      payload = await this.jwtService.verifyAccessToken(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (!payload.sub) throw new UnauthorizedException('Malformed token');

    const user = await this.findUser(payload.sub);
    request.user = user;

    // @AuthOnly() — token is valid; a null user is acceptable (e.g. mid-onboarding)
    if (this.isAuthOnly(context)) return true;

    if (!user) throw new UnauthorizedException('User not found');

    // @Roles() — check user.role against the required list
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles?.length && !roles.includes(user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }

  /**
   * Override to customise how the token is extracted from the request.
   * Default: cookie `access_token` → Authorization Bearer header.
   */
  protected extractToken(request: Request): string | null {
    const cookieToken = (request as any).cookies?.['access_token'] ?? null;
    if (cookieToken) return cookieToken;

    const auth = request.headers.authorization;
    if (!auth) return null;
    const [type, token] = auth.split(' ');
    return type === 'Bearer' && token ? token : null;
  }

  private isPublic(ctx: ExecutionContext): boolean {
    return this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
  }

  private isAuthOnly(ctx: ExecutionContext): boolean {
    return this.reflector.getAllAndOverride<boolean>(IS_AUTH_ONLY_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
  }
}
