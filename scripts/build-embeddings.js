/**
 * build-embeddings.js
 * Berechnet Embeddings für alle Angebote im search-index.json
 * und speichert sie in public/embeddings.json.
 *
 * Ausführen mit: npm run build-embeddings
 *
 * Nur nötig wenn sich die Angebote ändern (nach build-index.js).
 * multilingual-e5-large erwartet Dokumente mit "passage: " Prefix.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const API_KEY  = 'ai_token_fa8e2233406a85356302dd1702a3147a8a82748a09eb928969c876633dcb4f44'
const ENDPOINT = 'https://api.adacor.ai/embeddings/privateai/v1/embeddings'
const MODEL    = 'multilingual-e5-large'
const BATCH    = 16   // Texte pro API-Call
const DELAY_MS = 300  // Pause zwischen Batches

async function embedBatch(texts) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, input: texts }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Embedding API ${res.status}: ${err.slice(0, 200)}`)
  }

  const data = await res.json()
  // Reihenfolge laut OpenAI-Spec über data[].index sortieren
  return data.data
    .sort((a, b) => a.index - b.index)
    .map(item => item.embedding)
}

// ── Index einlesen ─────────────────────────────────────────────
const indexPath = path.join(rootDir, 'public/search-index.json')
const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
console.log(`📦 ${index.length} Angebote werden eingebettet…`)

const ids     = []
const vectors = []

for (let i = 0; i < index.length; i += BATCH) {
  const batch = index.slice(i, i + BATCH)

  // E5-Modelle: Dokumente mit "passage: " prefixen für bessere Retrieval-Qualität
  const texts = batch.map(item =>
    `passage: ${item.name}. ${item.org}. ${item.ort}. ${item.desc}`
  )

  const embeddings = await embedBatch(texts)

  for (let j = 0; j < batch.length; j++) {
    ids.push(batch[j].id)
    // Float auf 5 Nachkommastellen runden – spart ~40% Dateigröße, kein Qualitätsverlust
    vectors.push(embeddings[j].map(v => Math.round(v * 1e5) / 1e5))
  }

  const done = Math.min(i + BATCH, index.length)
  process.stdout.write(`\r  ${done}/${index.length} (${Math.round(done / index.length * 100)}%)`)

  if (done < index.length) {
    await new Promise(r => setTimeout(r, DELAY_MS))
  }
}

process.stdout.write('\n')

// ── Corpus-Mittelwert-Subtraktion ──────────────────────────────
// Entfernt den gemeinsamen Domänen-Kontext ("Ehrenamt Essen Helfen"),
// sodass Cosine-Similarity nur noch das Differenzierende misst.
console.log('  Zentriere Vektoren (Corpus-Mittelwert-Subtraktion)…')

const dim      = vectors[0].length
const centroid = new Array(dim).fill(0)
for (const v of vectors) for (let i = 0; i < dim; i++) centroid[i] += v[i]
for (let i = 0; i < dim; i++) centroid[i] /= vectors.length

function l2normalize(v) {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0))
  return v.map(x => x / norm)
}

const centeredVectors = vectors.map(v =>
  l2normalize(v.map((x, i) => x - centroid[i]))
)

// ── Speichern ──────────────────────────────────────────────────
const outputPath = path.join(rootDir, 'public/embeddings.json')
fs.writeFileSync(outputPath, JSON.stringify({
  model: MODEL,
  centered: true,
  centroid: centroid.map(v => Math.round(v * 1e5) / 1e5),
  ids,
  vectors: centeredVectors.map(v => v.map(x => Math.round(x * 1e5) / 1e5)),
}))

const kb = (fs.statSync(outputPath).size / 1024).toFixed(0)
console.log(`✅ ${ids.length} Embeddings gespeichert → public/embeddings.json (${kb} KB)`)
