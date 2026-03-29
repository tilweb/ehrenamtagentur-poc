/**
 * build-index.js
 * Verarbeitet docs/final.xml und generiert:
 *   public/search-index.json  – kompakter Index für das LLM (~30k Tokens)
 *   public/offers.json        – vollständige Daten für die Detailansicht
 *
 * Ausführen mit: npm run build-index
 */

import { XMLParser } from 'fast-xml-parser'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

// HTML-Entities auflösen
function unescapeHtml(str) {
  if (typeof str !== 'string') return ''
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, '\u00a0')
}

// HTML-Tags entfernen + whitespace normalisieren
function stripHtml(html) {
  return unescapeHtml(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Wert zu Array normalisieren (fast-xml-parser gibt bei einem <element>-Kind kein Array)
function toArray(val) {
  if (!val) return []
  return Array.isArray(val) ? val : [val]
}

// Wert zu String: ignoriert Objekte (leere XML-Elemente mit Attributen)
function str(val) {
  if (val === null || val === undefined) return ''
  if (typeof val === 'string') return val.trim()
  if (typeof val === 'number' || typeof val === 'boolean') return String(val).trim()
  // Objekt = komplexes XML-Element → leerer String statt "[object Object]"
  return ''
}

// ── XML einlesen ───────────────────────────────────────────────
const xmlContent = fs.readFileSync(path.join(rootDir, 'docs/final.xml'), 'utf-8')

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: true,
})
const parsed = parser.parse(xmlContent)

const rawAngebote = parsed?.angebotsliste?.angebot
if (!rawAngebote) {
  console.error('❌ Keine Angebote in final.xml gefunden.')
  process.exit(1)
}
const list = Array.isArray(rawAngebote) ? rawAngebote : [rawAngebote]

// ── Verarbeiten ────────────────────────────────────────────────
const searchIndex = []
const offers = []

for (const angebot of list) {
  const id = str(angebot['@_angebotsId'])
  if (!id) continue

  const d = angebot.angebot_details || {}
  const e = angebot.einrichtung_details || {}

  const orgName  = str(e.name)
  const offerName = str(d.angebotsname)
  const ort       = str(d.ort || e.ort || 'Essen')
  const descClean = stripHtml(d.beschreibung || '')

  // ── Kompakter Suchindex ──────────────────────────────────────
  searchIndex.push({
    id,
    name: offerName,
    org: orgName,
    ort,
    desc: descClean.length > 180 ? descClean.slice(0, 177) + '…' : descClean,
  })

  // ── Vollständige Daten für Detailansicht ─────────────────────
  const contactName = [str(d.vorname), str(d.nachname)].filter(Boolean).join(' ')
  const address = [str(d.strasse), str(d.plz) && str(d.ort) ? `${str(d.plz)} ${str(d.ort)}` : str(d.ort)]
    .filter(Boolean).join(', ')
  const orgAddress = [str(e.strasse), str(e.plz) && str(e.ort) ? `${str(e.plz)} ${str(e.ort)}` : str(e.ort)]
    .filter(Boolean).join(', ')

  const categories = toArray(d.handlungsfelder?.element).map(str).filter(Boolean)
  const targets    = toArray(d.zielgruppen?.element).map(str).filter(Boolean)
  const stadtteile = toArray(d.stadtteile?.element).map(str).filter(Boolean)

  offers.push({
    id,
    name: offerName,
    org: orgName,
    ort,
    address,
    orgAddress,
    // Beschreibung als gerenderbares HTML (Entities aufgelöst, Tags intakt)
    description: unescapeHtml(str(d.beschreibung)),
    orgDescription: unescapeHtml(str(e.beschreibung)),
    avatar: str(d.avatarinfo?.medium_url || d.avatar),
    contact: {
      name: contactName,
      role: str(d.funktion_der_person),
      email: str(d.email),
      phone: str(d.telefon || d.mobil),
    },
    orgContact: {
      email: str(e.email),
      phone: str(e.telefon),
      homepage: str(e.homepage),
    },
    homepage: str(d.homepage),
    categories,
    targets,
    stadtteile,
    timeframe: str(d.zeitlicherrahmen || d.zeitspenden),
    requirements: stripHtml(str(d.anforderungen)),
    benefits: stripHtml(str(d.leistungen)),
    barrierefreiheit: str(d.barrierefreiheit),
  })
}

// ── Dateien schreiben ──────────────────────────────────────────
const publicDir = path.join(rootDir, 'public')
fs.mkdirSync(publicDir, { recursive: true })

const indexPath  = path.join(publicDir, 'search-index.json')
const offersPath = path.join(publicDir, 'offers.json')

fs.writeFileSync(indexPath,  JSON.stringify(searchIndex))
fs.writeFileSync(offersPath, JSON.stringify(offers))

const kb = (p) => (fs.statSync(p).size / 1024).toFixed(1)
console.log(`✅ ${searchIndex.length} Angebote verarbeitet`)
console.log(`   search-index.json : ${kb(indexPath)} KB`)
console.log(`   offers.json       : ${kb(offersPath)} KB`)
