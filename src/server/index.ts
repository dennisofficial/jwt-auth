// Module
export {
  JWT_ASYNC_OPTIONS_TYPE,
  JWT_MODULE_OPTIONS_TOKEN,
  JWT_OPTIONS_TYPE,
} from './jwt/jwt-module-builder';
export { JwtModule } from './jwt/jwt.module';

// Service
export { JwtService } from './jwt/jwt.service';

// Guard — extend and implement findUser()
export { BaseAuthGuard } from './guards/base-auth.guard';

// Decorators
export { AuthOnly, IS_AUTH_ONLY_KEY } from './decorators/auth-only.decorator';
export { CurrentUser } from './decorators/current-user.decorator';
export { IS_PUBLIC_KEY, Public } from './decorators/public.decorator';
export { ROLES_KEY, Roles } from './decorators/roles.decorator';

// Types
export type { JwtModuleOptions } from './jwt/jwt-module-options.interface';
