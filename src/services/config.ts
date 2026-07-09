import fs from 'node:fs';
import path from 'node:path';

export interface BotConfig {
  whatsappProvider: 'meta' | 'evolution';
  destinationNumber: string;
  whatsappInstance: string;
  metaPhoneNumberId: string;
  metaWebhookUrl: string;
  metaVerifyToken: string;
  openaiModel: string;
  autoReplyEnabled: boolean;
  pauseMinutes: number;
  responseStyle: string;
  businessName: string;
  businessSummary: string;
  maxResponseChars: number;
  humanDelayMs: number;
  webhookUrl: string;
  responseMode: 'text' | 'audio' | 'auto';
  ttsVoice: string;
}

export class ConfigService {
  private filePath: string;
  private config: BotConfig;

  constructor(filePath = path.join(process.cwd(), 'bot-config.json')) {
    this.filePath = filePath;
    this.config = this.load();
  }

  private load(): BotConfig {
    if (!fs.existsSync(this.filePath)) {
      return this.defaultConfig();
    }

    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      return { ...this.defaultConfig(), ...parsed };
    } catch {
      return this.defaultConfig();
    }
  }

  private defaultConfig(): BotConfig {
    return {
      whatsappProvider: (process.env.WHATSAPP_PROVIDER as 'meta' | 'evolution') || 'meta',
      destinationNumber: '',
      whatsappInstance: process.env.WHATSAPP_INSTANCE || 'apyra',
      metaPhoneNumberId: process.env.META_PHONE_NUMBER_ID || '622270290979970',
      metaWebhookUrl: 'https://fullpos-backend-fullpos-bot.onqyr1.easypanel.host/meta/webhook',
      metaVerifyToken: process.env.META_VERIFY_TOKEN || 'fullpos_meta_verify_2026',
      openaiModel: process.env.OPENAI_MODEL || 'gpt-4o',
      autoReplyEnabled: true,
      pauseMinutes: 15,
      responseStyle: 'corto_profesional_humano',
      businessName: 'FullPOS',
      businessSummary: 'Sistema de punto de venta para ventas, inventario, licencias, soporte e instalacion.',
      maxResponseChars: 420,
      humanDelayMs: 1200,
      webhookUrl: 'https://fullpos-backend-fullpos-bot.onqyr1.easypanel.host/webhook',
      responseMode: 'auto',
      ttsVoice: 'marin',
    };
  }

  get(): BotConfig {
    return { ...this.config };
  }

  set(partial: Partial<BotConfig>): BotConfig {
    this.config = { ...this.config, ...partial };
    fs.writeFileSync(this.filePath, JSON.stringify(this.config, null, 2));
    return this.get();
  }
}
