import { Module } from '@nestjs/common';
import { ConfigurableModuleClass } from './jwt-module-builder';
import { JwtService } from './jwt.service';

/**
 * Provides and exports JwtService configured with your secrets and issuer.
 *
 * @example Synchronous (e.g. hardcoded / test)
 * JwtModule.forRoot({
 *   accessSecret: 'secret',
 *   refreshSecret: 'refresh-secret',
 *   issuer: 'https://api.example.com',
 * })
 *
 * @example Asynchronous (recommended — inject ConfigService)
 * JwtModule.forRootAsync({
 *   imports: [ConfigModule],
 *   inject: [ConfigService],
 *   useFactory: (config: ConfigService) => ({
 *     accessSecret: config.get('JWT_ACCESS_SECRET'),
 *     refreshSecret: config.get('JWT_REFRESH_SECRET'),
 *     issuer: config.get('BACKEND_HOST'),
 *   }),
 * })
 *
 * @example Make it globally available (skips re-importing in every module)
 * JwtModule.forRootAsync({ isGlobal: true, ... })
 */
@Module({
  providers: [JwtService],
  exports: [JwtService],
})
export class JwtModule extends ConfigurableModuleClass {}
