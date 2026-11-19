export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil((async () => {
      const response = await fetch(new URL("/api/internal/maintenance", env.API_ORIGIN), {
        method: "POST",
        headers: { "x-erpsys-proxy-secret": env.API_PROXY_SECRET },
        signal: AbortSignal.timeout(240_000),
      });
      if (!response.ok) throw new Error(`ERPSYS maintenance returned ${response.status}`);
    })());
  },
  fetch() { return new Response("Not found", { status: 404 }); },
};
