import { createRenderEffect, createSignal, onCleanup } from "solid-js";
import { Plugin, Slot } from "@opencode/plugin/gui";
import { Stats } from "../rpc-def.js";

const REFRESH_MS = 15 * 60 * 1000;
// Matches the server's 5 s cache TTL: each fresh sample is a ~5 s delta,
// like Task Manager, instead of one number averaged over the whole poll gap.
const STATS_MS = 5 * 1000;

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
    "User-Agent": "opencode-hud-pill/1.0 https://github.com/christianromeoscursor365/opencode-hud-pill",
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
    const [stats, setStats] = createSignal("");

    // Hardware numbers come from the server part over RPC (the window has no
    // access to nvidia-smi/OS memory). Read ctx.client at call time: it is
    // replaced when the desktop server restarts.
    const pollStats = async () => {
      try {
        const s: any = await ctx.client.rpc(Stats).stats({});
        const vram = s.vramTotal > 0 ? Math.round((100 * s.vramUsed) / s.vramTotal) : -1;
        setStats(
          [
            s.cpuPct >= 0 ? `CPU ${s.cpuPct}%` : "",
            ["VRAM " + [s.gpuTemp >= 0 ? `${s.gpuTemp}°` : "", vram >= 0 ? `${vram}%` : ""]
              .filter(Boolean)
              .join(" / ")],
            `💾 ${s.ramPct}%`,
            s.netDownMbps >= 0 ? `🌐 ↓${s.netDownMbps} ↑${s.netUpMbps} Мбит/с` : "",
          ]
            .filter(Boolean)
            .join(" · "),
        );
      } catch {
        setStats("");
      }
    };
    pollStats();
    const statsId = setInterval(pollStats, STATS_MS);
    onCleanup(() => clearInterval(statsId));

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
          if (!input.active) {
            el.textContent = "";
            return;
          }
          const head = w ? w.label : status() || "";
          const st = stats();
          el.textContent = head && st ? `${head} · ${st}` : head || st;
          el.title = w ? `${w.detail}${st ? `\n${st}` : ""}` : "Погода Москва";
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
