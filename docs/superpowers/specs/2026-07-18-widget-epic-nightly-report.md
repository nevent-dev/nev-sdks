# Informe nocturno — Épica del canal de soporte embebible Nevent

**Fecha:** 2026-07-18 (sesión autónoma ~23:00–04:00)
**Orquestación:** 2 CTOs (Fable 5 + Codex gpt-5.6-sol xhigh), implementación por subagentes Sonnet, doble revisión por tarea + revisión de rama por plan.

## TL;DR

Se completaron **tres capas de fundaciones**, todas testeadas y con PR draft:
- **F1 Widget · Plan 1 (fundaciones)** — `@nevent/widget`: loader IIFE + iframe-shell + sesión. **PR nev-sdks#39**.
- **F1 Widget · Plan 2 (transporte)** — store durable, streaming, canal de eventos, sender, fachada E2E. **PR nev-sdks#39** (misma rama).
- **F2 Backend · Plan 1 (fundaciones)** — plano `/widget/v1`: modelos, token, auth, bootstrap, core transaccional. **PR nev-api#924**.
- Contrato widget↔backend **alineado**.

**No se alcanzó** la integración final completa (conversación con bot + escalado a agente end-to-end) porque **requiere planes que no son fundaciones** y que son trabajo de varios días, no de una noche (detalle en §"Qué falta").

## Qué se entregó (con evidencia)

### F1 Widget · Plan 1 — Fundaciones (8 tareas, todas aprobadas)
Rama `feat/widget-rewrite`. Paquete `@nevent/widget` que reemplaza a `@nevent/chatbot`:
- Loader IIFE 2.76 KB (1.35 KB gzip) — script clásico que inyecta un iframe sandboxed.
- Protocolo postMessage con envelope validado, validación origin+source **en ambos lados**.
- Shell en iframe: handshake INIT capturando `embeddingOrigin` de `event.origin` (nunca del payload).
- Cliente de sesión con refresh single-flight en 401.
- Contrato/fixtures compartidos + demo funcional.
- **Prueba real P1 (navegador Chrome):** landing → loader IIFE → iframe sandbox → panel "Asistente de DEMO FEST" desde config del mock; bootstrap cross-origin `GET /config` + `OPTIONS 204` + `POST /sessions 200` con `embeddingOrigin:"http://localhost:4311"` (capturado de event.origin, no de payload).

### F1 Widget · Plan 2 — Transporte (11 tareas, todas aprobadas)
Capa headless de transporte, 119 tests verdes, build limpio:
- Parser SSE por fetch (EventSource no admite Authorization): abort-unblock + decoder flush, verificados contra Streams/TextDecoder reales de Node.
- Message store durable: deep-immutable (freeze 3 niveles), no-revert por seq, dedup optimista+streaming en **4 órdenes de carrera**, replaceSnapshot como hard-reset del 409.
- Consumidor del turno del bot (stream_incomplete en EOF sin DONE, AbortError distinto de fallo).
- Sender (Idempotency-Key, sin auto-reenvío tras caída, cancel sin fallback, channel-open solo en accepted).
- Canal de eventos serializado por generación: reconciliación head-first, dedup, reconexión con backoff+jitter, polling tras 2 fallos progress-less, 409 hard-reset, offline, page lifecycle.
- Fachada `createTransport` + integración E2E (store compartido, 3 escenarios reales).

### F2 Backend · Plan 1 — Fundaciones (12 tareas, todas aprobadas)
Rama `feat/widget-channel`. Plano `/widget/v1`, tests reales sobre **Testcontainers mongo:7** (replica set → transacciones):
- Modelos+repos: `widget_installations`, `widget_sessions` (CAS de tokenVersion), `widget_conversations` (contador eventSeq), `widget_events` (log durable seq+factKey+TTL).
- Token dedicado `WIDGET_SESSION_V1` + verificador estricto (sin bypass, verificado vs bytecode java-jwt).
- Autorización por request con outcome 3-way + igualdad completa claims↔sesión↔instalación.
- Allowlist de dominios con IDNA (rechaza `*` literal — **bug Critical cazado y corregido**).
- Wiring de seguridad explícito (assets legacy públicos, resto autenticado, CORS shell).
- Bootstrap: `GET /config` (ETag), `POST /sessions` (crear/reanudar, origin-binding, resumeSecret 256-bit hasheado), `POST /sessions/refresh` (CAS, sin gracia).
- Core transaccional: append-in-current-tx + retry de dos niveles (transient→toda la tx, unknown-commit→solo commit vía manager especializado, con precedencia).

## Hallazgos del pipeline (valor de los 3 gates)
Codex pasó cada spec y cada plan por 3-4 vueltas antes de tocar código, cazando races de concurrencia y semántica transaccional de antemano. Durante la implementación se cazaron y corrigieron, entre otros:
- **Critical:** bypass de allowlist (un `*` literal derrotaba el wildcard de dominios) — detectado por el implementador, confirmado con repro por el reviewer.
- **Critical:** burbuja de bot huérfana/duplicada en caída mid-stream no-abort.
- **Critical:** ETag que no invalidaba al cambiar el lado del launcher (304 obsoleto).
- **Important:** leak del stream del sender en `destroy()`; ack colgado + duplicado en el path degradado; single-flight del refresh sin reset al lanzar; guard de auto-arranque no-op.
- 2 drifts de contrato widget↔backend (theme shape, guestHandle/resumeSecret) reconciliados.

## Decisiones pendientes de Martín (no bloquean los merges draft)
1. **Capability check falla-ABIERTO** (`TierAuthorizationService.hasCapability` devuelve true ante excepción interna) — comportamiento compartido de plataforma. Para un plano anónimo de internet: aceptar el riesgo platform-wide o fail-closed solo para el widget (tocaría el servicio compartido). En la descripción de nev-api#924.
2. **Bypass del plano legacy `/chatbot`** para GA: sigue público sin las protecciones nuevas. El token widget no lo abre, pero un atacante puede abrir su propia sesión guest legacy. Decisión: endurecer legacy o aceptar el bypass.
3. 🔴 **Credenciales en claro en `application*.properties` de nev-api** (hallazgo lateral de Codex, no inspeccionado). Rotar + Secrets Manager.

## Backend Plan 2 (conversación) — PLANIFICADO Y CODEX-APROBADO (GO), pendiente de implementar
Tras cerrar las fundaciones, se planificó el **núcleo de la conversación** (endpoints de mensajes/stream/cancel/events — el desbloqueo real). El plan (`nev-api/docs/superpowers/plans/2026-07-18-widget-backend-conversation.md`, 15 tareas, 6063 líneas) **pasó el gate de Codex con GO sin reservas** tras 5 rondas de convergencia (11→6→6→3→GO). Toda la profundidad transaccional está resuelta y aprobada:
- **Motor de generación propio del widget** (`WidgetGenerationService`) que reutiliza los adapters IA (Gemini/OpenAI/Anthropic) + RAG documental, pero es dueño de su persistencia vía `WidgetEventPublisher` — cero efectos del streaming legacy, así CANCELLED = puro no-append.
- Admisión atómica (guest+conversación+turno+evento+reserva en una tx, upsert sin huérfanos), cuota autoritativa ligada al turnId sin decremento al cancelar, fencing de lease por intento (worker superado por takeover para sin completar), replay sin huecos (seq contiguo + 409 en hueco), Redis gobernado por propiedad, rate-limit fixed-window Lua con trusted-proxy.
- **Decisión de producto anotada:** el output-guardrail obliga a bufferizar la respuesta antes de emitir chunks sanitizados → el streaming no es token-a-token en v1 (correctness-first; el contrato SSE no cambia). Refinamiento futuro: sanitización incremental.

**La implementación de sus 15 tareas es la próxima sesión** (código transaccional Mongo intrincado — se hace bien con capacidad fresca, no a la hora 7). Arranca desde un plan Codex-aprobado: ejecutar el pipeline gateado (subagentes Sonnet + doble revisión), igual que Plan 1.

## Qué falta para la integración final completa (trabajo de próximas sesiones)
La integración "landing → widget → nev-api local → escalado → bandeja admin → agente → widget" **no es alcanzable con solo fundaciones**: requiere
- **Backend `/widget/v1` Planes 2-4:** endpoints de mensajes (`POST /messages` con Idempotency-Key), streaming del turno (`POST /stream`), canal de eventos (`GET /events` SSE + `/events/poll`), integración CAS del handoff, cancelación, rate-limit + cuota atómica, uploads. **Sin estos endpoints, no hay conversación real que integrar** — hoy el backend solo tiene bootstrap+sesión+config.
- **Widget Plan 3 (panel visual):** los 10 estados del mock aprobado (`docs/mocks/widget-v1-mock.html`), theming, accesibilidad. Hoy el iframe es 0×0 y la demo se conduce por API — **no hay UI visible todavía**.
- **Widget Plan 4:** rich content, upload, i18n, observabilidad, CDN versionado con SRI.
- **F3 Admin ("Canal web"):** snippet copiable, apariencia, dominios permitidos, estado del canal.

Cada uno es un plan completo con su ciclo spec→Codex→implementación→revisión. El transporte del widget (Plan 2) ya está construido y probado contra el contrato, así que **cuando existan los endpoints backend, la integración es enchufar, no reescribir**.

## Estado de las ramas (para crear/mergear)
- `nev-sdks feat/widget-rewrite` → **PR draft nev-sdks#39** (Plan 1+2). 119 tests, build OK.
- `nev-api feat/widget-channel` → **PR draft nev-api#924** (Plan 1). Tests Testcontainers mongo:7.
- Ambas ramas pusheadas, ningún commit en ramas protegidas.

## Recomendación de siguientes pasos
1. Martín revisa los 2 PRs draft y decide sobre los 3 puntos pendientes (§decisiones).
2. Rotar las credenciales en claro (urgente, independiente de la épica).
3. Priorizar el **backend Plan 2 (mensajes/stream/events)** — es el desbloqueo de la conversación real.
4. En paralelo, el **widget Plan 3 (panel visual)** sobre el mock aprobado — es lo que hace el producto visible y demostrable.
5. Con backend P2 + widget P3, la primera integración real (conversación con bot) es alcanzable; el handoff a agente añade backend P4 + F3 admin.
