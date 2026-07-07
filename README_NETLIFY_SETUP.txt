ГОТОВЫЙ ПРОЕКТ ДЛЯ NETLIFY

1) Загрузи ВСЁ содержимое этой папки в новый GitHub репозиторий.
   В корне должны лежать:
   - package.json
   - netlify.toml
   - public/
   - netlify/functions/

2) Netlify → Add new project → Import from GitHub → выбери новый репозиторий.

3) Build settings:
   Base directory: пусто
   Build command: npm install   (можно также npm run build)
   Publish directory: public
   Functions directory: netlify/functions

4) Environment variables в Netlify:
   ADMIN_SECRET=любой_длинный_секрет_32+_символа
   BOT_TOKEN=токен_бота_для_отчетов
   CHAT_ID=твой_telegram_id_или_id_чата
   OWNER_ID=твой_telegram_id
   ALLOWED_ORIGINS=https://твой-сайт.netlify.app

5) После добавления переменных:
   Deploys → Trigger deploy → Clear cache and deploy site

6) Проверка:
   https://твой-сайт.netlify.app/api/health
   должно вернуть JSON с ok:true.

7) Админка:
   https://твой-сайт.netlify.app/admin/
   Введи ADMIN_SECRET и управляй премиумом/баном/привязкой устройства.

Важно:
- Старый сайт не трогай. Это отдельный готовый проект.
- Если в Netlify в Build command стоит npm install, теперь ошибки package.json не будет, потому что package.json есть в корне.
