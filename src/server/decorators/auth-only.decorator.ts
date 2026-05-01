import { SetMetadata } from '@nestjs/common';

export const IS_AUTH_ONLY_KEY = 'auth:isAuthOnly';

/**
 * Require a valid access token but allow a null/incomplete user —
 * useful for onboarding routes where the account exists but setup isn't done.
 *
 * @example
 * @AuthOnly()
 * @Get('onboarding')
 * getOnboardingStatus(@CurrentUser() user: User | null) {}
 */
export const AuthOnly = () => SetMetadata(IS_AUTH_ONLY_KEY, true);
