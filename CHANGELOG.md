# @dltech/jwt-auth

## 1.0.0

### Major Changes

- First public release.

  Previously consumed as `@workspace/auth` through a git submodule. The package now ships
  compiled type declarations from `dist` rather than pointing consumers at its TypeScript
  sources, and releases through CI with npm provenance.

  `@nestjs/common` and `@nestjs/core` are optional peers, so a client-only consumer using
  just the root export does not have to install Nest. The unused `class-validator`
  dependency has been dropped — it was never imported, and the README only ever mentioned
  it as something a consuming app might add for its own DTOs.
