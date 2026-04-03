import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'

const PORT = process.env.PORT || 3000
const DIST = new URL('./dist', import.meta.url).pathname
const ALLOWED_DOMAINS = ['api.adacor.ai']

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
}

async function serveStatic(res, urlPath) {
  let filePath = join(DIST, urlPath)

  try {
    const s = await stat(filePath)
    if (s.isDirectory()) filePath = join(filePath, 'index.html')
  } catch {
    // SPA fallback: serve index.html for non-file routes
    filePath = join(DIST, 'index.html')
  }

  try {
    const data = await readFile(filePath)
    const ext = extname(filePath)
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
    res.end(data)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  }
}

async function handleProxy(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    })
    res.end()
    return
  }

  const targetUrl = req.headers['x-target-url']
  if (!targetUrl) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'X-Target-URL header fehlt' }))
    return
  }

  try {
    const { hostname } = new URL(targetUrl)
    if (!ALLOWED_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: `Domain nicht erlaubt: ${hostname}` }))
      return
    }
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Ungültige Ziel-URL' }))
    return
  }

  let body = ''
  for await (const chunk of req) body += chunk

  try {
    const headers = { ...req.headers }
    delete headers['host']
    delete headers['x-target-url']
    delete headers['cookie']

    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? body : undefined,
    })

    const responseBody = await response.text()
    const responseHeaders = { 'Access-Control-Allow-Origin': '*' }
    response.headers.forEach((value, key) => {
      if (!['content-encoding', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) {
        responseHeaders[key] = value
      }
    })

    res.writeHead(response.status, responseHeaders)
    res.end(responseBody)
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: err.message }))
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)

  if (url.pathname === '/api-proxy') {
    handleProxy(req, res)
  } else {
    serveStatic(res, url.pathname)
  }
})

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
