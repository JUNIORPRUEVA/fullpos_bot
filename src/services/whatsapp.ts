import axios from 'axios';

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
}
