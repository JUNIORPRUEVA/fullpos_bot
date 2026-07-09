import OpenAI from 'openai';

export class OpenAIService {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async generateAgentReply(context: any): Promise<any> {
    if (!this.client.apiKey) {
      return {
        client_response: 'Hola 👋, estoy listo para ayudarte con FullPOS. Configura OPENAI_API_KEY para activar la inteligencia del agente.',
      };
    }

    const prompt = `Eres un asesor comercial de FullPOS. Responde en español y orienta al cliente sobre ventas, demo, precio, instalación y soporte.\n\nContexto:\n${JSON.stringify(context, null, 2)}`;

    const response = await this.client.responses.create({
      model: this.model,
      input: prompt,
      temperature: 0.7,
    });

    const output = response.output_text || 'Gracias por tu mensaje.';
    return { client_response: output };
  }
}
