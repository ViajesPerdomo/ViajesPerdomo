/* ============================================================
   Service Worker — Viajes Perdomo PWA
   Versión con login, QR y escáner
   ⚠️ Cambia CACHE_VERSION cada vez que subas cambios (v6 → v7 → ...)
   ============================================================ */

const CACHE_VERSION = "v6";
const CACHE_NAME = "viajes-perdomo-" + CACHE_VERSION;

// Archivos que se precargan al instalar
const ARCHIVOS_CACHE = [
  "./",
  "./index.html",
  "./admin.html",
  "./manifest.json",
  "./datos.json",
  "./datoscliente.json",
  "./users.json",
  "./admin.json",
  "./icon-192.png",
  "./icon-512.png",
  "./qrcode.min.js",
  "./html5-qrcode.min.js"
];

// Dominios que NUNCA se deben interceptar
const DOMINIOS_EXCLUIDOS = [
  "api.github.com",
  "wa.me",
  "api.whatsapp.com",
  "web.whatsapp.com",
  "cdn.jsdelivr.net"
];

/* ============================================================
   INSTALL
   ============================================================ */
self.addEventListener("install", event => {
  console.log("📦 [SW] Instalando versión:", CACHE_VERSION);

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // addAll falla si algún archivo no existe. Usamos allSettled
        return Promise.allSettled(
          ARCHIVOS_CACHE.map(url =>
            cache.add(url).catch(err => {
              console.warn("⚠️ [SW] No se pudo cachear:", url, err.message);
            })
          )
        );
      })
      .then(() => {
        console.log("⚡ [SW] skipWaiting()");
        return self.skipWaiting();
      })
      .catch(err => console.error("❌ [SW] Error install:", err))
  );
});

/* ============================================================
   ACTIVATE
   ============================================================ */
self.addEventListener("activate", event => {
  console.log("🔄 [SW] Activando versión:", CACHE_VERSION);

  event.waitUntil(
    caches.keys()
      .then(keys => {
        return Promise.all(
          keys.map(key => {
            if(key !== CACHE_NAME){
              console.log("🧹 [SW] Eliminando caché antigua:", key);
              return caches.delete(key);
            }
          })
        );
      })
      .then(() => {
        console.log("👑 [SW] clients.claim()");
        return self.clients.claim();
      })
      .then(() => {
        // Avisar a todas las pestañas abiertas de que hay nueva versión
        return self.clients.matchAll({ type: "window" }).then(clients => {
          clients.forEach(client => {
            client.postMessage({
              tipo: "SW_ACTUALIZADO",
              version: CACHE_VERSION
            });
          });
        });
      })
      .catch(err => console.error("❌ [SW] Error activate:", err))
  );
});

/* ============================================================
   FETCH
   ============================================================ */
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // 1. No interceptar peticiones a otros dominios (GitHub API, WhatsApp, CDNs)
  if(url.origin !== self.location.origin) return;
  if(DOMINIOS_EXCLUIDOS.some(d => url.hostname.includes(d))) return;

  // 2. Solo GET
  if(event.request.method !== "GET") return;

  // 3. Si la URL tiene ?t= (cache-busting del index/admin), ir siempre a la red
  //    sin guardar en caché (para no llenar el caché de infinitas variantes)
  if(url.searchParams.has("t")){
    event.respondWith(
      fetch(event.request).catch(() => {
        // Si falla la red, intentar sin el parámetro ?t=
        const urlSinT = url.origin + url.pathname;
        return caches.match(urlSinT).then(r => r || caches.match("./index.html"));
      })
    );
    return;
  }

  /* ---------- JSON → RED PRIMERO ---------- */
  // datos.json, datoscliente.json, users.json, admin.json
  if(url.pathname.endsWith(".json")){
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          if(resp && resp.status === 200){
            const copia = resp.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, copia));
          }
          return resp;
        })
        .catch(() => {
          console.log("📴 [SW] Offline — usando caché:", url.pathname);
          return caches.match(event.request);
        })
    );
    return;
  }

  /* ---------- HTML / navegación → RED PRIMERO ---------- */
  // index.html, admin.html y cualquier navegación
  if(
    event.request.mode === "navigate" ||
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/admin.html") ||
    url.pathname === "/" ||
    url.pathname === ""
  ){
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          if(resp && resp.status === 200){
            const copia = resp.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, copia));
          }
          return resp;
        })
        .catch(() => {
          console.log("📴 [SW] Offline — usando HTML de caché");
          return caches.match(event.request).then(resp => {
            if(resp) return resp;
            // Fallback según la URL
            if(url.pathname.includes("admin")) return caches.match("./admin.html");
            return caches.match("./index.html");
          });
        })
    );
    return;
  }

  /* ---------- RESTO (imágenes, iconos, librerías) → CACHÉ PRIMERO ---------- */
  event.respondWith(
    caches.match(event.request)
      .then(resp => {
        if(resp) return resp;
        return fetch(event.request)
          .then(respuesta => {
            if(respuesta && respuesta.status === 200 && respuesta.type === "basic"){
              const copia = respuesta.clone();
              caches.open(CACHE_NAME).then(c => c.put(event.request, copia));
            }
            return respuesta;
          })
          .catch(() => {
            console.log("📴 [SW] Offline — recurso no disponible:", url.pathname);
            return new Response("Recurso no disponible offline", { status: 503 });
          });
      })
  );
});

/* ============================================================
   MESSAGE (para forzar SKIP_WAITING desde la página)
   ============================================================ */
self.addEventListener("message", event => {
  if(event.data && event.data.tipo === "SKIP_WAITING"){
    console.log("⚡ [SW] SKIP_WAITING recibido");
    self.skipWaiting();
  }
});