NEW-QUIZ MAX PATCH — как поставить

1) Скачай ZIP и распакуй его.
2) Скопируй папки public и tools, файл netlify.toml, SECURITY_AUDIT.md в корень своего репозитория new-quiz.
3) В терминале в корне репозитория запусти:
   node tools/apply-max-patch.mjs
4) Проверь сайт локально/на Netlify.
5) На Netlify в Environment variables поставь:
   REQUIRE_TELEGRAM_AUTH=1
   REQUIRE_REPORT_AUTH=1
   ALLOW_UNTRUSTED_ACCESS=0
   ACCESS_RATE_LIMIT_PER_MIN=20
   ALLOWED_ORIGINS=https://ТВОЙ-САЙТ.netlify.app,https://ТВОЙ-ДОМЕН
   ADMIN_SECRET=длинный_случайный_секрет_минимум_32_символа

Важно:
- Скрипт не удаляет функции сайта. Он добавляет UI-доработки, заголовки безопасности и патчит слабые места API.
- Перед изменением файлов скрипт создаёт backup рядом с файлом: .bak-...
- Если админка перестанет заходить через ?key=..., это нормально: безопаснее передавать ключ в заголовке X-Admin-Secret. Если очень нужно по-старому, поставь ALLOW_ADMIN_KEY_IN_URL=1, но это менее безопасно.
