import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'auth:roles';

/**
 * Restrict a route to users with one of the specified roles.
 * BaseAuthGuard checks `user.role` against this list.
 *
 * @example
 * @Roles('admin', 'owner')
 * @Delete(':id')
 * remove(@Param('id') id: string) {}
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
