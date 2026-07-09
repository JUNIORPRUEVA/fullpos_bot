import axios from 'axios';

export interface EvolutionMedia {
  base64: string;
  mimetype?: string;
  fileName?: string;
}

export class WhatsAppService {
  constructor(private config: { baseUrl: string; apiKey: string; instance: string }) {}

  async sendText(remoteJid: string, text: string, instance: string): Promise<void> {
    if (!this.config.baseUrl || !this.config.apiKey) {
      return;
    }

    await axios.post(`${this.config.baseUrl}/message/sendText/${instance}`, {
      number: remoteJid.replace(/@s\.whatsapp\.net$/, ''),
      text,
    }, {
      headers: {
        apikey: this.config.apiKey,
      },
    });
  }

  async sendAudio(remoteJid: string, audioBase64: string, instance: string, delay = 1200): Promise<void> {
    if (!this.config.baseUrl || !this.config.apiKey || !audioBase64) {
      return;
    }

    await axios.post(`${this.config.baseUrl}/message/sendWhatsAppAudio/${instance}`, {
      number: remoteJid.replace(/@s\.whatsapp\.net$/, ''),
      options: {
        delay,
        presence: 'recording',
      },
      audio: audioBase64,
    }, {
      headers: {
        apikey: this.config.apiKey,
      },
      timeout: 30000,
    });
  }

  async sendMedia(
    remoteJid: string,
    mediaBase64OrUrl: string,
    instance: string,
    mediaType: 'image' | 'video' | 'document',
    caption = '',
    fileName = 'fullpos-media',
  ): Promise<void> {
    if (!this.config.baseUrl || !this.config.apiKey || !mediaBase64OrUrl) {
      return;
    }

    await axios.post(`${this.config.baseUrl}/message/sendMedia/${instance}`, {
      number: remoteJid.replace(/@s\.whatsapp\.net$/, ''),
      mediatype: mediaType,
      media: mediaBase64OrUrl,
      caption,
      fileName,
    }, {
      headers: {
        apikey: this.config.apiKey,
      },
      timeout: 30000,
    });
  }

  async fetchMediaBase64(messageId: string, instance: string): Promise<EvolutionMedia | null> {
    if (!this.config.baseUrl || !this.config.apiKey || !messageId) {
      return null;
    }

    const response = await axios.post(`${this.config.baseUrl}/chat/getBase64FromMediaMessage/${instance}`, {
      'message.key.id': messageId,
      convertToMp4: false,
    }, {
      headers: {
        apikey: this.config.apiKey,
      },
      timeout: 20000,
    });

    return response.data || null;
  }

  async configureWebhook(instance: string, webhookUrl: string): Promise<any> {
    if (!this.config.baseUrl || !this.config.apiKey || !webhookUrl) {
      return null;
    }

    const response = await axios.post(`${this.config.baseUrl}/webhook/set/${instance}`, {
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhookBase64: true,
        events: ['MESSAGES_UPSERT'],
      },
    }, {
      headers: {
        apikey: this.config.apiKey,
      },
      timeout: 15000,
    });

    return response.data;
  }

  async getConnectionState(instance: string): Promise<any> {
    if (!this.config.baseUrl || !this.config.apiKey) {
      return null;
    }

    const response = await axios.get(`${this.config.baseUrl}/instance/connectionState/${instance}`, {
      headers: {
        apikey: this.config.apiKey,
      },
      timeout: 10000,
    });

    return response.data;
  }
}
