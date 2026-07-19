# Spec: reescritura del widget de chat embebible (`@nevent/widget`)

**Fecha:** 2026-07-17
**Estado:** aprobado por Martín (arquitectura revisada por co-CTO Codex, gpt-5.6-sol, reasoning xhigh)
**Repos afectados:** nev-sdks (este spec), nev-api (spec paralelo pendiente), nev-admin-web (spec posterior pendiente)

## 1. Contexto y objetivo

Los clientes de Nevent (promotores) quieren embeber el chatbot IA de soporte con escalado a agentes humanos en sus propias webs/landings. Existe un widget previo (`@nevent/chatbot` v0.2.0, feb-2026) construido en ráfaga, nunca integrado por ningún cliente y anterior a la épica de handoff humano: si la conversación escala a un agente, el widget no recibe ni pinta nada.

**Decisión (Martín, 2026-07-17): reescritura desde cero.** Objetivo: widget **enterprise-grade y premium** en diseño y utilidad. Del widget viejo se conservan como insumos: la suite de tests de caja negra (spec de comportamiento), el estándar de sanitizado de contenido LLM (auditado como sólido) y la auditoría de seguridad completa (checklist de "no repetir"). Su código no se reutiliza.

## 2. Alcance v1

Paridad con lo que el motor actual (nev-api) ya soporta, más el handoff como ciudadano de primera:

- Conversación con bot: streaming token a token, markdown seguro, indicador "pensando".
- Rich content del bot: cards, carruseles, botones de acción, quick replies — por **schema discriminado y versionado**, nunca HTML del servidor.
- **Handoff humano completo y visible**: aviso de escalado con expectativa de espera, divider "X se ha unido", identidad y avatar del agente, typing del agente, presencia, cierre/resolución con feedback.
- Historial restaurado desde servidor (fuente de verdad única).
- Subida de ficheros (endpoint existente: S3, 10MB, whitelist MIME), limitada por sesión.
- Feedback 👍/👎 por mensaje. Typing bidireccional.
- Cancelación de la generación en curso (botón detener).
- Sesión anónima con tokens cortos renovables (sin caducidad visible para el usuario).
- Theming por tenant, dark mode automático + override. i18n es/en/ca/pt. WCAG 2.2 AA.
- Sin cookies ni storage hasta primera interacción. Analítica de producto propia.
- "Powered by Nevent" visible.

**Fuera de v1** (la API pública reserva la superficie): identity verification de usuarios logueados del cliente (`identify(signedToken)`/`reset()` son no-op con warning en v1; el panel de agentes marca al visitante como "no verificado"); horarios de oficina; badge/notificación con panel cerrado; white-label del branding; custom domain/CNAME para el CDN (anotado como opción enterprise futura).

## 3. Arquitectura

### 3.1 Componentes (nev-sdks)

| Artefacto | Stack | Presupuesto | Responsabilidad |
|---|---|---|---|
| `loader.js` | Vanilla TS | 3-6 KB Brotli | Cola de API pre-carga, inyectar iframe-shell, tamaño/posición/breakpoints, puente postMessage |
| `shell.html` + SPA | Preact + CSS compilado con design tokens | Lazy, solo al abrir | Launcher + panel completos dentro del iframe |
| Tipos públicos | TS `.d.ts` | — | Contrato de la API JS y los eventos públicos |

**Un único iframe-shell**: launcher (burbuja) y panel viven dentro del iframe, servido desde nuestro CDN. Aislamiento real por same-origin policy: la página anfitriona no puede leer conversación ni token. El loader no renderiza UI propia (evita CSS hostil del anfitrión y simplifica foco/dark mode). Sin Shadow DOM (no aporta sobre el iframe). La SPA Preact se carga con `dynamic import()` al abrir el panel.

Iframe con `sandbox="allow-scripts allow-same-origin"` (+`allow-popups` solo para `open_https_url`). Assets servidos con `Cross-Origin-Resource-Policy: cross-origin` (compatibilidad con anfitriones COEP).

### 3.2 API pública (loader)

`window.NeventWidget(...)` con cola pre-carga (funciona antes de cargar el bundle):
`boot(installationId, opts)`, `open`, `close`, `toggle`, `update(opts)`, `identify(signedToken)` *(reservada)*, `reset()` *(reservada)*, `on/off(evento, cb)`, `consent()`, `destroy()`.
Todas idempotentes; a prueba de doble inclusión del script y de navegación SPA. Eventos públicos: `ready`, `opened`, `closed`, `unread_changed` (se dispara también con el panel cerrado mientras exista conversación activa — coherente con D7: canal en background con conversación), `error({code})` con códigos `FRAME_BLOCKED`, `SESSION_EXPIRED`, `RATE_LIMITED`, `NETWORK`.

### 3.3 Protocolo postMessage

Envelope `{ns: "nevw", protocolVersion, instanceId, type, payload}`. `targetOrigin` exacto (jamás `*`), validación de `event.origin` + `event.source === contentWindow` en ambos lados, allowlist de comandos, validación runtime del payload. Handshake inicial `INIT`: el iframe captura `event.origin` del padre (provisto por el navegador, no por payload) y lo envía al bootstrap de sesión.

## 4. Contrato con nev-api (define el spec paralelo)

### 4.1 Bootstrap

```
GET  /widget/v1/installations/{installationId}/config   → público, cacheable (ETag). Theming, textos, features, locale.
POST /widget/v1/installations/{installationId}/sessions → crea sesión guest. Body: embeddingOrigin (del handshake). → access token 30-60 min + guestHandle opaco. Cache-Control: no-store.
POST /widget/v1/sessions/refresh                        → renovación. El shell renueva en memoria; ante 401 renueva y reintenta una vez.
```

- `installationId` es un identificador **público y opaco**; el servidor resuelve desde él tenant, chatbot, capability y dominios permitidos. El navegador no envía `tenantId` ni `X-Tenant-ID` como autoridades.
- El JWT de sesión vincula `tenant + installation + guest + embeddingOrigin` (+ `aud/iss/jti/exp`).
- El servidor valida `embeddingOrigin` contra la allowlist de la instalación (normalizando scheme/host/puerto/IDNA/wildcards). La allowlist es **dependencia de lanzamiento**, no mejora posterior.

### 4.2 Mensajería

```
POST /widget/v1/conversations/current/messages  → envío. Header Idempotency-Key (UUID por mensaje).
POST /widget/v1/conversations/current/stream    → turno del bot, SSE por fetch-streaming: deltas {turnId, seq, delta}; DONE referencia messageId y eventId canónicos.
POST /widget/v1/turns/{turnId}/cancel           → cancelación idempotente, propagada al proveedor IA.
GET  /widget/v1/conversations/current/messages  → snapshot de historial + snapshotCursor.
GET  /widget/v1/events?after={cursor}           → canal inbound, SSE por fetch-streaming (EventSource nativo no admite Authorization).
POST /widget/v1/conversations/current/typing    → typing del visitante.
POST /widget/v1/uploads · POST .../messages/{id}/feedback
```

*(Los paths finales los fija el spec de nev-api sobre sus controllers reales — regla de oro: copiar del controller, nunca de memoria. Los de arriba expresan el contrato funcional.)*

### 4.3 Modelo de eventos (entrega at-least-once)

- **Durables** (con `eventId` monotónico/cursor, `schemaVersion`, `conversationId`, `occurredAt`): `message.created`, `conversation.state_changed`, `agent.joined`. Backend: outbox o Redis Streams — Redis pub/sub solo para fan-out en vivo, no para replay.
- **Efímeros** (TTL, sin replay): `agent.typing`, presencia, heartbeat (~15 s).
- **Reconciliación**: al abrir o reconectar → snapshot de `/messages` → `events?after=snapshotCursor`. Sin huecos. Dedup en cliente por `messageId`/`eventId` en un store único.
- **Ciclo de vida del canal**: abierto solo con panel abierto y conversación activa (o handoff en curso); cerrado tras inactividad en estado bot; suspendido y reconciliado en `freeze/resume/pageshow/online/visibilitychange`. No se promete recepción en background ni con la pestaña cerrada.
- **Fallback**: si el stream falla 2 veces consecutivas → polling `/messages?after=cursor` (2-5 s con backoff) + indicador "Reconectando" discreto. El fallback se prueba en CI, no es código muerto.

## 5. Máquina de estados del handoff (vista cliente)

```
BOT_ACTIVE → ESCALATED_WAITING → AGENT_ACTIVE → RESOLVED
     ↑              ↓ (timeout/devolución)         ↓ (usuario escribe)
     └──────────────┴──────────────────────────────┘
```

El estado lo dicta el servidor vía `conversation.state_changed`; el cliente **nunca lo infiere** caminando el hilo de mensajes. Tratamiento visual por estado: cabecera (asistente ↔ "Te atiende {nombre}" + avatar), composer (placeholder contextual), banner de espera con expectativa, divider `agent.joined`, cierre con resumen + feedback. Mensajes optimistas con `pending/sent/failed` y retry manual. Escrituras concurrentes (usuario/bot/agente) las ordena el servidor; el cliente pinta por orden de eventos durables.

## 6. UI del panel — gate de mock HTML

**Norma de proceso (Martín): nada de frontend se implementa sin mock HTML aprobado.** Entregable inmediato tras este spec: mock estático navegable con todos los estados — bienvenida, bot streaming (+thinking), rich content, typing, escalado/espera, agente activo, upload, error/reconectando, offline, resuelto — en desktop y móvil (100dvh, safe-areas, sin autofocus móvil), light y dark. La dirección visual premium se itera sobre el mock; los design tokens resultantes se congelan como contrato del theming.

Accesibilidad: `title` en iframe y documento, foco gestionado al abrir/cerrar (retorno al launcher), Escape cierra, focus trap solo dentro del panel (sin `aria-modal` falso sobre el documento anfitrión), navegable 100% por teclado, contraste AA. Objetivo WCAG 2.2 AA (requisito legal EAA-UE desde jun-2025).

## 7. Theming y config

Schema versionado (`schemaVersion`) — contrato consumido después por la sección "Canal web" del admin: colores (tipados y validados), logo/avatar (https, dominios permitidos), posición del launcher, radio/densidad, textos de bienvenida por locale. **Todo valor del config se trata como entrada no confiable** en backend y frontend: se aplica vía `CSSStyleDeclaration.setProperty` (CSSOM descarta valores inválidos) — jamás interpolado en HTML ni en cadenas CSS. (Causa raíz de los 2 hallazgos ALTOS del widget viejo.)

## 8. Seguridad

- **Contenido LLM**: markdown sin HTML arbitrario; sanitizado equivalente al del widget viejo (DOMParser inerte, allowlist de tags/atributos/esquemas, `rel="noopener noreferrer"`, normalización anti-ofuscación). La suite de tests XSS se porta tal cual.
- **Rich content**: schema discriminado; acciones permitidas exclusivamente `send_message`, `open_https_url`, `download_attachment`. Nada de `javascript:`/`data:`/protocolos custom.
- **CSP del shell**: `default-src 'none'`; scripts propios; `connect-src` limitado a nuestra API/CDN; `object-src 'none'`; `base-uri 'none'`; Trusted Types si el stack lo permite.
- **Imágenes externas**: deshabilitadas o vía proxy propio (evita tracking/fuga de IP-referrer del visitante).
- **Storage**: sin transcript local. Solo `guestHandle` opaco, draft del composer, prefs — con TTL. Si Safari particiona/borra el storage, degradación a conversación nueva (el servidor conserva el historial).
- **Telemetría**: scrubbing de PII por defecto; jamás prompts, mensajes, JWT, nombres de fichero ni emails desde el cliente. Contadores de seguridad al 100%; traces de rendimiento muestreadas.
- **Backend (spec paralelo, bloquea GA)**: rate limiting por IP+instalación+sesión+tenant; una generación concurrente por sesión; límite de streams activos; **reserva atómica de cuota mensual antes de abrir stream** (hoy el path SSE no ejecuta metering); 429 con `Retry-After`; CORS restringido al origen del shell; revocación de sesiones. Uploads: antivirus/quarantine y `Content-Disposition` → P1 documentado, no bloquea v1.

## 9. Errores y resiliencia

- `error({code})` público + página de diagnóstico de instalación (CSP/frame bloqueado, dominios no permitidos).
- 429 → UI propia ("un momento…" con cuenta atrás), no error genérico.
- Degradación por capas: sin storage → funciona; sin streaming → respuesta completa por turno; sin canal inbound → polling; sin red → offline con retry.
- Reconexión: backoff exponencial con jitter + circuit breaker (evita estampidas tras deploy/caída).
- Móvil: `100dvh` + safe-area insets + `VisualViewport`; sin autofocus; ciclo de vida de página gestionado (nada depende de `unload`).

## 10. Observabilidad

Funnel separado: `loader_loaded` → `iframe_ready` → `session_created` → `history_loaded`; time-to-open y time-to-first-token; duración y cortes de stream; reconexiones, replay misses, delivery lag; uso de fallback polling; errores CSP/COEP/CORS; ratio 401/403/429 por instalación; funnel de handoff (solicitado/atendido/abandonado/resuelto, tiempo hasta agente). Modelo/proveedor/guardrails solo se miden en servidor.

## 11. Versionado y despliegue (CDN existente S3+CloudFront)

- Assets **inmutables** por versión: `/{x.y.z}/loader.{hash}.js` — cache infinita.
- Alias rolling `/v1/loader.js` con TTL corto (canal por defecto del snippet).
- Opción pinned + **SRI** para clientes enterprise.
- `protocolVersion` en postMessage; `schemaVersion` en config, eventos y rich content; API HTTP versionada (`/widget/v1/`).
- Orden de publicación: assets antes que alias; rollback = mover alias; kill switch por versión/tenant.
- El `latest` actual de `@nevent/chatbot` v0 **no se toca**; la migración es opt-in (no hay usuarios conocidos, pero por higiene).
- Sourcemaps al error tracker (no públicos). Snippet de instalación documentado con la lista exacta de orígenes CSP que el cliente debe abrir (`script-src`, `frame-src`, `connect-src`).

## 12. Testing

- Suite de caja negra del widget viejo portada como spec de comportamiento (open/send/receive/error/multi-mensaje/recovery).
- **Contract tests** del protocolo postMessage y del schema de eventos con fixtures compartidos con nev-api (el mock server de esos fixtures desbloquea el desarrollo del widget sin esperar al backend).
- Reconciliación/dedup: stream caído a media respuesta, replay con huecos, mensajes duplicados, reloj de cliente desviado.
- Tests XSS del sanitizador portados. A11y automatizada (axe) + pasada manual con lector de pantalla.
- E2E Playwright contra página anfitriona de prueba **con CSP estricta** y contra un anfitrión SPA (navegación cliente).
- Presupuesto de bundle en CI (Brotli), y presupuesto de main-thread del loader.

## 13. Descomposición de la épica y orden

1. **Este spec (widget, nev-sdks)** → mock HTML → aprobación visual de Martín → plan de implementación (writing-plans).
2. **Spec backend (nev-api)** — en paralelo al mock: bootstrap instalación/sesión, canal durable de eventos, cancelación, rate limiting/cuotas/allowlist, marca "no verificado" en panel de agentes. **Bloquea la integración final y el GA**, no la construcción del widget (mock server con fixtures del contrato).
3. **Spec admin (nev-admin-web)** — cuando el schema de config quede congelado tras el mock: sección "Canal web" (snippet con installationId, apariencia, dominios permitidos, estado del canal).

Pipeline de implementación (norma de Martín): subagentes Sonnet para implementar, revisión de CTOs (Codex + Claude), mock antes de frontend, informe con capturas antes de merge.

## 14. Decisiones registradas

| # | Decisión | Alternativa descartada | Por qué |
|---|---|---|---|
| D1 | Reescritura desde cero | Retrofit del v0.2 (recomendación inicial de la auditoría) | Decisión de producto de Martín: enterprise premium; el v0.2 queda como insumo (tests, checklist seguridad) |
| D2 | Iframe-shell único | Launcher Shadow DOM + panel iframe | Corrección Codex: aislamiento total, menos superficie, foco/dark mode más simples |
| D3 | Preact + CSS tokens compilado | Lit / vanilla TS / runtime Tailwind | Reactivo mata la clase de bugs dual-write; 4KB; dentro del iframe no impone nada |
| D4 | Inbound por fetch-streaming SSE + cursor durable | EventSource nativo; WebSocket unificado | EventSource no admite Authorization; WS suma fricción en proxies corporativos sin necesidad bidireccional |
| D5 | Tokens 30-60 min + refresh | Bearer 24h del backend actual | Menos ventana de replay; renovación transparente |
| D6 | Sin transcript en storage local | Persistencia local del v0.2 | Servidor = fuente de verdad; elimina hallazgo de privacidad y desincronización |
| D7 | Canal en background mientras exista conversación (badge de no-leídos activo) | Canal cerrado con panel cerrado | Revisada 2026-07-19 en pruebas reales: sin canal, el visitante no se entera de la respuesta del agente; patrón estándar del sector (Chatwoot/Intercom). Sin conversación no se abre conexión |
| D8 | Uploads activos para guests | Deshabilitarlos hasta identity verification | Utilidad de soporte real; mitigado por límites por sesión + rate limiting backend |
| D9 | Nombres neutros anti-adblock como higiene | Estrategia anti-adblock activa | Carrera perdida; solución enterprise real = CNAME (futuro) |

## 15. Riesgos aceptados

- Continuidad de conversación entre visitas depende del storage particionado del iframe (Safari puede borrarlo) → degradación a conversación nueva, historial recuperable si el guest se identifica en el futuro.
- Notificación con panel cerrado limitada a la pestaña abierta (D7): el badge de no-leídos requiere la página cargada; si el visitante cierra la pestaña no hay aviso. Mitigación futura: email de continuidad estilo Chatwoot (requiere captura de contacto).
- Anfitriones con CSP estricta requerirán tocar su CSP (documentado + diagnóstico + `error({code:"FRAME_BLOCKED"})`).
- El widget v1 no cubre áreas autenticadas del cliente (sin identity verification): se comunica como "para webs públicas" hasta v1.1.
