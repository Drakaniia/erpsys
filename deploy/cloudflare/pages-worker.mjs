export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/api" && !url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (url.pathname.startsWith("/api/internal/")) return new Response("Not found", { status: 404 });
    if (!env.API_ORIGIN || !env.API_PROXY_SECRET) return new Response("Service unavailable", { status: 503 });
    const target = new URL(env.API_ORIGIN);
    if (target.protocol !== "https:") return new Response("Service unavailable", { status: 503 });
    target.pathname = url.pathname;
    target.search = url.search;
    const headers = new Headers(request.headers);
    for (const name of ["host", "connection", "forwarded", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-erpsys-client-ip", "x-erpsys-proxy-secret", "cf-connecting-ip", "cf-access-client-id", "cf-access-client-secret"]) headers.delete(name);
    headers.set("x-erpsys-proxy-secret", env.API_PROXY_SECRET);
    headers.set("x-erpsys-client-ip", request.headers.get("cf-connecting-ip") || "unknown");
    try {
      const upstream = await fetch(target, { method: request.method, headers, body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body, redirect: "manual" });
      const response = new Response(upstream.body, upstream);
      response.headers.set("cache-control", "no-store");
      return response;
    } catch {
      return Response.json({ error: "The service is temporarily unavailable." }, { status: 502, headers: { "cache-control": "no-store" } });
    }
  },
};
