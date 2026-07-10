import express from 'express';
import dotenv from 'dotenv';
import { createHash } from 'crypto';
import path from 'node:path';
import { RedisService } from './services/redis';
import { PostgresService } from './services/postgres';
import { OpenAIService } from './services/openai';
import { WhatsAppService } from './services/whatsapp';
import { MetaWhatsAppService } from './services/meta';
import { ConfigService } from './services/config';
import { buildKnowledgeContext, strengthenClientResponse } from './services/knowledge';
import { isAskingForImage, publicAssetUrl, selectFullposImage } from './services/imageAssets';
import {
  controlQuestionCadence,
  defaultConversationMemory,
  extractTrailingQuestion,
  humanDelayForText,
  interpretShortMessage,
  splitWhatsAppText,
  updateConversationMemory,
  type ConversationMemory,
} from './services/conversation';

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
const metaWhatsapp = new MetaWhatsAppService({
  token: process.env.META_WHATSAPP_TOKEN || '',
  phoneNumberId: process.env.META_PHONE_NUMBER_ID || '622270290979970',
  graphVersion: process.env.META_GRAPH_VERSION || 'v25.0',
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

function getMetaMessageText(message: any): string {
  return String(
    message?.text?.body
    || message?.image?.caption
    || message?.video?.caption
    || message?.button?.text
    || message?.interactive?.button_reply?.title
    || message?.interactive?.button_reply?.id
    || message?.interactive?.list_reply?.title
    || message?.interactive?.list_reply?.id
    || '',
  ).trim();
}

function getMetaMessageType(message: any): string {
  if (message?.type === 'location') return 'ubicacion';
  if (message?.type === 'audio' || message?.type === 'voice') return 'audio';
  if (message?.type === 'image') return 'image';
  if (message?.type === 'video') return 'video';
  if (getMetaMessageText(message)) return 'text';
  return message?.type || 'unknown';
}

function getMetaLocationText(message: any): string {
  const location = message?.location;
  if (!location) return '';
  const label = location.name || location.address || '';
  const maps = location.latitude && location.longitude
    ? `https://www.google.com/maps?q=${location.latitude},${location.longitude}`
    : '';
  return [label, maps].filter(Boolean).join(' | ');
}

function getMetaMediaId(message: any, tipoMensaje: string): string {
  if (tipoMensaje === 'audio') return message?.audio?.id || message?.voice?.id || '';
  if (tipoMensaje === 'image') return message?.image?.id || '';
  if (tipoMensaje === 'video') return message?.video?.id || '';
  return '';
}

async function wait(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function buildAgentResponse(params: {
  userMessage: string;
  tipoMensaje: string;
  remoteJid: string;
  instance: string;
  customer?: any;
  licenses?: any[];
  history?: any[];
}) {
  const config = configService.get();
  openai.setModel(config.openaiModel);
  const normalizedPhone = String(params.remoteJid || '').replace(/@.*/, '').replace(/[^0-9]/g, '');
  const customer = params.customer !== undefined ? params.customer : await postgres.getCustomerByPhone(normalizedPhone);
  const licenses = params.licenses !== undefined ? params.licenses : await postgres.getLicensesByCustomer(customer?.id || '');
  const customerProfile = postgres.classifyCustomer(customer, licenses);
  const memoryKey = `memory:${params.remoteJid}`;
  const conversationKey = `conversation:${params.remoteJid}`;
  const history = params.history !== undefined ? params.history : await redis.getJsonList(memoryKey, 10);
  const storedConversation = await redis.get(conversationKey);
  let conversationMemory: ConversationMemory = defaultConversationMemory();
  if (storedConversation) {
    try {
      conversationMemory = { ...defaultConversationMemory(), ...JSON.parse(storedConversation) };
    } catch {
      conversationMemory = defaultConversationMemory();
    }
  }
  const storedLearning = await redis.get('learning:fullpos:rolling');
  let learningContext: any = null;
  if (storedLearning) {
    try {
      const parsed = JSON.parse(storedLearning);
      learningContext = {
        total: parsed.total || 0,
        topicCounts: parsed.topicCounts || {},
        intentCounts: parsed.intentCounts || {},
        shortPhrases: parsed.shortPhrases || {},
      };
    } catch {
      learningContext = null;
    }
  }
  const interpretedMessage = interpretShortMessage(params.userMessage, conversationMemory);
  const isShortContextReply = params.userMessage.trim().length <= 18
    && !/\b(precio|precios|demo|info|informacion|informaci[oó]n|owner|app|fullpos)\b/i.test(params.userMessage.trim())
    && (conversationMemory.lastTopics || []).length > 0;
  const knowledgeMessage = isShortContextReply
    ? `${params.userMessage} ${(conversationMemory.lastTopics || []).join(' ')}`
    : interpretedMessage;
  const knowledgeContext = buildKnowledgeContext(knowledgeMessage, params.tipoMensaje, config);

  const context = {
    mensaje: interpretedMessage,
    mensaje_original: params.userMessage,
    tipo_mensaje: params.tipoMensaje,
    telefono: params.remoteJid,
    instancia: params.instance,
    cliente: customer,
    licencias: licenses,
    contexto_comercial: {
      negocio: customer?.nombre_negocio || '',
      estado: customerProfile.status,
      descripcion_estado: customerProfile.label,
      licencia_activa: customerProfile.activeLicense || null,
      ultima_licencia: customerProfile.latestLicense || null,
    },
    historial: history,
    memoria_inteligente: conversationMemory,
    aprendizaje_reciente: learningContext,
    recursos: knowledgeContext.resources,
    conocimiento_fullpos: knowledgeContext.knowledge,
    temas_detectados: knowledgeContext.topics,
    respuesta_sugerida: {
      usar_detalle: knowledgeContext.shouldUseDetailedAnswer,
      usar_audio: knowledgeContext.shouldUseAudio,
      pista: knowledgeContext.responseHint,
    },
    config: {
      businessName: config.businessName,
      businessSummary: config.businessSummary,
      responseStyle: config.responseStyle,
      maxResponseChars: knowledgeContext.maxResponseChars,
    },
  };

  const agentReply = await openai.generateAgentReply(context);
  const strongResponse = strengthenClientResponse(
    interpretedMessage,
    agentReply?.client_response || 'Gracias por tu mensaje.',
    knowledgeContext,
    params.userMessage,
  );
  const needsQuestion = agentReply?.required_action === 'pedir_aclaracion'
    || agentReply?.needs_human === true
    || knowledgeContext.topics.length === 0 && conversationMemory.turnsSinceQuestion >= 2;
  const responseText = controlQuestionCadence(strongResponse, conversationMemory, needsQuestion);
  agentReply.client_response = responseText;
  const sentQuestion = Boolean(extractTrailingQuestion(responseText));
  const updatedConversation = updateConversationMemory({
    previous: conversationMemory,
    userMessage: params.userMessage,
    assistantMessage: responseText,
    intent: agentReply?.intent,
    topics: knowledgeContext.topics,
    sentQuestion,
  });

  await redis.pushJson(memoryKey, { role: 'user', text: params.userMessage, at: new Date().toISOString() }, 12, 60 * 60 * 24 * 14);
  await redis.pushJson(memoryKey, { role: 'assistant', text: responseText, at: new Date().toISOString() }, 12, 60 * 60 * 24 * 14);
  await redis.set(conversationKey, JSON.stringify(updatedConversation), 60 * 60 * 24 * 45);
  await recordLearningSignal({
    userMessage: params.userMessage,
    topics: knowledgeContext.topics,
    intent: agentReply?.intent,
    responseText,
  });

  return {
    responseText,
    agentReply,
    knowledgeContext,
    conversationMemory: updatedConversation,
  };
}

function shouldSendAudio(params: {
  responseMode: 'text' | 'audio' | 'auto';
  tipoMensaje: string;
  knowledgeContext?: { shouldUseAudio?: boolean };
  agentReply?: any;
}): boolean {
  if (params.responseMode === 'audio') return true;
  if (params.responseMode === 'text') return false;
  return params.tipoMensaje === 'audio'
    || params.knowledgeContext?.shouldUseAudio === true
    || params.agentReply?.response_channel === 'audio';
}

async function sendMetaTextNaturally(to: string, text: string, messageIdForTyping = ''): Promise<any> {
  const config = configService.get();
  const chunks = splitWhatsAppText(text, Number(config.messageChunkChars || 650));
  let lastSend: any = null;
  for (const [index, chunk] of chunks.entries()) {
    if (config.typingIndicatorEnabled && messageIdForTyping) {
      await metaWhatsapp.sendTypingIndicator(messageIdForTyping).catch(() => undefined);
    }
    if (index > 0) {
      await wait(Number(config.interMessageDelayMs || 1400));
    }
    await wait(Math.min(2600, humanDelayForText(chunk)));
    lastSend = await metaWhatsapp.sendText(to, chunk);
  }
  return lastSend;
}

async function sendEvolutionTextNaturally(remoteJid: string, text: string, instance: string): Promise<void> {
  const config = configService.get();
  const chunks = splitWhatsAppText(text, Number(config.messageChunkChars || 650));
  for (const [index, chunk] of chunks.entries()) {
    if (config.typingIndicatorEnabled) {
      await whatsapp.sendPresence(remoteJid, instance, 'composing').catch(() => undefined);
    }
    if (index > 0) {
      await wait(Number(config.interMessageDelayMs || 1400));
    }
    await whatsapp.sendText(remoteJid, chunk, instance, Math.min(3500, humanDelayForText(chunk)));
  }
}

async function notifyHumanIfNeeded(params: {
  provider: 'meta' | 'evolution';
  customerPhone: string;
  userMessage: string;
  responseText: string;
  agentReply: any;
  sendMeta?: boolean;
}): Promise<void> {
  const config = configService.get();
  const action = String(params.agentReply?.required_action || params.agentReply?.next_action || '');
  const needsHuman = params.agentReply?.needs_human === true || action === 'escalar_humano' || action === 'derivar_humano';
  const humanNumber = String(config.humanAlertNumber || '').replace(/[^0-9]/g, '');

  if (!config.humanAlertEnabled || !needsHuman || !humanNumber) return;

  const alert = [
    '*FullPOS - cliente necesita humano*',
    `Cliente: ${params.customerPhone}`,
    `Intencion: ${params.agentReply?.intent || 'otro'}`,
    `Accion: ${action || 'sin_accion'}`,
    `Prioridad: ${params.agentReply?.priority || 'normal'}`,
    '',
    `Mensaje: ${params.userMessage.slice(0, 700)}`,
    '',
    `Respuesta del bot: ${params.responseText.slice(0, 700)}`,
  ].join('\n');

  try {
    if (params.provider === 'meta' || params.sendMeta) {
      await metaWhatsapp.sendText(humanNumber, alert);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error_alerta_humano';
    console.warn(`No se pudo enviar alerta humana: ${message}`);
  }
}

async function recordLearningSignal(params: {
  userMessage: string;
  topics: string[];
  intent?: string;
  responseText: string;
}): Promise<void> {
  const key = 'learning:fullpos:rolling';
  let data: any = {
    total: 0,
    topicCounts: {},
    intentCounts: {},
    shortPhrases: {},
    examples: [],
    updatedAt: new Date().toISOString(),
  };

  const stored = await redis.get(key);
  if (stored) {
    try {
      data = { ...data, ...JSON.parse(stored) };
    } catch {
      data = { ...data };
    }
  }

  data.total = Number(data.total || 0) + 1;
  for (const topic of params.topics) {
    data.topicCounts[topic] = Number(data.topicCounts[topic] || 0) + 1;
  }
  const intent = params.intent || 'otro';
  data.intentCounts[intent] = Number(data.intentCounts[intent] || 0) + 1;
  if (params.userMessage.trim().length <= 18) {
    const phrase = params.userMessage.trim().toLowerCase();
    data.shortPhrases[phrase] = Number(data.shortPhrases[phrase] || 0) + 1;
  }
  data.examples = [
    {
      at: new Date().toISOString(),
      message: params.userMessage.slice(0, 180),
      topics: params.topics,
      intent,
      response: params.responseText.slice(0, 220),
    },
    ...(Array.isArray(data.examples) ? data.examples : []),
  ].slice(0, 40);
  data.updatedAt = new Date().toISOString();

  await redis.set(key, JSON.stringify(data), 60 * 60 * 24 * 30);
}

async function logConversationMessage(params: {
  phone: string;
  direction: 'in' | 'out';
  text: string;
  type?: string;
  provider?: string;
  status?: number | string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const phone = params.phone.replace(/[^0-9]/g, '');
  if (!phone) return;
  const item = {
    at: new Date().toISOString(),
    direction: params.direction,
    text: params.text,
    type: params.type || 'text',
    provider: params.provider || 'meta',
    status: params.status || '',
    meta: params.meta || {},
  };
  await redis.pushJson(`messages:${phone}`, item, 80, 60 * 60 * 24 * 60);
  await redis.addToSet('conversations:phones', phone, 60 * 60 * 24 * 60);
  await redis.set(`conversation:last:${phone}`, JSON.stringify(item), 60 * 60 * 24 * 60);
}

async function getConversationList(): Promise<any[]> {
  const phones = await redis.getSetMembers('conversations:phones');
  const rows = await Promise.all(phones.map(async (phone) => {
    const lastRaw = await redis.get(`conversation:last:${phone}`);
    const pauseTtl = await redis.ttl(`pause:${phone}`);
    let last: any = null;
    if (lastRaw) {
      try {
        last = JSON.parse(lastRaw);
      } catch {
        last = null;
      }
    }
    return {
      phone,
      last,
      paused: pauseTtl > 0,
      pauseSeconds: pauseTtl > 0 ? pauseTtl : 0,
    };
  }));

  return rows.sort((a, b) => String(b.last?.at || '').localeCompare(String(a.last?.at || '')));
}

const DEMO_BUTTON_COOLDOWN_SECONDS = 60 * 30;
const DEMO_DOWNLOAD_URL = 'https://github.com/JUNIORPRUEVA/fullpos-releases/releases/latest/download/FullPOS-Setup.exe';

function clientAskedForDemoButton(userMessage: string): boolean {
  return /\b(demo|descarg|descargar|instalador|instalar|link|enlace|probar|prueba|bajar)\b/i.test(userMessage);
}

function agentIsDeliveringDemo(agentReply: any, topics: string[]): boolean {
  const resourceText = `${agentReply?.resource_type || ''} ${agentReply?.resource_url || ''} ${agentReply?.resource_title || ''}`.toLowerCase();
  const action = String(agentReply?.required_action || '').toLowerCase();
  const intent = String(agentReply?.intent || '').toLowerCase();

  return resourceText.includes('fullpos-releases')
    || resourceText.includes('setup.exe')
    || (topics.includes('demo') && ['solicitar_demo', 'solicitar_descarga', 'instalacion'].includes(intent))
    || ['enviar_recurso', 'iniciar_demo'].includes(action) && /\b(demo|descarga|instalador|setup)\b/i.test(resourceText);
}

async function shouldSendDemoButton(phone: string, userMessage: string, agentReply: any, topics: string[]): Promise<boolean> {
  if (!clientAskedForDemoButton(userMessage) && !agentIsDeliveringDemo(agentReply, topics)) return false;

  const key = `demo-button:${phone.replace(/[^0-9]/g, '')}`;
  const ttl = await redis.ttl(key);
  if (ttl > 0) return false;

  await redis.set(key, new Date().toISOString(), DEMO_BUTTON_COOLDOWN_SECONDS);
  return true;
}

function getPublicBaseUrl(): string {
  const config = configService.get();
  try {
    const fromMeta = new URL(config.metaWebhookUrl);
    return `${fromMeta.protocol}//${fromMeta.host}`;
  } catch {
    return 'https://fullpos-backend-fullpos-bot.onqyr1.easypanel.host';
  }
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

app.get('/conversations', async (_req, res) => {
  try {
    const conversations = await getConversationList();
    res.json({ ok: true, conversations });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error_conversaciones';
    res.status(500).json({ ok: false, error: message });
  }
});

app.get('/conversations/:phone/messages', async (req, res) => {
  try {
    const phone = String(req.params.phone || '').replace(/[^0-9]/g, '');
    const messages = await redis.getJsonList(`messages:${phone}`, 80);
    const pauseSeconds = await redis.ttl(`pause:${phone}`);
    res.json({ ok: true, phone, paused: pauseSeconds > 0, pauseSeconds: Math.max(0, pauseSeconds), messages });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error_mensajes';
    res.status(500).json({ ok: false, error: message });
  }
});

app.post('/conversations/:phone/pause', async (req, res) => {
  try {
    const phone = String(req.params.phone || '').replace(/[^0-9]/g, '');
    const minutes = Math.max(1, Math.min(1440, Number(req.body?.minutes || 30)));
    await redis.set(`pause:${phone}`, 'manual', minutes * 60);
    res.json({ ok: true, phone, paused: true, minutes });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error_pausando';
    res.status(500).json({ ok: false, error: message });
  }
});

app.post('/conversations/:phone/resume', async (req, res) => {
  try {
    const phone = String(req.params.phone || '').replace(/[^0-9]/g, '');
    await redis.delete(`pause:${phone}`);
    res.json({ ok: true, phone, paused: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error_reactivando';
    res.status(500).json({ ok: false, error: message });
  }
});

app.post('/conversations/:phone/send-demo-button', async (req, res) => {
  try {
    const phone = String(req.params.phone || '').replace(/[^0-9]/g, '');
    const body = 'Te dejo la demo oficial de FullPOS para Windows. Puedes descargarla, instalarla y probar ventas, inventario, caja y reportes.';
    const url = 'https://github.com/JUNIORPRUEVA/fullpos-releases/releases/latest/download/FullPOS-Setup.exe';
    const data = await metaWhatsapp.sendCtaUrl(phone, body, 'Descargar demo', url);
    const accepted = data?.status >= 200 && data?.status < 300;
    if (!accepted) {
      const fallback = `${body}\n\nDescargar demo:\n${url}`;
      const textData = await metaWhatsapp.sendText(phone, fallback);
      await logConversationMessage({ phone, direction: 'out', text: fallback, type: 'text', provider: 'meta', status: textData?.status });
      return res.status(textData?.status >= 200 && textData?.status < 300 ? 200 : 400).json({ ok: textData?.status >= 200 && textData?.status < 300, fallback: true, data: textData?.data });
    }
    await logConversationMessage({ phone, direction: 'out', text: `${body}\n[Boton: Descargar demo]`, type: 'button', provider: 'meta', status: data.status });
    res.json({ ok: true, data: data.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error_boton_demo';
    res.status(500).json({ ok: false, error: message });
  }
});

app.post('/conversations/:phone/send-image', async (req, res) => {
  try {
    const phone = String(req.params.phone || '').replace(/[^0-9]/g, '');
    const hint = String(req.body?.hint || 'fullpos imagen').trim();
    const asset = selectFullposImage(hint);
    const imageUrl = publicAssetUrl(getPublicBaseUrl(), asset);
    const data = await metaWhatsapp.sendImageLink(phone, imageUrl, asset.caption);
    const accepted = data?.status >= 200 && data?.status < 300;
    await logConversationMessage({
      phone,
      direction: 'out',
      text: `${asset.caption}\n${imageUrl}`,
      type: 'image',
      provider: 'meta',
      status: data?.status,
      meta: { asset: asset.id, imageUrl, messageId: data?.data?.messages?.[0]?.id },
    });
    res.status(accepted ? 200 : 400).json({ ok: accepted, asset, imageUrl, data: data?.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error_enviando_imagen';
    res.status(500).json({ ok: false, error: message });
  }
});

app.post('/connect-webhook', async (_req, res) => {
  try {
    const config = configService.get();
    if (config.whatsappProvider === 'meta') {
      return res.json({
        ok: true,
        provider: 'meta',
        callbackUrl: config.metaWebhookUrl,
        verifyToken: config.metaVerifyToken,
        fields: ['messages'],
        note: 'Configura estos datos en Meta Developers > WhatsApp > Configuracion > Webhooks.',
      });
    }
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
    const state = config.whatsappProvider === 'meta'
      ? { instance: { instanceName: 'meta-cloud-api', state: metaWhatsapp.isConfigured() ? 'ready' : 'missing_config' } }
      : await whatsapp.getConnectionState(config.whatsappInstance);
    const instance = config.whatsappProvider === 'meta'
      ? {
        name: 'meta-cloud-api',
        connectionStatus: metaWhatsapp.isConfigured() ? 'ready' : 'missing_config',
        ownerJid: config.metaPhoneNumberId,
        profileName: 'WhatsApp Cloud API',
        number: config.metaPhoneNumberId,
      }
      : await whatsapp.fetchInstance(config.whatsappInstance);
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

    if (config.whatsappProvider === 'meta') {
      const to = telefono.replace(/[^0-9]/g, '');
      const sendData = await metaWhatsapp.sendText(to, mensaje);
      let accepted = sendData?.status >= 200 && sendData?.status < 300;
      let finalData = sendData;
      let fallbackUsed = false;
      if (!accepted) {
        finalData = await metaWhatsapp.sendTemplate(to);
        accepted = finalData?.status >= 200 && finalData?.status < 300;
        fallbackUsed = accepted;
      }
      return res.status(accepted ? 200 : 400).json({
        ok: accepted,
        provider: 'meta',
        sentToApi: accepted,
        phoneNumberId: config.metaPhoneNumberId,
        to,
        messageId: finalData?.data?.messages?.[0]?.id || '',
        messageStatus: finalData?.data?.messages?.[0]?.message_status || '',
        fallbackTemplateUsed: fallbackUsed,
        data: finalData?.data,
        firstAttempt: sendData?.data,
        note: accepted && fallbackUsed
          ? 'Meta rechazo el texto libre fuera de ventana, pero acepto la plantilla hello_world.'
          : accepted
            ? 'Meta acepto el mensaje. La entrega final llega por webhook de statuses.'
            : 'Meta rechazo el texto libre y tambien la plantilla. Revisa destinatario permitido, token o permisos.',
      });
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

app.get('/meta/webhook', (req, res) => {
  const config = configService.get();
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.metaVerifyToken) {
    return res.status(200).send(String(challenge || ''));
  }

  return res.sendStatus(403);
});

app.post('/meta/webhook', async (req, res) => {
  res.sendStatus(200);

  try {
    const config = configService.get();
    if (!config.autoReplyEnabled || config.whatsappProvider !== 'meta') return;

    const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change?.value || {};
        const messages = Array.isArray(value?.messages) ? value.messages : [];
        for (const message of messages) {
          const from = String(message?.from || '').replace(/[^0-9]/g, '');
          const messageId = message?.id || '';
          if (!from || !messageId) continue;

          const dedupeKey = `meta:seen:${messageId}`;
          const alreadySeen = await redis.get(dedupeKey);
          if (alreadySeen) continue;
          await redis.set(dedupeKey, '1', 60 * 60 * 24);

          if (config.typingIndicatorEnabled) {
            await metaWhatsapp.sendTypingIndicator(messageId);
          } else {
            await metaWhatsapp.markAsRead(messageId);
          }

          const pauseKey = `pause:${from}`;
          const pauseActive = await redis.get(pauseKey);
          if (pauseActive) continue;

          const tipoMensaje = getMetaMessageType(message);
          let userMessage = getMetaMessageText(message);

          if (tipoMensaje === 'ubicacion') {
            userMessage = getMetaLocationText(message) || 'El cliente envio una ubicacion.';
          }

          const mediaId = getMetaMediaId(message, tipoMensaje);
          if ((tipoMensaje === 'audio' || tipoMensaje === 'image' || tipoMensaje === 'video') && mediaId) {
            try {
              const media = await metaWhatsapp.fetchMediaBase64(mediaId);
              if (media?.base64 && tipoMensaje === 'audio') {
                userMessage = await openai.transcribeAudio(media);
              }
              if (media?.base64 && tipoMensaje === 'image') {
                userMessage = await openai.analyzeImage(media, userMessage);
              }
              if (media?.base64 && tipoMensaje === 'video') {
                userMessage = await openai.analyzeVideo(media, userMessage);
              }
            } catch (error) {
              const mediaError = error instanceof Error ? error.message : 'error_media_meta';
              console.warn(`No se pudo procesar media Meta: ${mediaError}`);
            }
          }

          if (!userMessage) continue;
          await logConversationMessage({ phone: from, direction: 'in', text: userMessage, type: tipoMensaje, provider: 'meta' });

          await wait(Number(config.humanDelayMs || 0));
          const { responseText, agentReply, knowledgeContext } = await buildAgentResponse({
            userMessage,
            tipoMensaje,
            remoteJid: from,
            instance: 'meta-cloud-api',
          });
          const targetNumber = config.destinationNumber || from;
          const shouldReplyWithAudio = shouldSendAudio({
            responseMode: config.responseMode,
            tipoMensaje,
            knowledgeContext,
            agentReply,
          });
          let sendData: any;
          let sentDemoButton = false;
          const shouldReplyWithDemoButton = !shouldReplyWithAudio
            && await shouldSendDemoButton(targetNumber, userMessage, agentReply, knowledgeContext.topics);
          if (shouldReplyWithDemoButton) {
            sendData = await metaWhatsapp.sendCtaUrl(
              targetNumber,
              responseText.slice(0, 900),
              'Descargar demo',
              DEMO_DOWNLOAD_URL,
            );
            sentDemoButton = Boolean(sendData?.status && sendData.status >= 200 && sendData.status < 300);
            if (!sendData?.status || sendData.status >= 300) {
              sentDemoButton = false;
              sendData = await sendMetaTextNaturally(targetNumber, `${responseText}\n\nDescargar demo:\n${DEMO_DOWNLOAD_URL}`, messageId);
            }
          } else if (shouldReplyWithAudio) {
            try {
              const audioBase64 = await openai.generateSpeechBase64(responseText, config.ttsVoice);
              sendData = await metaWhatsapp.sendAudio(targetNumber, audioBase64);
              if (!sendData?.status || sendData.status >= 300) {
                sendData = await sendMetaTextNaturally(targetNumber, responseText, messageId);
              }
            } catch (error) {
              const audioError = error instanceof Error ? error.message : 'error_audio_meta';
              console.warn(`No se pudo enviar audio por Meta, enviando texto: ${audioError}`);
              sendData = await sendMetaTextNaturally(targetNumber, responseText, messageId);
            }
          } else {
            sendData = await sendMetaTextNaturally(targetNumber, responseText, messageId);
          }
          if (isAskingForImage(userMessage)) {
            const asset = selectFullposImage(userMessage);
            const imageUrl = publicAssetUrl(getPublicBaseUrl(), asset);
            const imageData = await metaWhatsapp.sendImageLink(targetNumber, imageUrl, asset.caption);
            await logConversationMessage({
              phone: targetNumber,
              direction: 'out',
              text: `${asset.caption}\n${imageUrl}`,
              type: 'image',
              provider: 'meta',
              status: imageData?.status,
              meta: {
                asset: asset.id,
                imageUrl,
                messageId: imageData?.data?.messages?.[0]?.id,
              },
            });
          }
          await notifyHumanIfNeeded({
            provider: 'meta',
            customerPhone: from,
            userMessage,
            responseText,
            agentReply,
          });
          const signature = createHash('sha256').update(`${from}:${responseText}`).digest('hex');
          await logConversationMessage({
            phone: targetNumber,
            direction: 'out',
            text: responseText,
            type: shouldReplyWithAudio ? 'audio' : sentDemoButton ? 'button' : 'text',
            provider: 'meta',
            status: sendData?.status,
            meta: {
              intent: agentReply?.intent,
              topics: knowledgeContext.topics,
              messageId: sendData?.data?.messages?.[0]?.id,
            },
          });
          console.log(JSON.stringify({
            provider: 'meta',
            event: 'auto_reply',
            signature,
            from,
            targetNumber,
            messageId: sendData?.data?.messages?.[0]?.id,
            status: sendData?.status,
            intent: agentReply?.intent,
            required_action: agentReply?.required_action,
            needs_human: agentReply?.needs_human === true,
            replyType: shouldReplyWithAudio ? 'audio' : 'text',
            topics: knowledgeContext.topics,
          }));
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error_meta_webhook';
    console.warn(`No se pudo procesar webhook Meta: ${message}`);
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

    if ((tipoMensaje === 'audio' || tipoMensaje === 'image' || tipoMensaje === 'video') && key?.id) {
      try {
        const media = getWebhookMedia(body, tipoMensaje) || await whatsapp.fetchMediaBase64(key.id, instance);
        if (media?.base64 && tipoMensaje === 'audio') {
          userMessage = await openai.transcribeAudio(media);
        }
        if (media?.base64 && tipoMensaje === 'image') {
          userMessage = await openai.analyzeImage(media, userMessage);
        }
        if (media?.base64 && tipoMensaje === 'video') {
          userMessage = await openai.analyzeVideo(media, userMessage);
        }
      } catch (error) {
        const mediaError = error instanceof Error ? error.message : 'error_media';
        console.warn(`No se pudo procesar media: ${mediaError}`);
      }
    }

    if (!userMessage) {
      return res.json({ ok: true, skipped: true, reason: 'mensaje_sin_contenido_util' });
    }
    await logConversationMessage({ phone: normalizedPhone, direction: 'in', text: userMessage, type: tipoMensaje, provider: 'evolution' });

    const history = await redis.getJsonList(memoryKey, 10);
    const { responseText, agentReply, knowledgeContext } = await buildAgentResponse({
      userMessage,
      tipoMensaje,
      remoteJid,
      instance,
      customer,
      licenses,
      history,
    });
    let sent = false;
    let sendError = '';

    if (config.autoReplyEnabled) {
      try {
        await wait(Number(config.humanDelayMs || 0));
        const shouldReplyWithAudio = shouldSendAudio({
          responseMode: config.responseMode,
          tipoMensaje,
          knowledgeContext,
          agentReply,
        });
        if (shouldReplyWithAudio) {
          try {
            const audioBase64 = await openai.generateSpeechBase64(responseText, config.ttsVoice);
            await whatsapp.sendAudio(targetNumber, audioBase64, instance, Number(config.humanDelayMs || 1200));
            sent = true;
          } catch (error) {
            const audioError = error instanceof Error ? error.message : 'error_audio_respuesta';
            console.warn(`No se pudo enviar audio, enviando texto: ${audioError}`);
            await sendEvolutionTextNaturally(targetNumber, responseText, instance);
            sent = true;
          }
        } else {
          await sendEvolutionTextNaturally(targetNumber, responseText, instance);
          sent = true;
        }
      } catch (error) {
        sendError = error instanceof Error ? error.message : 'error_envio_whatsapp';
        console.warn(`No se pudo enviar respuesta por WhatsApp: ${sendError}`);
      }
    }

    await notifyHumanIfNeeded({
      provider: 'evolution',
      customerPhone: normalizedPhone,
      userMessage,
      responseText,
      agentReply,
      sendMeta: config.whatsappProvider === 'meta',
    });

    const signature = createHash('sha256').update(`${remoteJid}:${responseText}`).digest('hex');
    await logConversationMessage({
      phone: normalizedPhone,
      direction: 'out',
      text: responseText,
      type: shouldSendAudio({
        responseMode: config.responseMode,
        tipoMensaje,
        knowledgeContext,
        agentReply,
      }) ? 'audio' : 'text',
      provider: 'evolution',
      status: sent ? 'sent' : sendError || 'not_sent',
      meta: { intent: agentReply?.intent, topics: knowledgeContext.topics },
    });
    return res.json({
      ok: true,
      signature,
      response: responseText,
      agent: agentReply,
      topics: knowledgeContext.topics,
      replyType: shouldSendAudio({
        responseMode: config.responseMode,
        tipoMensaje,
        knowledgeContext,
        agentReply,
      }) ? 'audio' : 'text',
      sent,
      sendError: sendError || undefined,
    });
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

    const { responseText, agentReply, knowledgeContext } = await buildAgentResponse({
      userMessage: String(mensaje),
      tipoMensaje: 'text',
      remoteJid: String(telefono),
      instance: 'console-test',
      customer: null,
      licenses: [],
      history: [],
    });

    return res.json({
      ok: true,
      respuesta: responseText,
      telefono,
      mensaje,
      agent: agentReply,
      topics: knowledgeContext.topics,
      replyType: shouldSendAudio({
        responseMode: configService.get().responseMode,
        tipoMensaje: 'text',
        knowledgeContext,
        agentReply,
      }) ? 'audio' : 'text',
    });
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
