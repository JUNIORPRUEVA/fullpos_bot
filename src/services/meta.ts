import axios from 'axios';
import type { EvolutionMedia } from './whatsapp';

export class MetaWhatsAppService {
  private graphVersion: string;

  constructor(private config: { token: string; phoneNumberId: string; graphVersion?: string }) {
    this.graphVersion = config.graphVersion || 'v25.0';
  }

  isConfigured(): boolean {
    return Boolean(this.config.token && this.config.phoneNumberId);
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.token}`,
      'Content-Type': 'application/json',
    };
  }

  async sendText(to: string, text: string): Promise<any> {
    if (!this.isConfigured()) return null;
    const response = await axios.post(`https://graph.facebook.com/${this.graphVersion}/${this.config.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to.replace(/[^0-9]/g, ''),
      type: 'text',
      text: {
        preview_url: false,
        body: text,
      },
    }, {
      headers: this.headers(),
      timeout: 20000,
      validateStatus: () => true,
    });

    return {
      status: response.status,
      data: response.data,
    };
  }

  async sendTemplate(to: string, templateName = 'hello_world', languageCode = 'en_US'): Promise<any> {
    if (!this.isConfigured()) return null;
    const response = await axios.post(`https://graph.facebook.com/${this.graphVersion}/${this.config.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      to: to.replace(/[^0-9]/g, ''),
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
      },
    }, {
      headers: this.headers(),
      timeout: 20000,
      validateStatus: () => true,
    });

    return {
      status: response.status,
      data: response.data,
    };
  }

  async uploadMedia(base64: string, mimeType = 'audio/mpeg', fileName = 'respuesta-fullpos.mp3'): Promise<string> {
    if (!this.isConfigured() || !base64) return '';

    const buffer = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('file', new Blob([buffer], { type: mimeType }), fileName);

    const response = await axios.post(
      `https://graph.facebook.com/${this.graphVersion}/${this.config.phoneNumberId}/media`,
      form,
      {
        headers: { Authorization: `Bearer ${this.config.token}` },
        timeout: 30000,
        validateStatus: () => true,
      },
    );

    return response.status >= 200 && response.status < 300 ? String(response.data?.id || '') : '';
  }

  async sendAudio(to: string, audioBase64: string, mimeType = 'audio/mpeg'): Promise<any> {
    if (!this.isConfigured()) return null;
    const mediaId = await this.uploadMedia(audioBase64, mimeType);
    if (!mediaId) {
      return { status: 400, data: { error: 'media_upload_failed' } };
    }

    const response = await axios.post(`https://graph.facebook.com/${this.graphVersion}/${this.config.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to.replace(/[^0-9]/g, ''),
      type: 'audio',
      audio: { id: mediaId },
    }, {
      headers: this.headers(),
      timeout: 20000,
      validateStatus: () => true,
    });

    return {
      status: response.status,
      data: response.data,
      mediaId,
    };
  }

  async markAsRead(messageId: string): Promise<void> {
    if (!this.isConfigured() || !messageId) return;
    await axios.post(`https://graph.facebook.com/${this.graphVersion}/${this.config.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    }, {
      headers: this.headers(),
      timeout: 10000,
      validateStatus: () => true,
    });
  }

  async sendTypingIndicator(messageId: string): Promise<void> {
    if (!this.isConfigured() || !messageId) return;
    await axios.post(`https://graph.facebook.com/${this.graphVersion}/${this.config.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
      typing_indicator: {
        type: 'text',
      },
    }, {
      headers: this.headers(),
      timeout: 10000,
      validateStatus: () => true,
    });
  }

  async fetchMediaBase64(mediaId: string): Promise<EvolutionMedia | null> {
    if (!this.isConfigured() || !mediaId) return null;

    const media = await axios.get(`https://graph.facebook.com/${this.graphVersion}/${mediaId}`, {
      headers: { Authorization: `Bearer ${this.config.token}` },
      timeout: 15000,
    });
    const url = media.data?.url;
    if (!url) return null;

    const file = await axios.get(url, {
      headers: { Authorization: `Bearer ${this.config.token}` },
      responseType: 'arraybuffer',
      timeout: 30000,
    });

    return {
      base64: Buffer.from(file.data).toString('base64'),
      mimetype: file.headers['content-type'] || media.data?.mime_type,
      fileName: media.data?.file_name,
    };
  }
}
