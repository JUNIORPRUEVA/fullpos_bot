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
  apiKey: process.env.WHATSAPP_API_KEY || '',
  instance: process.env.WHATSAPP_INSTANCE || 'apyra',
});

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

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    const message = body?.data?.message;
    const key = body?.data?.key || {};
    const remoteJid = key?.remoteJid;

    if (!remoteJid || !message) {
      return res.status(400).json({ ok: false, error: 'payload_invalido' });
    }

    const fromMe = key?.fromMe === true;
    const hasText = Boolean(message?.conversation);
    const hasImage = Boolean(message?.imageMessage);
    const hasAudio = Boolean(message?.audioMessage);
    const hasLocation = Boolean(message?.locationMessage);

    const tipoMensaje = hasLocation ? 'ubicacion' : hasAudio ? 'audio' : hasImage ? 'image' : 'text';
    const pauseKey = `pause:${remoteJid}`;

    if (fromMe && (hasText || hasImage || hasAudio)) {
      await redis.set(pauseKey, '1', 900);
    }

    const pauseActive = await redis.get(pauseKey);
    if (pauseActive) {
      return res.json({ ok: true, skipped: true, reason: 'pausa_activa' });
    }

    const normalizedPhone = String(remoteJid || '').replace(/@.*/, '').replace(/[^0-9]/g, '');
    const customer = await postgres.getCustomerByPhone(normalizedPhone);
    const licenses = await postgres.getLicensesByCustomer(customer?.id || '');

    const config = configService.get();
    const targetNumber = config.destinationNumber || remoteJid;

    const context = {
      mensaje: message?.conversation || '',
      tipo_mensaje: tipoMensaje,
      telefono: remoteJid,
      instancia: body?.instance || process.env.WHATSAPP_INSTANCE || 'apyra',
      cliente: customer,
      licencias: licenses,
      contexto_comercial: {
        negocio: customer?.nombre_negocio || '',
        estado: customer ? 'registered' : 'unknown',
      },
      historial: [],
      recursos: [],
    };

    const agentReply = await openai.generateAgentReply(context);
    const responseText = agentReply?.client_response || 'Gracias por tu mensaje.';

    if (config.autoReplyEnabled) {
      await whatsapp.sendText(targetNumber, responseText, body?.instance || config.whatsappInstance || process.env.WHATSAPP_INSTANCE || 'apyra');
    }

    const signature = createHash('sha256').update(`${remoteJid}:${responseText}`).digest('hex');
    return res.json({ ok: true, signature, response: responseText });
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

    const context = {
      mensaje: mensaje,
      tipo_mensaje: 'text',
      telefono: telefono,
      cliente: null,
      licencias: [],
      contexto_comercial: { negocio: 'desconocido', estado: 'unknown' },
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
