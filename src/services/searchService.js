/**
 * searchService.js
 * Hybrid-Suche: Embedding + Substring-Textsuche, gefiltert durch LLM.
 *
 *  Stufe 1a – Embedding + Cosine Similarity (semantisch)
 *    Query → Adacor Embedding API → Cosine-Similarity im Browser
 *    → Top-15 Kandidaten mit Score ≥ 0.55
 *
 *  Stufe 1b – Substring-Textsuche (exakt, ergänzend)
 *    Normalisierte Suche (Umlaute, Groß-/Kleinschreibung) in name/org/desc
 *    → Fängt Treffer wie „Suppenfahrrad" bei Query „Fahrrad"
 *
 *  Union beider Mengen → max. 20 Kandidaten
 *
 *  Stufe 2 – LLM als Qualitätsfilter + Begründungen
 *    Nur die Kandidaten-Titel → LLM bewertet Relevanz, generiert Begründungen
 *    (~600 Tokens statt früher ~35.000)
 */

const EMBED_ENDPOINT = 'https://api.adacor.ai/embeddings/privateai/v1/embeddings'
const EMBED_MODEL    = 'multilingual-e5-large'

const CHAT_ENDPOINT  = 'https://api.adacor.ai/chat/privateai/v1/chat/completions'
const CHAT_MODEL     = 'mistral-3-24b-128k'

const API_KEY        = import.meta.env.VITE_ADACOR_API_KEY

// Nach Corpus-Zentrierung ist die Score-Reihenfolge aussagekräftig.
// Wir nehmen einfach Top-N; das absolute Minimum filtert nur wirklich unkorrelierte Treffer.
const TOP_K_EMBED    = 12   // Top-N Embedding-Kandidaten nach Score
const MIN_ABS_SCORE  = 0.05 // Absolutes Minimum nach Zentrierung (nahezu 0 = kein Bezug)
const MAX_CANDIDATES = 20   // Maximale Kandidaten für LLM-Filter

// ── Daten laden ────────────────────────────────────────────────

export async function loadData() {
  const [indexRes, offersRes, embRes] = await Promise.all([
    fetch('/search-index.json'),
    fetch('/offers.json'),
    fetch('/embeddings.json'),
  ])

  if (!indexRes.ok)  throw new Error(`search-index.json: HTTP ${indexRes.status}`)
  if (!offersRes.ok) throw new Error(`offers.json: HTTP ${offersRes.status}`)
  if (!embRes.ok)    throw new Error(`embeddings.json: HTTP ${embRes.status}`)

  const [index, offers, embeddings] = await Promise.all([
    indexRes.json(), offersRes.json(), embRes.json(),
  ])

  const offersMap = new Map(offers.map(o => [o.id, o]))
  return { index, offersMap, embeddings }
}

// ── Hilfsfunktionen ────────────────────────────────────────────

// Corpus-Centroid subtrahieren + re-normalisieren
// Entfernt den gemeinsamen Domänen-Kontext aus dem Query-Vektor
function centerAndNormalize(vec, centroid) {
  const centered = vec.map((x, i) => x - centroid[i])
  const norm = Math.sqrt(centered.reduce((s, x) => s + x * x, 0))
  return centered.map(x => x / norm)
}

function cosineSimilarity(a, b) {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na  += a[i] * a[i]
    nb  += b[i] * b[i]
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

// Umlaut-Normalisierung für robuste Substring-Suche
// „fahrrad" matcht so „Fahrräder", „fahrräder", „Suppenfahrrad"
function normalize(str) {
  return str
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
}

// ── Query-Expansion via LLM ────────────────────────────────────
// Erweitert die Suchanfrage um semantisch verwandte Begriffe.
// „Fahrrad" → „Fahrrad Mountainbike Rad Radfahren E-Bike Fahrradtour"
// Das verbessert sowohl das Embedding als auch die Substring-Textsuche.

async function expandQuery(queryText) {
  const messages = [
    {
      role: 'system',
      content: 'Antworte ausschließlich mit einer kommagetrennten Liste ohne weiteren Text.',
    },
    {
      role: 'user',
      content:
        `Erstelle eine kurze Liste von synonymen und direkt verwandten Begriffen für: "${queryText}"\n` +
        `Kontext: Suche nach Ehrenamts-Angeboten in Essen.\n` +
        `Antworte NUR mit den Begriffen, kommagetrennt, maximal 6 Begriffe, auf Deutsch.\n` +
        `Beispiel für "Fahrrad": Fahrrad, Mountainbike, Rad, Radfahren, Fahrradtour, E-Bike`,
    },
  ]

  try {
    const response = await fetch('/api-proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
        'X-Target-URL': CHAT_ENDPOINT,
      },
      body: JSON.stringify({ model: CHAT_MODEL, messages, temperature: 0, max_tokens: 60 }),
    })

    if (!response.ok) return [queryText]

    const data = await response.json()
    const raw  = data.choices?.[0]?.message?.content?.trim() || ''
    const terms = raw.split(',').map(t => t.trim()).filter(Boolean)
    return terms.length > 0 ? terms : [queryText]
  } catch {
    return [queryText]
  }
}

// ── Stufe 1a: Embedding-Suche ──────────────────────────────────

async function embedQuery(expandedTerms) {
  // Expanded terms als einzelnen kombinierten Text embedden
  // → Query-Vektor liegt in der Mitte aller verwandten Konzepte
  const combinedInput = `query: ${expandedTerms.join(', ')}`

  const response = await fetch('/api-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
      'X-Target-URL': EMBED_ENDPOINT,
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: combinedInput }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message || `Embedding-Fehler: ${response.status}`)
  }

  const data = await response.json()
  return data.data[0].embedding
}

// ── Stufe 1b: Substring-Textsuche ─────────────────────────────

function textSearch(query, index) {
  // Bedeutungstragende Wörter (> 3 Zeichen), normalisiert
  const terms = normalize(query)
    .split(/\s+/)
    .filter(t => t.length > 3)

  if (terms.length === 0) return []

  return index.filter(item => {
    const text = normalize(`${item.name} ${item.org} ${item.desc}`)
    // Mindestens ein Term muss als Substring vorkommen
    return terms.some(term => text.includes(term))
  })
}

// ── Stufe 2: LLM-Filter ───────────────────────────────────────

async function filterRelevant(query, offers) {
  const compact = offers
    .map((o, i) => `${i + 1}. ${o.name} | ${o.org}`)
    .join('\n')

  const messages = [
    {
      role: 'system',
      content:
        'Du bist ein Assistent der Ehrenamt Agentur Essen. ' +
        'Antworte ausschließlich mit einem validen JSON-Array ohne weiteren Text.',
    },
    {
      role: 'user',
      content:
        `Suchanfrage: "${query}"\n\n` +
        `Kandidaten:\n${compact}\n\n` +
        `Ist jedes Angebot inhaltlich relevant für die Suchanfrage?\n` +
        `Antworte NUR mit einem JSON-Array aus true/false in gleicher Reihenfolge:\n` +
        `[true, false, true, ...]`,
    },
  ]

  try {
    const response = await fetch('/api-proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
        'X-Target-URL': CHAT_ENDPOINT,
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages,
        temperature: 0,
        max_tokens: 60,
      }),
    })

    if (!response.ok) return offers.map(() => true)

    const data  = await response.json()
    const raw   = data.choices?.[0]?.message?.content?.trim() || '[]'
    const match = raw.match(/\[[\s\S]*\]/)
    if (!match) return offers.map(() => true)

    const results = JSON.parse(match[0])
    return Array.isArray(results) ? results : offers.map(() => true)
  } catch {
    return offers.map(() => true)
  }
}

// ── Hauptfunktion ──────────────────────────────────────────────

export async function semanticSearch(query, data) {
  const { index, offersMap, embeddings } = data

  // Query-Expansion (LLM): „Fahrrad" → [„Fahrrad", „Mountainbike", „Rad", …]
  const expandedTerms = await expandQuery(query)

  // Stufe 1a+b parallel: Embedding auf expanded query + Textsuche auf allen Termen
  const [rawQueryVec, textHits] = await Promise.all([
    embedQuery(expandedTerms),
    Promise.resolve(textSearch(expandedTerms.join(' '), index)),
  ])

  // Corpus-Centroid subtrahieren – entfernt gemeinsamen Domänen-Kontext
  const queryVec = embeddings.centroid
    ? centerAndNormalize(rawQueryVec, embeddings.centroid)
    : rawQueryVec

  // Scores berechnen, Top-K nehmen
  // Nach Zentrierung ist die Reihenfolge aussagekräftig; absolutes Minimum filtert Rauschen
  const embedHitIds = new Set(
    embeddings.ids
      .map((id, i) => ({ id, score: cosineSimilarity(queryVec, embeddings.vectors[i]) }))
      .sort((a, b) => b.score - a.score)
      .filter(({ score }) => score >= MIN_ABS_SCORE)
      .slice(0, TOP_K_EMBED)
      .map(({ id }) => id)
  )

  // Stufe 1b: Textsuche-IDs
  const textHitIds = new Set(textHits.map(h => h.id))

  // Union: Embedding-Treffer zuerst (nach Score sortiert), dann reine Text-Treffer
  const seenIds    = new Set()
  const candidates = []

  for (const id of embedHitIds) {
    if (!seenIds.has(id)) { seenIds.add(id); candidates.push(id) }
  }
  for (const id of textHitIds) {
    if (!seenIds.has(id)) { seenIds.add(id); candidates.push(id) }
  }

  const candidateOffers = candidates
    .slice(0, MAX_CANDIDATES)
    .map(id => offersMap.get(id))
    .filter(Boolean)

  if (candidateOffers.length === 0) return []

  // Stufe 2: LLM filtert Relevanz
  const relevant = await filterRelevant(query, candidateOffers)

  return candidateOffers.filter((_, i) => relevant[i] !== false)
}
