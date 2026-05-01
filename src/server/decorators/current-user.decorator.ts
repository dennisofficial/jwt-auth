import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Injects the authenticated user from the request into a route handler parameter.
 * Populated by BaseAuthGuard after a successful token verification + findUser() call.
 *
 * @example
 * @Get('me')
 * getMe(@CurrentUser() user: UserEntity) {
 *   return user;
 * }
 */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest().user;
});
