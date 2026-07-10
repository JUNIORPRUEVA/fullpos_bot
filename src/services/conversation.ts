export interface ConversationMemory {
  totalTurns: number;
  lastUserMessage: string;
  lastAssistantMessage: string;
  lastIntent: string;
  lastTopics: string[];
  salesStage: 'new' | 'informed' | 'demo_offered' | 'demo_requested' | 'pricing_discussed' | 'buying_signal' | 'support';
  questionsAskedRecently: number;
  turnsSinceQuestion: number;
  lastQuestion: string;
  learnedSignals: string[];
  updatedAt: string;
}

const shortAffirmative = /^(s[ií]|si|ok|okay|dale|claro|perfecto|bien|correcto|asi es|a si|aj[aá]|ta bien)$/i;
const shortLater = /^(luego|despues|despu[eé]s|m[aá]s tarde|mas tarde|ma[nñ]ana|ahora no|luego veo|otro dia|otro d[ií]a)$/i;
const shortNegative = /^(no|nop|negativo|todavia no|todav[ií]a no|no gracias)$/i;

export function defaultConversationMemory(): ConversationMemory {
  return {
    totalTurns: 0,
    lastUserMessage: '',
    lastAssistantMessage: '',
    lastIntent: 'otro',
    lastTopics: [],
    salesStage: 'new',
    questionsAskedRecently: 0,
    turnsSinceQuestion: 3,
    lastQuestion: '',
    learnedSignals: [],
    updatedAt: new Date().toISOString(),
  };
}

export function interpretShortMessage(message: string, memory: ConversationMemory): string {
  const text = message.trim();
  if (text.length > 18) return text;

  const previous = memory.lastAssistantMessage || '';
  if (shortAffirmative.test(text)) {
    return [
      `El cliente respondio afirmativamente: "${text}".`,
      previous ? `Debe interpretarse como respuesta a esto que el bot dijo antes: "${previous}".` : '',
      'Continua la conversacion sin repetir la misma pregunta.',
    ].filter(Boolean).join(' ');
  }

  if (shortLater.test(text)) {
    return [
      `El cliente quiere dejarlo para despues: "${text}".`,
      previous ? `Viene despues de esta respuesta del bot: "${previous}".` : '',
      'Responde con calma, deja el camino abierto y ofrece retomar demo o instalacion cuando este listo.',
    ].filter(Boolean).join(' ');
  }

  if (shortNegative.test(text)) {
    return [
      `El cliente respondio de forma negativa o no esta listo: "${text}".`,
      previous ? `Viene despues de esta respuesta del bot: "${previous}".` : '',
      'No presiones; aporta valor breve y deja una salida natural hacia demo o informacion.',
    ].filter(Boolean).join(' ');
  }

  if (/^(precio|precios|demo|info|informacion|informaci[oó]n|owner|app)$/i.test(text)) {
    return text;
  }

  return text;
}

export function extractTrailingQuestion(text: string): string {
  const match = text.match(/([¿?][^¿?]*\?|[^.!?\n]*\?)\s*$/);
  return match ? match[0].trim() : '';
}

export function removeTrailingQuestion(text: string): string {
  const question = extractTrailingQuestion(text);
  if (!question) return text.trim();
  return text.slice(0, Math.max(0, text.length - question.length)).trim().replace(/[,\s]+$/, '.');
}

export function controlQuestionCadence(text: string, memory: ConversationMemory, needsQuestion: boolean): string {
  const question = extractTrailingQuestion(text);
  if (!question) return text.trim();

  const normalizedQuestion = question.toLowerCase().replace(/[¿?]/g, '').trim();
  const lastQuestion = (memory.lastQuestion || '').toLowerCase().replace(/[¿?]/g, '').trim();
  const askedTooRecently = memory.questionsAskedRecently >= 1;
  const shouldWaitForQuestion = (memory.turnsSinceQuestion ?? 3) < 2;
  const repeated = Boolean(lastQuestion && normalizedQuestion === lastQuestion);

  if (!needsQuestion && (askedTooRecently || shouldWaitForQuestion || repeated)) {
    const without = removeTrailingQuestion(text);
    return `${without}\n\nCuando quieras, puedo ayudarte a avanzar con la demo o la instalacion.`;
  }

  return text.trim();
}

export function splitWhatsAppText(text: string, maxChars = 650): string[] {
  const normalized = text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const chunks: string[] = [];
  const blocks = normalized.split(/\n\n+/);
  let current = '';

  const pushCurrent = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };

  for (const block of blocks) {
    if ((current + '\n\n' + block).trim().length <= maxChars) {
      current = [current, block].filter(Boolean).join('\n\n');
      continue;
    }

    pushCurrent();
    if (block.length <= maxChars) {
      current = block;
      continue;
    }

    const sentences = block.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      if ((current + ' ' + sentence).trim().length <= maxChars) {
        current = [current, sentence].filter(Boolean).join(' ');
      } else {
        pushCurrent();
        if (sentence.length <= maxChars) {
          current = sentence;
        } else {
          for (let index = 0; index < sentence.length; index += maxChars) {
            chunks.push(sentence.slice(index, index + maxChars).trim());
          }
        }
      }
    }
  }

  pushCurrent();
  return chunks.filter(Boolean).slice(0, 5);
}

export function humanDelayForText(text: string): number {
  const readingTime = Math.min(4800, Math.max(900, text.length * 18));
  return readingTime;
}

export function updateConversationMemory(params: {
  previous: ConversationMemory;
  userMessage: string;
  assistantMessage: string;
  intent?: string;
  topics: string[];
  sentQuestion: boolean;
}): ConversationMemory {
  const previous = params.previous || defaultConversationMemory();
  const allSignals = new Set(previous.learnedSignals || []);
  const lower = params.userMessage.toLowerCase();

  if (/\b(tienda|minimarket|ferreter|almacen|almac[eé]n|restaurante|negocio)\b/i.test(lower)) {
    allSignals.add('tipo_negocio_mencionado');
  }
  if (/\b(demo|descarg|instalador|probar)\b/i.test(lower)) {
    allSignals.add('interes_demo');
  }
  if (/\b(precio|plan|comprar|pagar|licencia)\b/i.test(lower)) {
    allSignals.add('interes_compra');
  }

  let salesStage = previous.salesStage || 'new';
  if (params.topics.includes('demo')) salesStage = 'demo_requested';
  else if (params.topics.includes('precio')) salesStage = 'pricing_discussed';
  else if (shortAffirmative.test(params.userMessage) && previous.salesStage === 'pricing_discussed') salesStage = 'buying_signal';
  else if (params.topics.length > 0) salesStage = 'informed';

  const lastQuestion = extractTrailingQuestion(params.assistantMessage);
  return {
    totalTurns: (previous.totalTurns || 0) + 1,
    lastUserMessage: params.userMessage,
    lastAssistantMessage: params.assistantMessage,
    lastIntent: params.intent || previous.lastIntent || 'otro',
    lastTopics: params.topics,
    salesStage,
    questionsAskedRecently: params.sentQuestion ? Math.min(3, (previous.questionsAskedRecently || 0) + 1) : 0,
    turnsSinceQuestion: params.sentQuestion ? 0 : Math.min(10, (previous.turnsSinceQuestion ?? 3) + 1),
    lastQuestion: lastQuestion || previous.lastQuestion || '',
    learnedSignals: [...allSignals].slice(-12),
    updatedAt: new Date().toISOString(),
  };
}
