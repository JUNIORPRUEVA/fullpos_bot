import fs from 'node:fs';
import path from 'node:path';

export interface BotConfig {
  destinationNumber: string;
  whatsappInstance: string;
  openaiModel: string;
  autoReplyEnabled: boolean;
  pauseMinutes: number;
  responseStyle: string;
  businessName: string;
  businessSummary: string;
  maxResponseChars: number;
  humanDelayMs: number;
  webhookUrl: string;
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
      destinationNumber: '',
      whatsappInstance: process.env.WHATSAPP_INSTANCE || 'apyra',
      openaiModel: process.env.OPENAI_MODEL || 'gpt-4o',
      autoReplyEnabled: true,
      pauseMinutes: 15,
      responseStyle: 'corto_profesional_humano',
      businessName: 'FullPOS',
      businessSummary: 'Sistema de punto de venta para ventas, inventario, licencias, soporte e instalacion.',
      maxResponseChars: 420,
      humanDelayMs: 1200,
      webhookUrl: 'https://fullpos-backend-fullpos-bot.onqyr1.easypanel.host/webhook',
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
