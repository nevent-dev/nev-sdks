// examples/mock-api.mjs — mock del contrato spec §4.1 (puerto 4310)
//
// Node puro, sin dependencias. Fixtures duplicadas aquí como JSON literal
// (en vez de importar src/contract/fixtures.ts) para poder correr la demo
// sin depender del build de TypeScript. Mantener en sync manual con
// src/contract/fixtures.ts si el contrato cambia.
import { createServer } from 'node:http'

const config = {
  schemaVersion: 1,
  installationId: 'inst_demo_festival_01',
  assistantName: 'Asistente de DEMO FEST',
  locale: 'es',
  theme: { primaryColor: '#6d4aff', position: 'right' },
  features: { upload: true, handoff: true },
}
const session = { token: 'sess_jwt_demo', expiresInSeconds: 3600, guestHandle: 'guest_demo' }

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  const send = (body, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  console.log(`[mock-api] ${req.method} ${req.url}`)
  if (req.url?.endsWith('/config')) return send(config)
  if (req.url?.endsWith('/sessions')) return send(session)
  if (req.url?.endsWith('/sessions/refresh')) return send(session)
  send({ error: 'not_found' }, 404)
}).listen(4310, () => console.log('mock nev-api en http://localhost:4310'))
