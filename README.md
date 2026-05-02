# @workspace/auth

Universal JWT authentication package — generic client singleton and NestJS server module.

This package is intentionally app-agnostic. It handles token lifecycle, session checks, and API communication. Data shapes (DTOs, request bodies) and auth state mapping belong in the consuming application, not here.

## Exports

| Path                     | Use case                                          |
|--------------------------|---------------------------------------------------|
| `@workspace/auth`        | Client-side `Auth` singleton (Next.js, React Native) |
| `@workspace/auth/server` | NestJS `JwtModule`, `BaseAuthGuard`, decorators   |

> **No shared DTOs.** `LoginDto`, `RegisterDto`, and any other request shapes are your app's responsibility. Define them wherever makes sense for your project (e.g. `src/lib/dto/auth.dto.ts`).

## Client setup

### 1. Configure the singleton

`Auth` is generic over your session shape — pass whatever your `/auth/session` endpoint returns and map it to `AuthState` in `sessionToAuthState`. The package never assumes what a "profile" or "user" looks like.

```ts
import { Auth } from '@workspace/auth';

// Define your session shape (matches what GET /auth/session returns)
type MySession = { id: string; profile: { id: string } | null };

export const auth = new Auth<MySession>();

auth.configure({
  apiBaseUrl: process.env.NEXT_PUBLIC_API_URL,
  sessionToAuthState: (session) => ({
    authenticated: true,
    authProviderId: session.id,
    profileId: session.profile?.id ?? null,
  }),
});
```

### 2. Initialize on app boot

Call `initialize()` once — it hits `GET /auth/session` and sets the initial auth state.

```ts
// e.g. in providers.tsx or _app.tsx
useEffect(() => {
  auth.initialize();
}, []);
```

### 3. Guard layouts

```ts
useEffect(() => {
  return auth.onAuthStateChanged((state) => {
    if (!state.authenticated) router.replace('/auth/login');
    else if (!state.profileId) router.replace('/onboarding');
  });
}, []);
```

`profileId` being `null` means the identity exists but onboarding isn't complete. The server signals this by omitting `userId` from the access token — no special token type needed.

### 4. Sign in / register / sign out

```ts
await auth.signIn(email, password);
await auth.register(email, password);
auth.signOut();
```

`signIn` and `register` accept plain email/password strings. Define your own `LoginDto` / `RegisterDto` in your app if you need `class-validator`-backed form validation.

### 5. Attach to Axios (automatic 401 retry)

```ts
auth.attachInterceptors(axiosInstance);
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
        issuer: config.get('BACKEND_HOST'),
        accessExpiresIn: '15m',   // optional, default '15m'
        refreshExpiresIn: '7d',   // optional, default '7d'
      }),
    }),
  ],
})
export class AppModule {}
```

### 2. Implement the guard

Extend `BaseAuthGuard` and implement `findUser(sub)`. The `sub` is the subject you pass to `signAccessToken` — typically your identity provider's primary key.

```ts
import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BaseAuthGuard, JwtService } from '@workspace/auth/server';

@Injectable()
export class AuthGuard extends BaseAuthGuard {
  constructor(reflector: Reflector, jwtService: JwtService, private users: UsersRepo) {
    super(reflector, jwtService);
  }

  async findUser(sub: string) {
    return this.users.findOne({ where: { id: sub } });
  }
}
```

Register globally so every route is protected by default:

```ts
import { APP_GUARD } from '@nestjs/core';

providers: [{ provide: APP_GUARD, useClass: AuthGuard }]
```

### 3. Use the decorators

```ts
import { AuthOnly, CurrentUser, Public, Roles } from '@workspace/auth/server';

export class AuthController {

  // Skip auth entirely — login, register, public pages
  @Public()
  @Post('login')
  login(@Body() body: { email: string; password: string }) { ... }

  // Valid token required, but no profile yet (mid-onboarding)
  @AuthOnly()
  @Post('complete-registration')
  completeRegistration(@CurrentUser() user: User | null) { ... }

  // Fully authenticated — user entity must be present
  @Get('me')
  getMe(@CurrentUser() user: User) { ... }

  // Authenticated + role check
  @Roles('admin')
  @Delete(':id')
  remove(@Param('id') id: string) { ... }
}
```

### 4. Sign tokens in your AuthService

`JwtService` is injectable anywhere once the module is registered globally.

```ts
import { JwtService } from '@workspace/auth/server';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  /**
   * Full session: pass sub + any extra claims (e.g. userId, role).
   * Onboarding: pass only sub — the absence of userId signals no profile yet.
   * The client reads profileId from AuthState; a null value means onboarding.
   */
  async issueTokens(identityId: string, user: User | null, res: Response) {
    const extra = user ? { userId: user.id, role: user.role } : {};
    const access  = await this.jwtService.signAccessToken(identityId, extra);
    const refresh = await this.jwtService.signRefreshToken(identityId);

    res.cookie('access_token',  access,  { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
    res.cookie('refresh_token', refresh, { httpOnly: true, secure: true, sameSite: 'lax', path: '/auth/refresh' });
  }
}
```

### 5. What you write yourself (project-specific)

| Piece            | Why it's yours                                                    |
|------------------|-------------------------------------------------------------------|
| `LoginDto` / `RegisterDto` | Request shapes vary per project; use `class-validator` as needed |
| `LocalStrategy`  | Needs your user repo + password hashing lib (argon2, bcrypt)     |
| `AuthController` | Routes, cookie names, and response shapes vary per project        |
| `AuthModule`     | Wires your `AuthService`, `LocalStrategy`, and `AuthController`   |

---

## Scripts

- `pnpm build` — compile CJS + ESM to `dist/`
- `pnpm dev` — watch mode
