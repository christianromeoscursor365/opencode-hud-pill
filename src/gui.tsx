import { createRenderEffect, createSignal, onCleanup } from "solid-js";
import { Plugin, Slot } from "@opencode/plugin/gui";

const REFRESH_MS = 15 * 60 * 1000;

type Weather = { label: string; detail: string };

async function getJson(url: string, headers?: Record<string, string>): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function symbolIcon(sym: string, t: number): string {
  if (/thunder/.test(sym)) return "⛈️";
  if (/heavy_snow|blizzard/.test(sym)) return "❄️";
  if (/snow/.test(sym)) return "🌨️";
  if (/heavy_rain|sleet/.test(sym)) return "🌧️";
  if (/rain|drizzle/.test(sym)) return "🌦️";
  if (/fog/.test(sym)) return "🌫️";
  if (/clearsky/.test(sym)) return t <= 1 ? "❄️" : "☀️";
  if (/cloud/.test(sym)) return "⛅";
  return "🌡️";
}

function symbolText(sym: string): string {
  const map: [RegExp, string][] = [
    [/clearsky/, "Ясно"], [/fair/, "Переменная облачность"], [/partlycloudy/, "Переменная облачность"],
    [/cloudy/, "Пасмурно"], [/fog/, "Туман"], [/thunder/, "Гроза"], [/heavy_snow/, "Сильный снег"],
    [/snow/, "Снег"], [/sleet/, "Мокрый снег"], [/heavy_rain/, "Сильный дождь"], [/rain/, "Дождь"],
    [/drizzle/, "Морось"],
  ];
  for (const [re, s] of map) if (re.test(sym)) return s;
  return "Погода";
}

async function loadWeather(): Promise<Weather> {
  const j = await getJson("https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=55.7558&lon=37.6173", {
    "User-Agent": "opencode-weather-pill/1.0 https://github.com/christianromeoscursor365/opencode-weather-pill",
  });
  const ts = j?.properties?.timeseries?.[0];
  if (!ts) throw new Error("met.no: no timeseries");
  const d = ts.data?.instant?.details ?? {};
  const now1 = ts.data?.next_1_hours ?? ts.data?.next_6_hours;
  const sym: string = now1?.summary?.symbol_code ?? "";
  const t = Math.round(d.air_temperature ?? NaN);
  if (!isFinite(t)) throw new Error("met.no: no temperature");
  const wind = typeof d.wind_speed === "number" ? `, ветер ${Math.round(d.wind_speed)} м/с` : "";
  return {
    label: `${symbolIcon(sym, t)} ${t}°`,
    detail: `Москва, ${symbolText(sym)}, ${t}°${wind}`,
  };
}

export default Plugin.define({
  setup(ctx) {
    const [weather, setWeather] = createSignal<Weather | undefined>(undefined);
    const [status, setStatus] = createSignal("⏳ …");

    // shortcut: manual DOM + createRenderEffect because Slot.render runs once and
    // a plain string would freeze at "⏳ …"; avoids solid-js/web (host may not resolve it).
    // el is per render() call: cached hidden timelines render separately and a shared node
    // would end up in the wrong (hidden) header.
    ctx.add(Slot, {
      at: "session.header",
      order: 100,
      render: (input) => {
        const el = document.createElement("span");
        el.style.cssText = "margin-left:10px;font-size:12px;white-space:nowrap;cursor:default";
        createRenderEffect(() => {
          const w = weather();
          el.textContent = input.active ? w ? w.label : status() || "" : "";
          el.title = w ? w.detail : "Погода Москва";
        });
        return el;
      },
    });

    const refresh = () =>
      loadWeather()
        .then((w) => {
          setWeather(w);
          setStatus("");
        })
        .catch((e) => setStatus("🌡️? " + String(e?.message || e).slice(0, 40)));

    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    onCleanup(() => clearInterval(id));
  },
});
