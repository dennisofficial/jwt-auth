import { ConfigurableModuleBuilder } from '@nestjs/common';
import type { JwtModuleOptions } from './jwt-types';

export const {
  ConfigurableModuleClass,
  MODULE_OPTIONS_TOKEN: JWT_MODULE_OPTIONS_TOKEN,
  OPTIONS_TYPE: JWT_OPTIONS_TYPE,
  ASYNC_OPTIONS_TYPE: JWT_ASYNC_OPTIONS_TYPE,
} = new ConfigurableModuleBuilder<JwtModuleOptions>()
  .setClassMethodName('forRoot')
  .setExtras({ isGlobal: false }, (definition, extras) => ({
    ...definition,
    global: extras.isGlobal,
  }))
  .build();
