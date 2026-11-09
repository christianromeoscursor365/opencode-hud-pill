import { Plugin } from "@opencode/plugin";
import { execFile } from "node:child_process";
import { freemem, totalmem } from "node:os";
import { Stats } from "./rpc-def.js";

// The GUI window cannot touch hardware; it polls these numbers over RPC.
// shortcut: TTL 5s cache — enough for 30s window polling from any number of
// windows; upgrade to push events only if a second consumer appears.
const CACHE_MS = 5000;
let cache = { at: 0, value: null };

function nvidia() {
  return new Promise((resolve) => {
    execFile(
      "nvidia-smi",
      ["--query-gpu=temperature.gpu,memory.used,memory.total", "--format=csv,noheader,nounits"],
      { windowsHide: true, timeout: 5000 },
      (err, out) => {
        if (err) return resolve(null);
        const [t, u, m] = String(out).trim().split("\n")[0].split(/[\s,]+/).map(Number);
        if (!Number.isFinite(t)) return resolve(null);
        resolve({ gpuTemp: t, vramUsed: u || 0, vramTotal: m || 0 });
      },
    );
  });
}

function cpu() {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "(Get-CimInstance Win32_Processor|Measure-Object LoadPercentage -Average).Average",
      ],
      { windowsHide: true, timeout: 8000 },
      (err, out) => {
        const v = err ? NaN : Number(String(out).trim());
        resolve(Number.isFinite(v) && v >= 0 && v <= 100 ? Math.round(v) : -1);
      },
    );
  });
}

// Task Manager-style throughput: adapter byte counters (first two numbers of
// `netstat -e`, locale-proof), delta between collections. The output is
// localized on this machine, so numbers are parsed positionally, not by label.
let lastNet = null;
function netstatBytes() {
  return new Promise((resolve) => {
    execFile("netstat", ["-e"], { windowsHide: true, timeout: 5000 }, (err, out) => {
      if (err) return resolve(null);
      for (const line of String(out).split(/\r?\n/)) {
        const g = line.split(/\s+/).filter((t) => /^\d+$/.test(t));
        if (g.length >= 2) return resolve({ rx: Number(g[0]), tx: Number(g[1]) });
      }
      resolve(null);
    });
  });
}
// shortcut: delta spans the poll gap (~30 s), not Task Manager's 1 s window,
// and a counter reset (reboot) shows nothing for one poll; upgrade to a 1 s
// background sampler only if the pill must mirror the Task Manager graph.
async function net() {
  const now = Date.now();
  const cur = await netstatBytes();
  if (!cur) return { netDownMbps: -1, netUpMbps: -1 };
  const prev = lastNet;
  lastNet = { at: now, ...cur };
  if (!prev || now <= prev.at || cur.rx < prev.rx || cur.tx < prev.tx)
    return { netDownMbps: -1, netUpMbps: -1 };
  const sec = (now - prev.at) / 1000;
  return {
    netDownMbps: Math.round((((cur.rx - prev.rx) * 8) / sec / 1e6) * 10) / 10,
    netUpMbps: Math.round((((cur.tx - prev.tx) * 8) / sec / 1e6) * 10) / 10,
  };
}

export default Plugin.define({
  id: "weather-pill",
  async setup(ctx) {
    await ctx.rpc.register(Stats, {
      stats: async () => {
        const now = Date.now();
        if (!cache.value || now - cache.at > CACHE_MS) {
          const [g, cpuPct, netMbps] = await Promise.all([nvidia(), cpu(), net()]);
          const ramPct = Math.round((100 * (totalmem() - freemem())) / totalmem());
          cache = {
            at: now,
            value: {
              gpuTemp: g?.gpuTemp ?? -1,
              vramUsed: g?.vramUsed ?? -1,
              vramTotal: g?.vramTotal ?? -1,
              cpuPct,
              ramPct,
              ...netMbps,
            },
          };
        }
        return cache.value;
      },
    });
  },
});
