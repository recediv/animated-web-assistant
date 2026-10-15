# animated-web-assistant

Русский · [English](README.en.md)

Анимированный помощник для сайта. Персонаж перемещается по странице, реагирует на действия пользователя и взаимодействует с интерфейсом.

[Demo](https://recediv.github.io/animated-web-assistant/)

## Запуск

Требуется Node.js 22, начиная с 22.16.

```sh
npm ci
npm run dev
```

## Сборка и подключение

```sh
npm run build
```

Демосайт собирается в `dist/`, помощник и его ресурсы — в `dist/assistant/1.0.0/`. Доступны ES-модуль и вариант для подключения через `<script>`.

Для своего сайта нужны [конфигурация](demo/assistant.config.json) и адаптер [ShopAdapter](src/config/types.ts). Запуск — через `init({ configUrl, adapter })`. Меню сценок и анимация переходов страниц реализованы в демосайте.

## Проверки

```sh
npm test
npm run typecheck
npm run lint
```

## Автор и лицензия

© 2026 **Shutnic[mz]**.

Проект распространяется под [GNU GPL версии 3 или более поздней](LICENSE) (`GPL-3.0-or-later`).

Шрифты [Neucha](assets/fonts/Neucha-OFL.txt) и [Nunito](assets/fonts/Nunito-OFL.txt) распространяются под SIL OFL 1.1.
