/**
 * A loopback-only relay that lets the local Training Dojo demo reach the real
 * AI proxy.
 *
 *   node scripts/dojo-relay.mjs          # listens on 127.0.0.1:8791
 *
 * The demo page runs on the Vite dev server with nobody signed in, so
 * authedFetch sends no token and the proxy answers 401. This signs in once
 * with the teacher credentials in creds.json, holds the resulting ID token
 * HERE, and forwards the demo's requests with it attached.
 *
 * It exists so that no credential and no token ever reaches the demo page.
 *
 * THIS IS A LOCAL DEVELOPMENT TOOL AND MUST NEVER BE DEPLOYED OR EXPOSED.
 * It binds to 127.0.0.1 only and has no authentication of its own, which is
 * the whole security model - the same one scripts/../site/edit.mjs uses, and
 * for the same reason. Anything that can reach it can spend the school's AI
 * budget as a teacher.
 *
 * It forwards ONLY to the Claude proxy, and refuses any other path, so it
 * cannot be talked into reading or writing the database.
 */
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'

const PORT = 8791
const HOST = '127.0.0.1'
const ORIGIN = 'http://localhost:8790'
const FN = 'https://australia-southeast1-cleverspacev2.cloudfunctions.net'
const PROXY = 'https://cleverspacev2.web.app/api/claude/v1/messages'
const MAX_BODY = 200_000

const creds = JSON.parse(readFileSync('creds.json', 'utf8').replace(/^﻿/, '').trim())
const apiKey = creds.apiKey
  || readFileSync('src/data/firebase.js', 'utf8').match(/apiKey:\s*"([^"]+)"/)?.[1]

const post = async (url, body) => {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const txt = await r.text()
  if (!r.ok) throw new Error(`${url} -> ${r.status} ${txt.slice(0, 200)}`)
  return JSON.parse(txt)
}

// The ID token lasts an hour; this refreshes it five minutes early rather than
// discovering it has expired in the middle of a demo.
let token = null
let tokenAt = 0
async function idToken() {
  if (token && Date.now() - tokenAt < 55 * 60 * 1000) return token
  const { token: custom } = await post(`${FN}/authLogin`, {
    role: 'teacher', name: creds.name, password: creds.password,
  })
  const out = await post(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    { token: custom, returnSecureToken: true })
  token = out.idToken
  tokenAt = Date.now()
  return token
}

let calls = 0

const server = createServer(async (req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': ORIGIN,
    'Access-Control-Allow-Headers': 'content-type, authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end() }
  if (req.method !== 'POST' || !req.url.startsWith('/api/claude/')) {
    res.writeHead(404, { ...cors, 'content-type': 'application/json' })
    return res.end('{"error":{"message":"this relay forwards the Claude proxy and nothing else"}}')
  }

  let body = ''
  let tooBig = false
  req.on('data', (chunk) => {
    body += chunk
    if (body.length > MAX_BODY) { tooBig = true; req.destroy() }
  })
  req.on('end', async () => {
    if (tooBig) {
      res.writeHead(413, { ...cors, 'content-type': 'application/json' })
      return res.end('{"error":{"message":"too long"}}')
    }
    try {
      const auth = await idToken()
      const out = await fetch(PROXY, {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${auth}` },
        body,
      })
      const text = await out.text()
      calls++
      let usage = ''
      try {
        const u = JSON.parse(text).usage
        if (u) usage = ` (${u.input_tokens} in / ${u.output_tokens} out)`
      } catch { /* the log line is a nicety, not the response */ }
      console.log(`${calls}. ${out.status}${usage}`)
      res.writeHead(out.status, { ...cors, 'content-type': 'application/json' })
      res.end(text)
    } catch (e) {
      console.error('relay failed:', e.message)
      res.writeHead(502, { ...cors, 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { message: String(e.message) } }))
    }
  })
})

server.listen(PORT, HOST, () => {
  console.log(`Training Dojo relay on http://${HOST}:${PORT} - forwarding to the Claude proxy as ${creds.name}`)
  console.log('Loopback only. Stop it when you are done with the demo.')
})
