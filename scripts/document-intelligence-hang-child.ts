/// <reference types="node" />

for (const key of Object.keys(process.env)) {
  if (!["SYSTEMROOT", "WINDIR", "TEMP", "TMP"].includes(key)) {
    delete process.env[key];
  }
}

process.on("message", () => {
  // Deliberately ignores work and cancellation for supervisor watchdog testing only.
});

process.send?.({ kind: "ready" });
setInterval(() => undefined, 1_000);
