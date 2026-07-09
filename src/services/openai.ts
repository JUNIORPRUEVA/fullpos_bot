import OpenAI from 'openai';
import { toFile } from 'openai/uploads';

export class OpenAIService {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  setModel(model: string): void {
    if (model.trim()) {
      this.model = model.trim();
    }
  }

  async generateAgentReply(context: any): Promise<any> {
    if (!this.client.apiKey) {
      return {
        client_response: 'Hola, estoy listo para ayudarte con FullPOS. Falta configurar la inteligencia del agente.',
      };
    }

    const prompt = `Eres el agente profesional de ${context.config?.businessName || 'FullPOS'}.

Objetivo:
- Responder por WhatsApp como una persona experta, amable y directa.
- Ayudar con ventas, demostraciones, precios, instalacion, licencias y soporte.
- Si falta informacion, haz una sola pregunta clara.
- Si el cliente esta molesto o pide humano, reconoce y deriva con calma.
- Vender con inteligencia: detecta necesidad, muestra valor concreto y propone demo o siguiente paso.

Estilo obligatorio:
- Espanol natural de Republica Dominicana/LatAm neutro.
- Corto, profesional y humano.
- Maximo ${context.config?.maxResponseChars || 420} caracteres salvo que el cliente pida detalle.
- No uses listas largas, markdown pesado ni explicaciones internas.
- No inventes precios, promesas ni datos del cliente.
- Si el cliente pide profundidad, explica por bloques pequenos y pregunta si desea ver venta, inventario, reportes o licencias.

Conocimiento comercial de FullPOS:
- Punto de venta para negocios que necesitan vender rapido, controlar inventario y operar con orden.
- Puede ayudar a explicar ventas, productos, clientes, inventario, reportes, licencias, instalacion y soporte.
- En demostraciones, guia con lenguaje simple: registrar producto, vender, consultar inventario, revisar reportes y activar licencia.
- Para cierre comercial, pide solo el dato siguiente: tipo de negocio, cantidad de cajas/equipos o horario para demo.
- Si hay soporte tecnico, pide el error exacto, captura o audio breve y ofrece escalar si es urgente.

Devuelve SOLO JSON valido con este formato:
{
  "intent": "venta|demo|precio|soporte|licencia|instalacion|ubicacion|otro",
  "client_response": "respuesta final para WhatsApp",
  "needs_human": false,
  "priority": "normal|alta",
  "next_action": "responder|pedir_dato|derivar_humano|registrar_interes"
}

Contexto:
${JSON.stringify(context, null, 2)}`;

    const response = await this.client.responses.create({
      model: this.model,
      input: prompt,
      temperature: 0.7,
      max_output_tokens: 450,
    });

    const output = response.output_text || 'Gracias por tu mensaje.';
    return this.parseAgentJson(output, context.config?.maxResponseChars || 420);
  }

  async transcribeAudio(media: { base64: string; mimetype?: string; fileName?: string }): Promise<string> {
    if (!this.client.apiKey || !media.base64) {
      return '';
    }

    const buffer = Buffer.from(media.base64, 'base64');
    const file = await toFile(buffer, media.fileName || 'audio.ogg', { type: media.mimetype || 'audio/ogg' });
    const transcription = await this.client.audio.transcriptions.create({
      file,
      model: 'gpt-4o-mini-transcribe',
      language: 'es',
    });

    return transcription.text || '';
  }

  async analyzeImage(media: { base64: string; mimetype?: string }, caption = ''): Promise<string> {
    if (!this.client.apiKey || !media.base64) {
      return caption;
    }

    const mimeType = media.mimetype || 'image/jpeg';
    const response = await this.client.responses.create({
      model: this.model,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `Describe brevemente esta imagen para contexto comercial de FullPOS. Caption del cliente: ${caption || 'sin caption'}`,
            },
            {
              type: 'input_image',
              image_url: `data:${mimeType};base64,${media.base64}`,
              detail: 'low',
            },
          ],
        },
      ],
      max_output_tokens: 180,
    });

    return response.output_text || caption;
  }

  async generateSpeechBase64(text: string, voice = 'marin'): Promise<string> {
    if (!this.client.apiKey || !text.trim()) {
      return '';
    }

    const speech = await this.client.audio.speech.create({
      model: 'gpt-4o-mini-tts',
      voice,
      input: text,
      instructions: 'Habla en español latino profesional, cálido y natural. Ritmo tranquilo, como asesor comercial humano.',
      response_format: 'mp3',
    });

    const buffer = Buffer.from(await speech.arrayBuffer());
    return buffer.toString('base64');
  }

  private parseAgentJson(raw: string, maxChars: number): any {
    const cleaned = raw.trim().replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      return {
        intent: parsed.intent || 'otro',
        client_response: this.limitResponse(String(parsed.client_response || parsed.response || 'Claro, puedo ayudarte.'), maxChars),
        needs_human: parsed.needs_human === true,
        priority: parsed.priority || 'normal',
        next_action: parsed.next_action || 'responder',
      };
    } catch {
      return {
        intent: 'otro',
        client_response: this.limitResponse(cleaned || 'Claro, puedo ayudarte.', maxChars),
        needs_human: false,
        priority: 'normal',
        next_action: 'responder',
      };
    }
  }

  private limitResponse(text: string, maxChars: number): string {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxChars) {
      return normalized;
    }

    return `${normalized.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
  }
}
