// Shared RPC definition (plain object, JSON Schema) — imported by the server
// part (index.js) and bundled into the GUI; avoids an @opencode/ import in the
// window bundle. -1 means "metric unavailable".
export const Stats = {
  id: "hud-pill",
  methods: {
    stats: {
      input: { type: "object", properties: {}, additionalProperties: false },
      output: {
        type: "object",
        properties: {
          gpuTemp: { type: "number" },
          vramUsed: { type: "number" },
          vramTotal: { type: "number" },
          cpuPct: { type: "number" },
          ramPct: { type: "number" },
          netDownMbps: { type: "number" },
          netUpMbps: { type: "number" },
        },
        required: ["gpuTemp", "vramUsed", "vramTotal", "cpuPct", "ramPct", "netDownMbps", "netUpMbps"],
        additionalProperties: false,
      },
    },
  },
  events: {},
};
