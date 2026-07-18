# Demo local

1. `pnpm --filter @nevent/widget build`
2. `node packages/widget/examples/mock-api.mjs` (deja el mock del API en :4310)
3. Editar `dist/shell.html` generado: `<meta name="nevw-api" content="http://localhost:4310">`
   (temporal: el Plan 4 parametriza el apiBase por entorno de build)
4. Servir el paquete: `cd packages/widget && python3 -m http.server 4311`
5. Abrir `http://localhost:4311/examples/host-demo.html`

Verificación esperada: el iframe del shell es 0×0 en Fundaciones (el protocolo de
resize y el launcher visible/clicable llegan con el plan de theming), así que no hay
nada que pulsar. El flujo de la demo es por API: en la consola del navegador, ejecutar
`window.NeventWidget('open')` abre el panel con la cabecera "Asistente de DEMO FEST"
(config servida por el mock) y el botón × lo cierra (o `window.NeventWidget('close')`).
En la pestaña Red: GET /config, POST /sessions con {"embeddingOrigin":
"http://localhost:4311"}.
