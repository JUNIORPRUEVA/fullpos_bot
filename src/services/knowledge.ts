import type { BotConfig } from './config';

export interface KnowledgeDecision {
  topics: string[];
  resources: Array<{ type: string; title: string; url: string; platform?: string }>;
  shouldUseDetailedAnswer: boolean;
  shouldUseAudio: boolean;
  maxResponseChars: number;
  responseHint: string;
  knowledge: Record<string, unknown>;
}

const DOWNLOAD_URL = 'https://github.com/JUNIORPRUEVA/fullpos-releases/releases/latest/download/FullPOS-Setup.exe';
const RELEASES_URL = 'https://github.com/JUNIORPRUEVA/fullpos-releases/releases/latest';
const WHATSAPP_URL = 'https://wa.me/18494314070';

export const FULLPOS_KNOWLEDGE = {
  publicRules: [
    'Usar solo informacion comercial y funcional apta para clientes.',
    'No mencionar nombres de carpetas, rutas internas, bases de datos, endpoints, servidores, tokens, codigo ni detalles tecnicos internos.',
    'Si el cliente pide configuracion profunda, pago, licencia bloqueada, facturacion electronica o soporte urgente, orientar y avisar a un humano.',
  ],
  brand: {
    name: 'FullPOS',
    company: 'FullTech SRL / APYRA',
    country: 'Republica Dominicana',
    contactWhatsapp: '+1 849-431-4070',
    contactUrl: WHATSAPP_URL,
    email: 'jrdigitalrd@gmail.com',
  },
  overview: {
    short:
      'FullPOS es un sistema de punto de venta para controlar ventas, inventario, caja, clientes, cotizaciones, compras, gastos, reportes, usuarios y licencias desde una computadora Windows.',
    idealFor: [
      'tiendas',
      'minimarkets',
      'ferreterias',
      'almacenes',
      'negocios comerciales pequenos y medianos',
    ],
    benefits: [
      'trabaja sin Internet en la computadora',
      'instalacion rapida con soporte',
      'inventario y ventas organizadas',
      'caja con aperturas, cierres, ingresos y gastos',
      'reportes claros para tomar decisiones',
      'FullPOS Owner incluido para consultar informacion desde el celular',
      'soporte por WhatsApp todos los dias',
    ],
  },
  modules: [
    {
      name: 'Ventas',
      clientValue:
        'permite vender rapido, buscar productos, usar lector de codigo de barras, aplicar diferentes formas de pago, imprimir comprobantes y manejar facturacion cuando aplica.',
    },
    {
      name: 'Inventario',
      clientValue:
        'controla existencias, costos, precios, movimientos, ajustes, productos agotados y alertas de stock bajo.',
    },
    {
      name: 'Caja',
      clientValue:
        'ayuda a abrir y cerrar caja, registrar ingresos, gastos, movimientos y revisar cuadre del dia.',
    },
    {
      name: 'Compras y suplidores',
      clientValue:
        'organiza compras, suplidores, costos, ordenes y reposicion de mercancia.',
    },
    {
      name: 'Clientes',
      clientValue:
        'guarda clientes, historial de compras, creditos y datos de contacto.',
    },
    {
      name: 'Cotizaciones',
      clientValue:
        'crea cotizaciones profesionales y luego las convierte en ventas.',
    },
    {
      name: 'Reportes',
      clientValue:
        'muestra ventas, utilidad, productos mas vendidos, costos, tickets promedio y rendimiento del negocio.',
    },
    {
      name: 'Usuarios y permisos',
      clientValue:
        'permite controlar que puede ver o hacer cada empleado.',
    },
    {
      name: 'Impresoras y codigos',
      clientValue:
        'compatible con impresoras termicas ESC/POS, matriciales y lectores USB de codigo de barras.',
    },
  ],
  ownerApp: {
    name: 'FullPOS Owner',
    summary:
      'Aplicacion para que el dueno vea informacion clave del negocio desde su telefono.',
    capabilities: [
      'ventas de hoy, ayer, semana, quincena, mes o rango personalizado',
      'ganancias, costos, promedio por venta y margen',
      'lista y detalle de ventas',
      'inventario, productos, stock, costo, precio y valor potencial',
      'cierres de caja y movimientos',
      'acceso a datos importantes aun cuando el dueno no esta en el negocio',
    ],
    requirement:
      'La computadora con FullPOS debe estar configurada para sincronizar y el celular necesita Internet para consultar los reportes.',
  },
  pricing: {
    summary:
      'La licencia se maneja por tiempo. El minimo es 3 meses y FullPOS Owner esta incluido.',
    plans: [
      { name: '3 meses', price: 'US$60', monthly: 'US$20 por mes' },
      { name: '6 meses', price: 'US$120', monthly: 'US$20 por mes', note: 'plan popular' },
      { name: '12 meses', price: 'US$240', monthly: 'US$20 por mes', note: 'mejor valor' },
      { name: 'Personalizado', price: 'a cotizar', monthly: 'segun necesidad del negocio' },
    ],
    includes: [
      'FullPOS completo',
      'modulos incluidos',
      'FullPOS Owner incluido',
      'actualizaciones',
      'soporte tecnico',
      'soporte por WhatsApp',
      'mantenimiento',
      'sin cargos ocultos',
    ],
    paymentMethods: ['tarjeta de credito', 'tarjeta de debito', 'transferencia bancaria en Republica Dominicana'],
  },
  demo: {
    duration: '5 dias gratis',
    description:
      'La demo permite probar FullPOS con sus funciones principales antes de comprar.',
    downloadUrl: DOWNLOAD_URL,
    releasesUrl: RELEASES_URL,
    steps: [
      'descargar el instalador oficial de Windows',
      'instalar FullPOS en la computadora',
      'crear o registrar el negocio',
      'probar productos, ventas, inventario, caja y reportes',
      'solicitar ayuda si desea instalacion guiada',
    ],
  },
  guides: {
    makeSale: [
      'abrir la caja del dia',
      'entrar a Ventas',
      'buscar el producto por nombre, codigo o lector de barras',
      'agregar cantidad y revisar el total',
      'elegir forma de pago',
      'cobrar e imprimir o guardar el comprobante',
    ],
    addProduct: [
      'entrar a Productos',
      'crear producto nuevo',
      'colocar nombre, codigo, costo, precio, categoria y stock',
      'guardar y probarlo en ventas',
    ],
    checkInventory: [
      'entrar a Inventario o Productos',
      'filtrar por categoria, stock bajo o agotados',
      'revisar costo, precio, existencia y valor del inventario',
      'hacer ajuste si el conteo fisico no coincide',
    ],
    closeCash: [
      'ir a Caja',
      'revisar ventas, ingresos, gastos y movimientos',
      'contar el efectivo',
      'cerrar caja y revisar el resumen del dia',
    ],
    ownerSetup:
      'Para usar FullPOS Owner, primero se configura la cuenta del dueno y la sincronizacion. Luego el dueno entra desde el celular para ver ventas, inventario, ganancias y cierres.',
  },
  support: {
    escalateWhen: [
      'cliente pide hablar con una persona',
      'comprobante de pago o activacion de licencia',
      'licencia vencida, bloqueada o problema de pago',
      'instalacion remota',
      'facturacion electronica o configuracion fiscal profunda',
      'error tecnico que impide vender',
    ],
    humanFriendlyLine:
      'Puedo ayudarte con la orientacion inicial y, si hace falta, aviso a un asesor para revisar tu caso directo.',
  },
};

const topicMatchers: Array<[string, RegExp]> = [
  ['precio', /\b(precio|costo|cu[aá]nto|vale|plan|planes|mensual|pagar|pago|licencia|renovar)\b/i],
  ['demo', /\b(demo|prueba|probar|descarga|descargar|instalador|link|enlace|windows)\b/i],
  ['owner', /\b(owner|due[nñ]o|celular|telefono|m[oó]vil|desde mi casa|reportes desde|app)\b/i],
  ['ventas', /\b(vender|venta|factura|cobrar|ticket|comprobante|lector|codigo de barra|c[oó]digo de barra)\b/i],
  ['inventario', /\b(inventario|producto|stock|existencia|agotado|categor[ií]a|ajuste|conteo)\b/i],
  ['caja', /\b(caja|cuadre|cerrar caja|abrir caja|gasto|ingreso|movimiento)\b/i],
  ['compras', /\b(compra|suplidor|proveedor|orden|mercanc[ií]a|reposici[oó]n)\b/i],
  ['clientes', /\b(cliente|credito|cr[eé]dito|historial|deuda|apartado)\b/i],
  ['reportes', /\b(reporte|ganancia|utilidad|estad[ií]stica|margen|mas vendido|m[aá]s vendido)\b/i],
  ['instalacion', /\b(instalar|instalaci[oó]n|configurar|soporte|ayuda|remoto|computadora)\b/i],
  ['facturacion', /\b(facturaci[oó]n electr[oó]nica|dgii|fiscal|comprobante fiscal|ncf)\b/i],
  ['humano', /\b(humano|persona|asesor|soporte|llamar|ll[aá]mame|urgente|ayuda directa)\b/i],
];

function detectTopics(message: string): string[] {
  const normalized = message.toLowerCase();
  const topics = topicMatchers
    .filter(([, matcher]) => matcher.test(normalized))
    .map(([topic]) => topic);
  return [...new Set(topics)];
}

function pickKnowledge(topics: string[]): Record<string, unknown> {
  const knowledge: Record<string, unknown> = {
    reglas: FULLPOS_KNOWLEDGE.publicRules,
    marca: FULLPOS_KNOWLEDGE.brand,
    resumen: FULLPOS_KNOWLEDGE.overview,
    soporte: FULLPOS_KNOWLEDGE.support,
  };

  if (topics.length === 0 || topics.includes('precio')) knowledge.precios = FULLPOS_KNOWLEDGE.pricing;
  if (topics.length === 0 || topics.includes('demo')) knowledge.demo = FULLPOS_KNOWLEDGE.demo;
  if (topics.length === 0 || topics.includes('owner')) knowledge.fullposOwner = FULLPOS_KNOWLEDGE.ownerApp;
  if (topics.length === 0 || topics.some((t) => ['ventas', 'inventario', 'caja', 'compras', 'clientes', 'reportes'].includes(t))) {
    knowledge.modulos = FULLPOS_KNOWLEDGE.modules;
  }
  if (topics.some((t) => ['ventas', 'inventario', 'caja', 'owner', 'instalacion'].includes(t))) {
    knowledge.guias = FULLPOS_KNOWLEDGE.guides;
  }
  if (topics.includes('facturacion')) {
    knowledge.facturacion =
      'FullPOS puede trabajar con facturacion y comprobantes cuando se configura segun el negocio. Para configuracion fiscal profunda conviene que un asesor lo revise contigo.';
  }

  return knowledge;
}

function wantsDetailed(message: string, topics: string[]): boolean {
  return /\b(info|informaci[oó]n|expl[ií]came|detalle|detallado|completo|todo|como funciona|gu[ií]a|ens[eé][nñ]ame|paso a paso|ampliamente)\b/i.test(message)
    || topics.some((topic) => ['ventas', 'inventario', 'caja', 'owner', 'instalacion', 'reportes'].includes(topic));
}

function resourcesFor(topics: string[]) {
  const resources: KnowledgeDecision['resources'] = [];
  if (topics.includes('demo')) {
    resources.push({
      type: 'installer',
      title: 'Instalador oficial FullPOS para Windows',
      url: DOWNLOAD_URL,
      platform: 'windows',
    });
  }
  if (topics.includes('precio') || topics.includes('humano')) {
    resources.push({
      type: 'contact',
      title: 'WhatsApp oficial FullPOS',
      url: WHATSAPP_URL,
      platform: 'whatsapp',
    });
  }
  return resources;
}

export function buildKnowledgeContext(message: string, tipoMensaje: string, config: BotConfig): KnowledgeDecision {
  const topics = detectTopics(message);
  const detailed = wantsDetailed(message, topics);
  const smartAudioEnabled = config.smartAudioEnabled !== false;
  const detailedMax = Number(config.detailedResponseChars || 1100);
  const baseMax = Number(config.maxResponseChars || 420);
  const maxResponseChars = detailed ? Math.max(baseMax, detailedMax) : baseMax;
  const spokenTopics = ['owner', 'ventas', 'inventario', 'caja', 'compras', 'reportes', 'instalacion'];
  const shouldUseAudio = smartAudioEnabled && (
    tipoMensaje === 'audio'
    || (detailed && (
      /\b(info|informaci[oó]n|expl[ií]came|detalle|completo|gu[ií]a|como funciona|paso a paso|puedo ver|como hago|c[oó]mo hago)\b/i.test(message)
      || topics.some((topic) => spokenTopics.includes(topic))
    ))
  );

  return {
    topics,
    resources: resourcesFor(topics),
    shouldUseDetailedAnswer: detailed,
    shouldUseAudio,
    maxResponseChars,
    responseHint: shouldUseAudio
      ? 'Responder como nota de voz natural: explicacion clara, con contexto, sin sonar leido, cerrando con una pregunta util.'
      : detailed
        ? 'Responder con mas contexto y guia practica, manteniendo lenguaje comercial y facil.'
        : 'Responder corto, profesional y directo para WhatsApp.',
    knowledge: pickKnowledge(topics),
  };
}
