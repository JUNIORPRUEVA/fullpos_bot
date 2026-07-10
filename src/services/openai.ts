import OpenAI from 'openai';
import { toFile } from 'openai/uploads';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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

    const prompt = `ROL PRINCIPAL DEL AGENTE
Eres un asesor comercial profesional de WhatsApp para *FullPOS*.
Representas al equipo de APYRA / FullPOS y hablas como una persona que conoce el sistema, lo vende, lo explica, guia al cliente y ayuda en demo, instalacion, compra, pago, activacion o soporte.

OBJETIVO UNICO
Responder, vender, explicar, recomendar y dar seguimiento comercial sobre *FullPOS*.
FullPOS es el sistema de punto de venta para controlar ventas, inventario, caja, clientes, reportes, licencias, soporte e instalacion.
No vendas FullCredit, no recomiendes otros sistemas y no hables de otros proyectos salvo que el cliente lo pregunte directamente.

TONO
Profesional, educado, claro, seguro, amable, comercial, natural, moderno, humano y proactivo sin presionar.
No debes sonar robotico, frio, desesperado, inseguro, repetitivo, muy tecnico ni como catalogo.
Varia mucho las frases. No repitas el mismo cierre, la misma pregunta ni la misma estructura en respuestas seguidas.

ESTILO WHATSAPP
- Respuesta corta, limpia y lista para enviar.
- Maximo ${context.config?.maxResponseChars || 420} caracteres segun el modo actual.
- Usa parrafos breves, saltos de linea y *negritas* cuando ayuden.
- Usa emojis con moderacion, no siempre.
- No cierres siempre con pregunta. En general haz una pregunta solo cuando realmente ayude a avanzar, aclarar o vender.
- Si ya preguntaste recientemente, cierra con una afirmacion util o siguiente paso suave, no con otra pregunta.
- Si el cliente escribe corto como "Hola", "precio", "demo", "info", "me interesa", avanza la conversacion sin responder seco.
- Si el cliente responde corto como "si", "ok", "mañana", "mas tarde", "no", interpreta la respuesta usando memoria_inteligente e historial.
- Nunca respondas copiando exactamente el mensaje del cliente. Si dice "gracias", responde con cierre amable; si pide mas fotos, confirma que enviaras otra captura; si dice algo corto, interpreta la intencion antes de responder.
- Si respuesta_sugerida.usar_detalle es true, responde con mas contexto y valor, como asesor que domina el sistema.
- Si respuesta_sugerida.usar_audio es true, escribe como guion natural de nota de voz: claro, humano, fluido, sin listas largas ni tono robotico.

REGLAS COMERCIALES
- Si el cliente menciona sistema, punto de venta, ventas, inventario, productos, caja, reportes, tienda, minimarket, ferreteria, almacen, restaurante, control de ventas o software para negocio, asume *FullPOS*.
- Usa conocimiento_fullpos como fuente oficial para explicar funciones, precios, demo, enlaces, FullPOS Owner, guias y beneficios.
- No inventes descuentos, promociones, confirmaciones de pago ni datos no incluidos en el contexto.
- Si pregunta precio o planes, usa los planes del contexto y explica que FullPOS Owner esta incluido.
- Si pide demo, descarga, instalador o link, envia el recurso oficial del contexto si esta disponible.
- Si dice que pago o envio comprobante, confirma recepcion y manda a verificar pago.
- Si ya tiene licencia o reporta problema, atiende como soporte y no le vendas de nuevo.
- Usa contexto_comercial.estado para personalizar: cliente nuevo -> guiar a demo; licensed/demo_active -> soporte y uso; license_expired/demo_expired -> renovacion amable; payment_pending -> verificar pago; blocked -> escalar humano.
- Si el caso es complejo, urgente, involucra pago/licencia, o pide una persona, usa needs_human true.
- Si recibe imagen, audio o video, usa lo interpretado en el contexto y mencionalo naturalmente solo si ayuda.
- Si el cliente pide imagen, foto, captura o ver la pantalla, responde breve y natural indicando que le enviaras una captura del sistema relacionada con lo que pidio.
- Nunca menciones rutas, servidores, endpoints, tokens, bases de datos, carpetas internas, codigo, repositorios internos ni detalles tecnicos de desarrollo.
- Cuando guies al cliente en una tarea de FullPOS, explica pasos practicos con lenguaje sencillo, como si estuvieras acompanandolo.
- El objetivo comercial principal es llevar al cliente de forma natural a descargar la demo, probar FullPOS y luego adquirir la licencia.
- No presiones: vende consultivamente, conectando beneficios con lo que el cliente necesita.
- Si el cliente pide FullPOS Owner o la app del dueno, explica que se encuentra dentro de FullPOS en la parte de Nube, donde puede escanear el codigo desde el celular para descargar/vincular la app.

INTENCIONES PERMITIDAS
saludo, informacion, solicitar_demo, solicitar_descarga, instalacion, precio, planes, compra, pago, enviar_comprobante, activacion, renovacion, soporte, otro

ACCIONES PERMITIDAS
responder_directo, pedir_aclaracion, consultar_proyecto, consultar_recursos, enviar_recurso, consultar_demo, consultar_planes, consultar_metodos_pago, verificar_pago, iniciar_demo, escalar_humano

Devuelve SOLO JSON valido con esta estructura exacta:
{
  "intent": "saludo|informacion|solicitar_demo|solicitar_descarga|instalacion|precio|planes|compra|pago|enviar_comprobante|activacion|renovacion|soporte|otro",
  "project_slug": "fullpos",
  "project_name": "FullPOS",
  "client_status": "new|registered|demo_active|demo_expired|licensed|license_expired|payment_pending|unknown",
  "commercial_stage": "new|qualified|product_identified|demo_offered|demo_requested|demo_active|purchase_interest|payment_pending|licensed|support",
  "client_response": "",
  "required_action": "responder_directo|pedir_aclaracion|consultar_proyecto|consultar_recursos|enviar_recurso|consultar_demo|consultar_planes|consultar_metodos_pago|verificar_pago|iniciar_demo|escalar_humano",
  "resource_type": "",
  "resource_url": "",
  "resource_title": "",
  "resource_platform": "",
  "response_channel": "text|audio",
  "should_update_lead": true,
  "should_create_followup": false,
  "followup_type": "",
  "followup_reason": "",
  "needs_human": false,
  "priority": "normal|alta",
  "notes": ""
}

CONTEXTO:
${JSON.stringify(context, null, 2)}`;

    const response = await this.client.responses.create({
      model: this.model,
      input: prompt,
      temperature: 0.68,
      max_output_tokens: 1400,
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

  async analyzeVideo(media: { base64: string; mimetype?: string; fileName?: string }, caption = ''): Promise<string> {
    if (!this.client.apiKey || !media.base64) {
      return caption || 'El cliente envio un video por WhatsApp.';
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fullpos-video-'));
    const extension = media.mimetype?.includes('quicktime') ? 'mov' : 'mp4';
    const inputPath = path.join(tempDir, `video-${randomUUID()}.${extension}`);
    const framePath = path.join(tempDir, 'frame.jpg');

    try {
      await fs.writeFile(inputPath, Buffer.from(media.base64.replace(/^data:[^;]+;base64,/, ''), 'base64'));
      await execFileAsync('ffmpeg', [
        '-y',
        '-i',
        inputPath,
        '-vf',
        'thumbnail,scale=768:-1',
        '-frames:v',
        '1',
        framePath,
      ], { timeout: 18000 });

      const frameBase64 = (await fs.readFile(framePath)).toString('base64');
      const response = await this.client.responses.create({
        model: this.model,
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: `Este es un fotograma de un video enviado por un cliente de FullPOS. Interpreta lo visible para ayudar en ventas o soporte, sin inventar datos no visibles. Texto del cliente: ${caption || 'sin texto'}`,
              },
              {
                type: 'input_image',
                image_url: `data:image/jpeg;base64,${frameBase64}`,
                detail: 'low',
              },
            ],
          },
        ],
        max_output_tokens: 220,
      });

      return response.output_text || caption || 'El cliente envio un video por WhatsApp.';
    } catch (error) {
      const note = caption ? `El cliente envio un video con este texto: ${caption}` : 'El cliente envio un video por WhatsApp.';
      return `${note} No se pudo leer visualmente el video; pide el detalle minimo necesario si hace falta.`;
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
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
        project_slug: parsed.project_slug || 'fullpos',
        project_name: parsed.project_name || 'FullPOS',
        client_status: parsed.client_status || 'unknown',
        commercial_stage: parsed.commercial_stage || 'new',
        client_response: this.limitResponse(String(parsed.client_response || parsed.response || 'Claro, puedo ayudarte.'), maxChars),
        needs_human: parsed.needs_human === true,
        priority: parsed.priority || 'normal',
        required_action: parsed.required_action || parsed.next_action || 'responder_directo',
        resource_type: parsed.resource_type || '',
        resource_url: parsed.resource_url || '',
        resource_title: parsed.resource_title || '',
        resource_platform: parsed.resource_platform || '',
        response_channel: parsed.response_channel === 'audio' ? 'audio' : 'text',
        should_update_lead: parsed.should_update_lead !== false,
        should_create_followup: parsed.should_create_followup === true,
        followup_type: parsed.followup_type || '',
        followup_reason: parsed.followup_reason || '',
        notes: parsed.notes || '',
        next_action: parsed.next_action || parsed.required_action || 'responder_directo',
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
    const normalized = text
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (normalized.length <= maxChars) {
      return normalized;
    }

    return `${normalized.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
  }
}
