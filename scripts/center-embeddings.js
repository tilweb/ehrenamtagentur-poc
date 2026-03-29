/**
 * center-embeddings.js
 * Wendet Corpus-Mittelwert-Subtraktion auf bestehende embeddings.json an.
 *
 * Problem: Alle Angebote teilen denselben Domänen-Kontext (Ehrenamt, Essen, Helfen).
 * Das zieht alle Vektoren in dieselbe Richtung → Scores komprimiert auf 0.77–0.83,
 * Unterschiede zwischen relevanten und irrelevanten Angeboten kaum messbar.
 *
 * Lösung: Den Durchschnittsvektor (= "das typische Ehrenamtsangebot in Essen")
 * von jedem Vektor subtrahieren. Übrig bleibt nur das Differenzierende.
 *
 * Verwandt mit: Mu & Viswanath (2018) "All-but-the-Top"
 * https://arxiv.org/abs/1702.01417
 *
 * Ausführen mit: npm run center-embeddings
 * (Kein API-Call nötig, verarbeitet bestehende embeddings.json)
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir   = path.resolve(__dirname, '..')
const embPath   = path.join(rootDir, 'public/embeddings.json')

const data = JSON.parse(fs.readFileSync(embPath, 'utf-8'))

if (data.centered) {
  console.log('⚠️  Embeddings sind bereits zentriert. Abbruch.')
  process.exit(0)
}

const { ids, vectors } = data
const dim = vectors[0].length
const n   = vectors.length

// ── Schritt 1: Corpus-Centroid berechnen ───────────────────────
const centroid = new Array(dim).fill(0)
for (const v of vectors) {
  for (let i = 0; i < dim; i++) centroid[i] += v[i]
}
for (let i = 0; i < dim; i++) centroid[i] /= n

// ── Schritt 2: Centroid subtrahieren + re-normalisieren ────────
function l2normalize(v) {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0))
  return v.map(x => x / norm)
}

const centeredVectors = vectors.map(v =>
  l2normalize(v.map((x, i) => x - centroid[i]))
)

// ── Schritt 3: Speichern (Centroid mitgespeichert für Query-Zeit) ──
const output = {
  model: data.model,
  centered: true,
  centroid: centroid.map(v => Math.round(v * 1e5) / 1e5),
  ids,
  vectors: centeredVectors.map(v => v.map(x => Math.round(x * 1e5) / 1e5)),
}

fs.writeFileSync(embPath, JSON.stringify(output))

const kb = (fs.statSync(embPath).size / 1024).toFixed(0)
console.log(`✅ ${n} Vektoren zentriert → ${embPath} (${kb} KB)`)
console.log(`   Centroid-Norm (vor Subtraktion): ${
  Math.sqrt(centroid.reduce((s, x) => s + x * x, 0)).toFixed(4)
}`)
