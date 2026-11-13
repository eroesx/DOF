# ====================================================
# Aşama 1: Derleme (Build Stage)
# ====================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Bağımlılık tanımlarını kopyala
COPY package.json package-lock.json ./

# Temiz ve tekrarlanabilir bağımlılık kurulumu
RUN npm ci

# Uygulama kaynak kodlarını kopyala
COPY . .

# Frontend ve backend üretim paketini (dist/) derle
RUN npm run build

# Yalnızca üretim bağımlılıklarını bırak
RUN npm prune --omit=dev

# ====================================================
# Aşama 2: Üretim Çalışma Ortamı (Production Stage)
# ====================================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

# Güvenlik: Uygulama node kullanıcısıyla çalışır
USER node

# Gerekli dosyaları builder aşamasından kopyala
COPY --chown=node:node package.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/firebase-applet-config.json ./firebase-applet-config.json

# Port 3000'i dışa aç
EXPOSE 3000

# Canlılık / Sağlık kontrolü (Healthcheck)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Uygulamayı başlat
CMD ["node", "dist/server.cjs"]
