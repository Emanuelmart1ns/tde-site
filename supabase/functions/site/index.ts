// Supabase Edge Function: serve the TDE static site from Storage with correct MIME types.
// The Storage public gateway forces text/plain on HTML (anti-abuse), so this proxy
// reads the object from the public bucket and re-serves it with the real content type.
const BUCKET = "site";

const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
  json: "application/json",
  ico: "image/x-icon",
  webp: "image/webp",
  woff2: "font/woff2",
};

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("__test") === "1") {
    return new Response("<b>ok</b>", {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  // strip the /functions/v1/site prefix (and bare /site for custom domains)
  let path = url.pathname.replace(/^\/functions\/v1\/site/, "").replace(/^\/site/, "");
  path = path.replace(/^\//, "");
  if (path === "" || path.endsWith("/")) path += "index.html";

  const storageUrl =
    `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/${BUCKET}/${path}`;
  const res = await fetch(storageUrl);
  if (!res.ok) {
    return new Response("404 — não encontrado", { status: 404 });
  }
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return new Response(res.body, {
    status: 200,
    headers: {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=3600",
    },
  });
});
