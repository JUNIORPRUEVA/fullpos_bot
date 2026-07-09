#!/bin/bash
# Script para verificar que todo está listo para desplegar

echo "🔍 Verificando proyecto FullPOS Bot..."
echo ""

# Verificar archivos críticos
echo "📂 Archivos críticos:"
files=("Dockerfile" ".dockerignore" "docker-compose.yml" "package.json" "tsconfig.json")
for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "  ✅ $file"
  else
    echo "  ❌ FALTA: $file"
  fi
done

echo ""
echo "📦 Dependencias:"
if [ -d "node_modules" ]; then
  echo "  ✅ node_modules instalado"
else
  echo "  ⚠️  node_modules no encontrado - ejecuta: npm install"
fi

echo ""
echo "🏗️  Build:"
if [ -d "dist" ]; then
  echo "  ✅ dist compilado"
else
  echo "  ⚠️  dist no encontrado - ejecuta: npm run build"
fi

echo ""
echo "🔧 Configuración:"
if [ -f ".env" ]; then
  echo "  ✅ .env encontrado"
else
  echo "  ⚠️  .env no encontrado - copia de .env.example: cp .env.example .env"
fi

if [ -f ".env.production" ]; then
  echo "  ✅ .env.production encontrado"
else
  echo "  ⚠️  .env.production no encontrado"
fi

echo ""
echo "✨ Verificación completa!"
echo ""
echo "Para desplegar a EasyPanel:"
echo "1. npm install"
echo "2. npm run build"
echo "3. Sube tu repositorio a GitHub"
echo "4. En EasyPanel: New Service > Docker > Selecciona tu repo"
echo ""
