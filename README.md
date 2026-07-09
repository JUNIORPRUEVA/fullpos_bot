# FullPOS Agente Bot

Este proyecto implementa una versión más potente y modular del flujo que compartiste de n8n, usando Node.js + TypeScript + Express.

## Qué incluye

- Webhook para recibir eventos de WhatsApp
- Lógica de pausa con Redis
- Consulta de cliente y licencias en PostgreSQL
- Respuesta generada por OpenAI para asesoría comercial de FullPOS
- Envío de respuestas por WhatsApp
- Endpoint de salud para monitoreo

## Requisitos

- Node.js 20+
- Redis
- PostgreSQL
- OpenAI API key
- Evolution API o servicio similar para WhatsApp

## Instalación

1. Copia el archivo .env.example a .env
2. Ajusta las variables de entorno
3. Instala dependencias:

```bash
npm install
```

4. Compila y ejecuta:

```bash
npm run build
npm start
```

## Variables de entorno

- PORT
- OPENAI_API_KEY
- OPENAI_MODEL
- REDIS_URL
- POSTGRES_URL
- WHATSAPP_INSTANCE
- WHATSAPP_API_KEY
- WHATSAPP_BASE_URL

## Verificación

Se comprobó que el proyecto compila correctamente con:

```bash
npm run build
```
# fullpos_bot
