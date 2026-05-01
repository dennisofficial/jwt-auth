# @workspace/auth

Universal JWT authentication package — shared client singleton, NestJS server module, and DTOs.

## Exports

| Path                     | Use case                                                            |
|--------------------------|---------------------------------------------------------------------|
| `@workspace/auth`        | Client-side `Auth` singleton (Next.js, React Native)               |
| `@workspace/auth/server` | NestJS `JwtModule`, `BaseAuthGuard`, decorators                    |
| `@workspace/auth/dto`    | Shared `LoginDto` / `RegisterDto` with `class-validator` decorators |

## Client setup

### 1. Configure the singleton

Create `src/lib/auth.ts` in your app and configure once at startup:

```ts
import { Auth } from '@workspace/auth';

export const authInstance = new Auth();

authInstance.configure({
  apiBaseUrl: process.env.NEXT_PUBLIC_API_URL,
  sessionToAuthState: (session) => ({
    authenticated: true,
    authProviderId: session.user.id,
    profileId: session.user.profile?.id ?? null,
  }),
});
```

### 2. Initialize on app boot

Call `initialize()` once — it hits `GET /auth/session` and sets the initial auth state.

```ts
// e.g. in providers.tsx or _app.tsx
useEffect(() => {
  authInstance.initialize();
}, []);
```

### 3. Guard layouts

```ts
useEffect(() => {
  return authInstance.onAuthStateChanged((state) => {
    if (!state.authenticated) router.replace('/auth/login');
  });
}, []);
```

### 4. Sign in / register / sign out

```ts
await authInstance.signIn(email, password);
await authInstance.register(email, password);
authInstance.signOut();
```

### 5. Attach to Axios (automatic 401 retry)

```ts
authInstance.attachInterceptors(axiosInstance);
```

---

## Server setup (NestJS)

`@workspace/auth/server` ships `JwtModule`, `BaseAuthGuard`, and route decorators. No Passport dependency — token signing and verification is handled internally using [`jose`](https://github.com/panva/jose).

### Install peer deps

```bash
pnpm add @nestjs/common @nestjs/core cookie-parser
pnpm add -D @types/cookie-parser
```

### 1. Register JwtModule

Register once at the app level with `forRootAsync`. Pass `isGlobal: true` so every module can inject `JwtService` without re-importing.

```ts
// app.module.ts
import { JwtModule } from '@workspace/auth/server';

@Module({
  imports: [
    JwtModule.forRootAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        accessSecret: config.get('JWT_ACCESS_SECRET'),
        refreshSecret: config.get('JWT_REFRESH_SECRET'),
        issuer: config.get('BACKEND_HOST'), // written into every token as the `iss` claim
        accessExpiresIn: '15m',             // optional, default '15m'
        refreshExpiresIn: '7d',             // optional, default '7d'
      }),
    }),
  ],
})
export class AppModule {}
```

### 2. Implement the guard

Extend `BaseAuthGuard` and implement `findUser(sub)`. The `sub` is the value you passed as the first argument to `signAccessToken` — typically your auth provider's primary key.

```ts
// auth/auth.guard.ts
import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BaseAuthGuard, JwtService } from '@workspace/auth/server';

@Injectable()
export class AuthGuard extends BaseAuthGuard {
  constructor(reflector: Reflector, jwtService: JwtService, private users: UsersRepo) {
    super(reflector, jwtService);
  }

  async findUser(sub: string) {
    // Return whatever you want attached to request.user.
    // Return null during onboarding and pair with @AuthOnly() on those routes.
    return this.users.findOne({ where: { id: sub }, relations: { profile: true } });
  }
}
```

Register it globally in `AppModule` so every route is protected by default:

```ts
import {APP_GUARD} from '@nestjs/core';

@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard
    }
  ]
})
export class AppModule {}
```

### 3. Use the decorators

```ts
import {AuthOnly, CurrentUser, Public, Roles} from '@workspace/auth/server';
import {LoginDto} from '@workspace/auth/dto';

export class AuthController {

  // Skip auth — login, register, public endpoints
  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    // ...
  }

  // Valid token required, but user entity can be null (mid-onboarding)
  @AuthOnly()
  @Get('onboarding')
  getOnboarding(@CurrentUser() user: User | null) {
    // ...
  }

  // Fully authenticated — user entity must exist
  @Get('me')
  getMe(@CurrentUser() user: User) {
    // ...
  }

  // Authenticated + specific role
  @Roles('admin')
  @Delete(':id')
  remove(@Param('id') id: string) {
    // ...
  }
}
```

### 4. Sign tokens in your AuthService

`JwtService` is injectable anywhere once the module is registered globally.

```ts
import { JwtService } from '@workspace/auth/server';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  async login(user: User, res: Response) {
    const access  = await this.jwtService.signAccessToken(user.id);
    const refresh = await this.jwtService.signRefreshToken(user.id);

    // Decode to read the real expiry for the cookie maxAge
    const { exp: accessExp }  = await this.jwtService.decodeToken(access);
    const { exp: refreshExp } = await this.jwtService.decodeToken(refresh);

    res.cookie('access_token', access, {
      httpOnly: true, secure: true, sameSite: 'lax',
      path: '/', expires: new Date(accessExp! * 1000),
    });
    res.cookie('refresh_token', refresh, {
      httpOnly: true, secure: true, sameSite: 'lax',
      path: '/auth/refresh',             // browser only sends this on the refresh route
      expires: new Date(refreshExp! * 1000),
    });

    return { user };
  }

  async refresh(req: Request, res: Response) {
    const token = req.cookies?.['refresh_token']
      ?? req.headers['x-refresh-token'];           // mobile fallback

    if (!token) throw new UnauthorizedException();

    const payload = await this.jwtService.verifyRefreshToken(token as string);
    const newAccess = await this.jwtService.signAccessToken(payload.sub!);
    const { exp } = await this.jwtService.decodeToken(newAccess);

    res.cookie('access_token', newAccess, {
      httpOnly: true, secure: true, sameSite: 'lax',
      path: '/', expires: new Date(exp! * 1000),
    });

    return { success: true };
  }
}
```

### 5. What you write yourself (project-specific)

| Piece            | Why it's yours                                                  |
|------------------|-----------------------------------------------------------------|
| `LocalStrategy`  | Needs your user repo + password hashing lib (argon2, bcrypt)    |
| `AuthController` | Routes, response shapes, and cookie names vary per project      |
| `AuthModule`     | Wires your `AuthService`, `LocalStrategy`, and `AuthController` |

---

## Scripts

- `pnpm build` — compile CJS + ESM to `dist/`
- `pnpm dev` — watch mode
