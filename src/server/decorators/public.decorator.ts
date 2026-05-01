import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:isPublic';

/**
 * Skip authentication for this route or controller entirely.
 *
 * @example
 * @Public()
 * @Post('login')
 * login(@Body() dto: LoginDto) {}
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
