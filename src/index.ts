import express from 'express';
import dotenv from 'dotenv';
import { createHash } from 'crypto';
import path from 'node:path';
import { RedisService } from './services/redis';
import { PostgresService } from './services/postgres';
import { OpenAIService } from './services/openai';
import { WhatsAppService } from './services/whatsapp';
import { ConfigService } from './services/config';

dotenv.config();

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(process.cwd(), 'public')));

const configService = new ConfigService();
const redis = new RedisService(process.env.REDIS_URL || 'redis://localhost:6379');
const postgres = new PostgresService(process.env.POSTGRES_URL || 'postgres://user:password@localhost:5432/db');
const openai = new OpenAIService(process.env.OPENAI_API_KEY || '', process.env.OPENAI_MODEL || 'gpt-4o');
const whatsapp = new WhatsAppService({
  baseUrl: process.env.WHATSAPP_BASE_URL || '',
  apiKey: process.env.EVOLUTION_GLOBAL_API_KEY || process.env.WHATSAPP_API_KEY || '',
  instance: process.env.WHATSAPP_INSTANCE || 'apyra',
});

function getMessageText(message: any): string {
  return String(
    message?.conversation
    || message?.extendedTextMessage?.text
    || message?.imageMessage?.caption
    || message?.videoMessage?.caption
    || '',
  ).trim();
}

function getMessageType(message: any): string {
  if (message?.locationMessage) return 'ubicacion';
  if (message?.audioMessage) return 'audio';
  if (message?.imageMessage) return 'image';
  if (message?.videoMessage) return 'video';
  if (getMessageText(message)) return 'text';
  return 'unknown';
}

function getLocationText(message: any): string {
  const location = message?.locationMessage;
  if (!location) return '';
  const lat = location.degreesLatitude || location.latitude || '';
  const lng = location.degreesLongitude || location.longitude || '';
  const label = location.name || location.address || '';
  const maps = lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : '';
  return [label, maps].filter(Boolean).join(' | ');
}

function getWebhookMedia(body: any, tipoMensaje: string): { base64: string; mimetype?: string; fileName?: string } | null {
  const message = body?.data?.message || {};
  const typedMessage = tipoMensaje === 'audio'
    ? message.audioMessage
    : tipoMensaje === 'image'
      ? message.imageMessage
      : tipoMensaje === 'video'
        ? message.videoMessage
        : null;

  const base64 = body?.data?.base64
    || body?.data?.message?.base64
    || typedMessage?.base64
    || typedMessage?.media
    || '';

  if (!base64 || typeof base64 !== 'string') {
    return null;
  }

  return {
    base64: base64.replace(/^data:[^;]+;base64,/, ''),
    mimetype: typedMessage?.mimetype || body?.data?.mimetype,
    fileName: typedMessage?.fileName || body?.data?.fileName,
  };
}

async function wait(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

app.get('/config', (_req, res) => {
  res.json(configService.get());
});

app.post('/config', (req, res) => {
  try {
    const updated = configService.set(req.body);
    res.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error_actualizando_config';
    res.status(500).json({ ok: false, error: message });
  }
});

app.post('/connect-webhook', async (_req, res) => {
  try {
    const config = configService.get();
    const data = await whatsapp.configureWebhook(config.whatsappInstance, config.webhookUrl);
    res.json({ ok: true, webhookUrl: config.webhookUrl, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error_conectando_webhook';
    res.status(500).json({ ok: false, error: message });
  }
});

app.get('/status', async (_req, res) => {
  try {
    const config = configService.get();
    const state = await whatsapp.getConnectionState(config.whatsappInstance);
    const instance = await whatsapp.fetchInstance(config.whatsappInstance);
    res.json({
      ok: true,
      service: 'fullpos-agente-bot',
      config,
      whatsapp: state,
      instance: instance ? {
        name: instance.name,
        connectionStatus: instance.connectionStatus,
        ownerJid: instance.ownerJid,
        profileName: instance.profileName,
        number: instance.number,
        disconnectionReasonCode: instance.disconnectionReasonCode,
        disconnectionObject: instance.disconnectionObject,
      } : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error_status';
    res.status(500).json({ ok: false, error: message });
  }
});

app.post('/evolution/restart', async (_req, res) => {
  try {
    const config = configService.get();
    const data = await whatsapp.restartInstance(config.whatsappInstance);
    res.json({ ok: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error_reiniciando_instancia';
    res.status(500).json({ ok: false, error: message });
  }
});

app.post('/evolution/logout', async (_req, res) => {
  try {
    const config = configService.get();
    const data = await whatsapp.logoutInstance(config.whatsappInstance);
    res.json({ ok: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error_cerrando_sesion';
    res.status(500).json({ ok: false, error: message });
  }
});

app.post('/evolution/create-instance', async (req, res) => {
  try {
    const config = configService.get();
    const requestedName = String(req.body?.instanceName || '').trim();
    const instanceName = (requestedName || `fullpos_${Date.now()}`)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 48);
    const data = await whatsapp.createInstance(instanceName, config.webhookUrl);

    if (data.status >= 400) {
      return res.status(data.status).json({ ok: false, instanceName, data: data.data });
    }

    const updatedConfig = configService.set({ whatsappInstance: instanceName });
    return res.json({ ok: true, instanceName, config: updatedConfig, data: data.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error_creando_instancia';
    return res.status(500).json({ ok: false, error: message });
  }
});

app.get('/evolution/connect', async (_req, res) => {
  try {
    const config = configService.get();
    const data = await whatsapp.connectInstance(config.whatsappInstance);
    res.json({ ok: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error_obteniendo_conexion';
    res.status(500).json({ ok: false, error: message });
  }
});

app.post('/whatsapp/send-test', async (req, res) => {
  try {
    const config = configService.get();
    const telefono = String(req.body?.telefono || '').trim();
    const mensaje = String(req.body?.mensaje || 'Prueba FullPOS desde panel.').trim();

    if (!telefono) {
      return res.status(400).json({ ok: false, error: 'telefono requerido' });
    }

    const remoteJid = telefono.includes('@') ? telefono : `${telefono.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    const sendData = await whatsapp.sendText(remoteJid, mensaje, config.whatsappInstance);
    const messageId = sendData?.key?.id || '';
    const record = messageId
      ? await whatsapp.waitForMessageUpdate(config.whatsappInstance, messageId, sendData?.key?.remoteJid || remoteJid)
      : null;
    const updates = record?.MessageUpdate || [];
    const lastStatus = updates.at(-1)?.status || sendData?.status || 'PENDING';

    res.json({
      ok: true,
      sentToApi: true,
      messageId,
      remoteJid: sendData?.key?.remoteJid || remoteJid,
      initialStatus: sendData?.status,
      deliveryStatus: lastStatus,
      delivered: ['SERVER_ACK', 'DELIVERY_ACK', 'READ'].includes(lastStatus),
      updates,
      record: record ? {
        messageTimestamp: record.messageTimestamp,
        messageType: record.messageType,
        text: record.message?.conversation || '',
      } : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error_enviando_prueba';
    res.status(500).json({ ok: false, error: message });
  }
});

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    const message = body?.data?.message;
    const key = body?.data?.key || {};
    const remoteJid = key?.remoteJid;

    if (!remoteJid || !message) {
      return res.status(400).json({ ok: false, error: 'payload_invalido' });
    }

    const config = configService.get();
    openai.setModel(config.openaiModel);
    const fromMe = key?.fromMe === true;
    const tipoMensaje = getMessageType(message);
    const pauseKey = `pause:${remoteJid}`;
    const memoryKey = `memory:${remoteJid}`;
    const instance = body?.instance || config.whatsappInstance || process.env.WHATSAPP_INSTANCE || 'apyra';

    if (fromMe && tipoMensaje !== 'unknown') {
      await redis.set(pauseKey, '1', Math.max(60, Number(config.pauseMinutes || 15) * 60));
      return res.json({ ok: true, skipped: true, reason: 'mensaje_humano_pausa_activada' });
    }

    const pauseActive = await redis.get(pauseKey);
    if (pauseActive) {
      return res.json({ ok: true, skipped: true, reason: 'pausa_activa' });
    }

    const normalizedPhone = String(remoteJid || '').replace(/@.*/, '').replace(/[^0-9]/g, '');
    const customer = await postgres.getCustomerByPhone(normalizedPhone);
    const licenses = await postgres.getLicensesByCustomer(customer?.id || '');
    const targetNumber = config.destinationNumber || remoteJid;
    let userMessage = getMessageText(message);

    if (tipoMensaje === 'ubicacion') {
      userMessage = getLocationText(message) || 'El cliente envio una ubicacion.';
    }

    if ((tipoMensaje === 'audio' || tipoMensaje === 'image') && key?.id) {
      try {
        const media = getWebhookMedia(body, tipoMensaje) || await whatsapp.fetchMediaBase64(key.id, instance);
        if (media?.base64 && tipoMensaje === 'audio') {
          userMessage = await openai.transcribeAudio(media);
        }
        if (media?.base64 && tipoMensaje === 'image') {
          userMessage = await openai.analyzeImage(media, userMessage);
        }
      } catch (error) {
        const mediaError = error instanceof Error ? error.message : 'error_media';
        console.warn(`No se pudo procesar media: ${mediaError}`);
      }
    }

    if (!userMessage) {
      return res.json({ ok: true, skipped: true, reason: 'mensaje_sin_contenido_util' });
    }

    const history = await redis.getJsonList(memoryKey, 10);

    const context = {
      mensaje: userMessage,
      tipo_mensaje: tipoMensaje,
      telefono: remoteJid,
      instancia: instance,
      cliente: customer,
      licencias: licenses,
      contexto_comercial: {
        negocio: customer?.nombre_negocio || '',
        estado: customer ? 'registered' : 'unknown',
      },
      historial: history,
      recursos: [],
      config: {
        businessName: config.businessName,
        businessSummary: config.businessSummary,
        responseStyle: config.responseStyle,
        maxResponseChars: config.maxResponseChars,
      },
    };

    const agentReply = await openai.generateAgentReply(context);
    const responseText = agentReply?.client_response || 'Gracias por tu mensaje.';
    let sent = false;
    let sendError = '';

    if (config.autoReplyEnabled) {
      try {
        await wait(Number(config.humanDelayMs || 0));
        const shouldReplyWithAudio = config.responseMode === 'audio' || (config.responseMode === 'auto' && tipoMensaje === 'audio');
        if (shouldReplyWithAudio) {
          try {
            const audioBase64 = await openai.generateSpeechBase64(responseText, config.ttsVoice);
            await whatsapp.sendAudio(targetNumber, audioBase64, instance, Number(config.humanDelayMs || 1200));
            sent = true;
          } catch (error) {
            const audioError = error instanceof Error ? error.message : 'error_audio_respuesta';
            console.warn(`No se pudo enviar audio, enviando texto: ${audioError}`);
            await whatsapp.sendText(targetNumber, responseText, instance);
            sent = true;
          }
        } else {
          await whatsapp.sendText(targetNumber, responseText, instance);
          sent = true;
        }
      } catch (error) {
        sendError = error instanceof Error ? error.message : 'error_envio_whatsapp';
        console.warn(`No se pudo enviar respuesta por WhatsApp: ${sendError}`);
      }
    }

    await redis.pushJson(memoryKey, { role: 'user', text: userMessage, at: new Date().toISOString() }, 12, 60 * 60 * 24 * 14);
    await redis.pushJson(memoryKey, { role: 'assistant', text: responseText, at: new Date().toISOString() }, 12, 60 * 60 * 24 * 14);

    const signature = createHash('sha256').update(`${remoteJid}:${responseText}`).digest('hex');
    return res.json({ ok: true, signature, response: responseText, agent: agentReply, sent, sendError: sendError || undefined });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error_desconocido';
    return res.status(500).json({ ok: false, error: message });
  }
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'fullpos-agente-bot' });
});

app.post('/test-message', async (req, res) => {
  try {
    const { telefono, mensaje } = req.body;
    if (!telefono || !mensaje) {
      return res.status(400).json({ ok: false, error: 'telefono y mensaje requeridos' });
    }

    const config = configService.get();
    openai.setModel(config.openaiModel);
    const context = {
      mensaje: mensaje,
      tipo_mensaje: 'text',
      telefono: telefono,
      cliente: null,
      licencias: [],
      contexto_comercial: { negocio: 'desconocido', estado: 'unknown' },
      historial: [],
      config: {
        businessName: config.businessName,
        businessSummary: config.businessSummary,
        responseStyle: config.responseStyle,
        maxResponseChars: config.maxResponseChars,
      },
    };

    const agentReply = await openai.generateAgentReply(context);
    const responseText = agentReply?.client_response || 'Respuesta del agente no disponible.';

    return res.json({ ok: true, respuesta: responseText, telefono, mensaje });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error_prueba';
    return res.status(500).json({ ok: false, error: message });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`Servidor escuchando en puerto ${port}`);
});
