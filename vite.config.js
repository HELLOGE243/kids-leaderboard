import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function getApiKey() {
  try {
    const content = readFileSync(resolve(process.cwd(), '.env'), 'utf-8')
    const match = content.match(/^CLAUDE_API_KEY=(.+)/m) // no VITE_ prefix: never bundled into the site
    return match ? match[1].trim() : ''
  } catch { return '' }
}

function claudeApiPlugin() {
  return {
    name: 'claude-api',
    configureServer(server) {
      server.middlewares.use('/api/claude', async (req, res) => {
        const chunks = []
        req.on('data', (c) => chunks.push(c))
        req.on('end', async () => {
          const body = Buffer.concat(chunks).toString()
          const apiKey = getApiKey()
          if (!apiKey) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'No API key configured in .env' }))
            return
          }
          try {
            const apiPath = req.url || '/v1/messages'
            const response = await fetch(`https://api.anthropic.com${apiPath}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
              },
              body,
            })
            const data = await response.text()
            res.writeHead(response.status, { 'Content-Type': 'application/json' })
            res.end(data)
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: e.message }))
          }
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), claudeApiPlugin()],
})
