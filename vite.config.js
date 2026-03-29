import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const ALLOWED_DOMAINS = ['api.adacor.ai']

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'api-proxy',
      configureServer(server) {
        // OPTIONS preflight
        server.middlewares.use('/api-proxy', (req, res, next) => {
          if (req.method === 'OPTIONS') {
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
            res.setHeader('Access-Control-Allow-Headers', '*')
            res.statusCode = 204
            res.end()
            return
          }
          next()
        })

        // Proxy-Handler
        server.middlewares.use('/api-proxy', async (req, res) => {
          const targetUrl = req.headers['x-target-url']

          if (!targetUrl) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'X-Target-URL header fehlt' }))
            return
          }

          // Domain-Whitelist prüfen
          try {
            const { hostname } = new URL(targetUrl)
            if (!ALLOWED_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))) {
              res.statusCode = 403
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: `Domain nicht erlaubt: ${hostname}` }))
              return
            }
          } catch {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Ungültige Ziel-URL' }))
            return
          }

          // Request-Body sammeln
          let body = ''
          for await (const chunk of req) body += chunk

          try {
            const proxyHeaders = { ...req.headers }
            delete proxyHeaders['host']
            delete proxyHeaders['x-target-url']
            delete proxyHeaders['cookie']

            const response = await fetch(targetUrl, {
              method: req.method,
              headers: proxyHeaders,
              body: req.method !== 'GET' && req.method !== 'HEAD' ? body : undefined,
            })

            res.statusCode = response.status
            response.headers.forEach((value, key) => {
              if (!['content-encoding', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) {
                res.setHeader(key, value)
              }
            })
            res.setHeader('Access-Control-Allow-Origin', '*')

            res.end(await response.text())
          } catch (err) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: err.message }))
          }
        })
      },
    },
  ],
  server: {
    port: 5173,
    open: true,
  },
})
