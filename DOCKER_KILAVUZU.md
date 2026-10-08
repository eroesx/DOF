# 🐳 DÖF Kalite Yönetim Sistemi - Docker Kurulum ve Çalıştırma Kılavuzu

Bu belge, uygulamanın Docker ve Docker Compose kullanılarak nasıl paketleneceğini, derleneceğini ve çalıştırılacağını adım adım açıklamaktadır.

---

## 📋 Ön Koşullar

- Bilgisayarınızda veya sunucunuzda **Docker** ve **Docker Compose** kurulu olmalıdır.
  - [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows / macOS)
  - `apt install docker.io docker-compose-plugin` (Ubuntu / Debian Linux)

---

## 🚀 1. Yöntem: Docker Compose ile Hızlı Başlatma (Önerilen)

En kolay yöntem tek bir komutla derleyip arka planda çalıştırmaktır.

### Adım 1: Ortam Değişkenlerini Tanımlayın (İsteğe Bağlı)
Eğer Gemini AI analizlerini kullanmak istiyorsanız `.env` dosyanızı oluşturun:
```bash
cp .env.example .env
```
`.env` dosyasını açıp `GEMINI_API_KEY` değerinizi ekleyin:
```env
GEMINI_API_KEY="AIzaSy..."
```

### Adım 2: Konteyneri Başlatın
```bash
# Docker Compose ile derleyip arka planda başlatma:
docker compose up -d --build

# Veya npm kısayolu ile:
npm run docker:up
```

### Adım 3: Uygulamaya Erişin
Tarayıcınızdan şu adrese gidin:
👉 **http://localhost:3000**

---

## 🛠️ 2. Yöntem: Standart Docker CLI ile Çalıştırma

### Adım 1: İmajı Derleyin (Build)
```bash
docker build -t dof-yonetim-sistemi .
# veya: npm run docker:build
```

### Adım 2: Konteyneri Çalıştırın (Run)
```bash
docker run -d \
  --name dof-app \
  -p 3000:3000 \
  -e GEMINI_API_KEY="AI_ANAHTARINIZ" \
  dof-yonetim-sistemi

# veya: npm run docker:run
```

---

## 📊 Yönetim ve İzleme Komutları

| İşlem | Komut |
|---|---|
| **Canlı Logları İzleme** | `docker compose logs -f` veya `docker logs -f dof-yonetim-sistemi` |
| **Konteyner Durumu & Healthcheck** | `docker ps` |
| **Konteyneri Durdurma** | `docker compose down` veya `docker stop dof-app` |
| **Konteyneri Yeniden Başlatma** | `docker compose restart` veya `docker restart dof-app` |
| **Sağlık Durumu Sorgulama** | `curl http://localhost:3000/api/health` |

---

## ⚙️ Yapılandırma Notları

1. **Port Değiştirme:**
   - Varsayılan port `3000`'dir. Farklı bir porta (örneğin 8080) yönlendirmek isterseniz `docker-compose.yml` dosyasındaki port eşlemesini `- "8080:3000"` olarak güncelleyebilir veya `docker run -p 8080:3000 ...` çalıştırabilirsiniz.
2. **Firebase Ayarları:**
   - `firebase-applet-config.json` dosyası imaj içerisine otomatik dahil edilmiştir. Eğer farklı bir Firebase projesi bağlamak isterseniz, dosyayı volume olarak bağlayabilirsiniz:
     `-v ./firebase-applet-config.json:/app/firebase-applet-config.json`
3. **Üretim Optimizasyonu:**
   - Multi-stage (çok aşamalı) `Dockerfile` sayesinde Node dev bağımlılıkları üretim imajına dahil edilmez, hafif ve güvenli bir `node:22-alpine` imajı üretilir.
   - Konteyner root yetkisi olmayan `node` kullanıcısıyla çalışır.
