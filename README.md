# opencode-weather-pill

GUI-плагин для OpenCode Desktop: показывает текущую погоду в Москве в шапке сессии (рядом со счётчиком токенов). Обновляется каждые 15 минут, источник — [MET Norway API](https://api.met.no/weatherapi/locationforecast/2.0/compact) (open-meteo и wttr.in в этой сети блокируются/зависают).

## Установка

Скопировать папку (или склонировать) в `~/.config/opencode/plugins/weather-pill/`, затем полностью перезапустить Desktop (`opencode service stop` + закрыть и открыть окно — хот-релоад не работает).

Бандл `dist/gui-experimental.cjs` уже собран и закоммичен — пересборка не нужна.

## Сборка

```
npm install
npx vite build
```

Требования к окружению сборки описаны в `node_modules/@opencode/plugin` — хост загружает только `dist/gui-experimental.cjs`, собранный пресетом `@opencode/plugin/gui/vite`.

## Как это работает

- `Slot at:"session.header"` — `TitlebarItem` в Desktop 2.2.6 не рендерится вообще.
- `Slot.render` вызывается один раз, поэтому рендер возвращает persistent `<span>`, который обновляется через `createRenderEffect` (обычная строка замёрзла бы на «⏳ …»).
- GUI-часть (`src/gui.tsx`) не требует `id`; серверная заглушка `index.js` обязана его иметь, иначе плагин не грузится.
