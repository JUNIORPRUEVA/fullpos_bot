# Guía de Despliegue en EasyPanel

## 📦 Archivos listos para EasyPanel

- ✅ `Dockerfile` - Imagen optimizada multi-stage
- ✅ `.dockerignore` - Archivos a ignorar en el build
- ✅ `docker-compose.yml` - Configuración completa
- ✅ `.env.production` - Variables de producción

## 🚀 Opción 1: Desplegar desde Git (Recomendado)

### 1.1 Prepara tu repositorio GitHub

```bash
# Desde la carpeta del proyecto
git init
git add .
git commit -m "FullPOS bot ready for EasyPanel deployment"
git remote add origin https://github.com/tu-usuario/fullpos-agente-bot.git
git branch -M main
git push -u origin main
```

### 1.2 En tu panel de EasyPanel

1. Ve a **Services** o **Applications**
2. Click en **"New Service"** o **"Create Application"**
3. Selecciona **"Docker"** o **"GitHub"**
4. Pega tu URL de GitHub:
   ```
   https://github.com/tu-usuario/fullpos-agente-bot.git
   ```
5. Selecciona **Branch**: `main`
6. Selecciona **Build Type**: `Dockerfile`

### 1.3 Configura las variables de entorno en EasyPanel

En la sección **"Environment Variables"**, agrega:

```
WHATSAPP_API_KEY=sk-xxxx-tu-api-key
WHATSAPP_BASE_URL=https://ai-business-platform-evolutionapi.onyqr1.easypanel.host
WHATSAPP_INSTANCE=apyra
OPENAI_API_KEY=sk-proj-xxxxx (opcional, para mejor IA)
REDIS_URL=redis://redis:6379 (si tienes Redis en EasyPanel)
POSTGRES_URL=postgres://user:pass@postgres:5432/db (si tienes DB en EasyPanel)
```

### 1.4 Configura el puerto

- **Expose Port**: `3000`
- **Public Port**: `3000` (o el que prefieras)

### 1.5 Inicia el despliegue

- Click en **"Deploy"** o **"Build & Deploy"**
- Espera a que compile (2-5 minutos)
- Verifica que el servicio está **"Running"**

---

## 🐳 Opción 2: Desplegar con Docker Compose (Local o VPS)

### 2.1 En tu servidor/VPS

```bash
# Clona el repositorio
git clone https://github.com/tu-usuario/fullpos-agente-bot.git
cd fullpos-agente-bot

# Crea el .env
cp .env.production .env

# Edita las variables reales
nano .env
# O en Windows:
# notepad .env
```

### 2.2 Inicia los contenedores

```bash
docker-compose up -d
```

Verifica que está corriendo:
```bash
docker-compose ps
docker-compose logs fullpos-bot
```

---

## ✅ Paso 3: Conecta el webhook en Evolution API

Una vez que tu bot esté en EasyPanel (ej: `https://bot.easypanel.host`):

1. Ve a tu **Evolution API Dashboard**
2. Ve a **Configurations** > **Events** > **Webhooks**
3. Agrega un nuevo webhook:
   - **URL**: `https://bot.easypanel.host/webhook`
   - **Método**: `POST`
   - **Headers** (si aplica):
     ```
     Authorization: Bearer tu_token
     Content-Type: application/json
     ```

4. Activa estos eventos:
   - ✅ `MESSAGES_UPSERT` (mensajes nuevos)
   - ✅ `SEND_MESSAGE` (cuando el bot envía)
   - (Otros eventos según necesites)

5. Guarda la configuración

---

## 🧪 Prueba que funciona

### Test 1: Verifica que el bot está en línea

```bash
curl https://bot.easypanel.host/health
```

Deberías ver:
```json
{"ok":true,"service":"fullpos-agente-bot"}
```

### Test 2: Prueba el endpoint de test

```bash
curl -X POST https://bot.easypanel.host/test-message \
  -H "Content-Type: application/json" \
  -d '{"telefono":"18095551234","mensaje":"Hola FullPOS"}'
```

### Test 3: Envía un mensaje real desde WhatsApp

1. Abre WhatsApp
2. Busca el número de tu instancia apyra
3. Envía un mensaje (ej: "Hola")
4. El bot debería responder automáticamente

---

## 🔍 Monitoreo y Logs

### En EasyPanel

1. Ve a tu servicio
2. Click en **"Logs"**
3. Verás todos los eventos en tiempo real

### Por terminal (si usas docker-compose)

```bash
# Ver logs en vivo
docker-compose logs -f fullpos-bot

# Ver últimas 50 líneas
docker-compose logs --tail=50 fullpos-bot
```

---

## 🛠️ Troubleshooting

### "Service not responding"

```bash
# Reinicia el servicio
docker-compose restart fullpos-bot

# O en EasyPanel: click en "Restart"
```

### "Cannot connect to database"

- Verifica que `POSTGRES_URL` está correcta
- Si usas DB remota, asegúrate que permite conexiones
- Prueba localmente primero

### "WhatsApp messages not arriving"

1. Verifica que el webhook URL es correcto en Evolution API
2. Verifica que `WHATSAPP_API_KEY` es válido
3. Comprueba logs: `docker-compose logs fullpos-bot`

---

## 📊 URL de acceso

Una vez desplegado:

- **Panel del bot**: `https://tu-bot.easypanel.host`
- **API**: `https://tu-bot.easypanel.host/api/*`
- **Webhook**: `https://tu-bot.easypanel.host/webhook`
- **Config**: `https://tu-bot.easypanel.host/config`
- **Test**: `https://tu-bot.easypanel.host/test-message`

---

## ✨ Próximos pasos

1. Configura un dominio propio (si no usas easypanel.host)
2. Agrega autenticación al panel (/config)
3. Configura logs centralizados (Sentry, LogRocket, etc)
4. Agrega CI/CD para deploys automáticos
5. Configura backups de la base de datos

