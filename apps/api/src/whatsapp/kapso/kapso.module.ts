import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/app-config.js';
import { MEDIA_SOURCE, type MediaSource } from '../../media/media-source.js';
import { WHATSAPP_PROVIDER, type WhatsAppProvider } from '../whatsapp-provider.js';
import { KapsoMediaSource } from './kapso-media-source.js';
import type { KapsoOptions } from './kapso-options.js';
import { KapsoWhatsAppProvider } from './kapso-whatsapp-provider.js';

function optionsFrom(config: AppConfig): KapsoOptions {
  return {
    apiKey: config.kapsoApiKey,
    webhookSecret: config.kapsoWebhookSecret,
    phoneNumberId: config.kapsoPhoneNumberId,
    apiBaseUrl: config.kapsoApiBaseUrl,
  };
}

@Global()
@Module({
  providers: [
    {
      provide: WHATSAPP_PROVIDER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): WhatsAppProvider =>
        new KapsoWhatsAppProvider(optionsFrom(config)),
    },
    {
      provide: MEDIA_SOURCE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): MediaSource => new KapsoMediaSource(optionsFrom(config)),
    },
  ],
  exports: [WHATSAPP_PROVIDER, MEDIA_SOURCE],
})
export class KapsoModule {}
