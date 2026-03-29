# Engagementfinder

Semantische Suche für Ehrenamts-Angebote der Ehrenamt Agentur Essen e.V.
Basiert auf Exporten aus der Freinet-Datenbank.

---

## Konzept

Klassische Textsuche scheitert bei Ehrenamts-Angeboten: Nutzer suchen nach „mit Kindern arbeiten", die Angebote heißen „Schulbegleitung" oder „Lesepaten". Die semantische Suche überbrückt diese Lücke.

**Ablauf pro Suchanfrage:**

```
1. Query → Adacor Embedding API       ~150ms
   "query: mit Kindern arbeiten"
          ↓
2. Cosine-Similarity im Browser        ~1ms
   gegen 429 vorberechnete Vektoren
          ↓
3. Top 10 → LLM (Mistral 3 24B)       ~300ms
   generiert kurze Begründungen
          ↓
   Ergebniskarten mit Detailansicht
```

Gesamtlatenz: ~450–600ms (vorher: mehrere Sekunden mit reinem LLM-Ansatz)

---

## Datenquellen

Alle Exportdateien liegen in `docs/` und stammen aus Freinet-Online (Agentur-ID 177):

| Datei | Inhalt |
|---|---|
| `docs/final.xml` | Vollexport — 429 Angebote mit allen Feldern inkl. Kontaktdaten |
| `docs/shortList.xml` | Kurzliste — kompakteres Format ohne Kontaktdaten |
| `docs/topOffersFinal.json` | 4 manuell ausgewählte Highlight-Angebote |
| `docs/shortTopOffersList.json` | Identisch mit topOffersFinal.json |

---

## Generierte Dateien

Diese Dateien werden aus den Exportdaten gebaut und **nicht ins Git eingecheckt**:

| Datei | Erzeugt durch | Inhalt |
|---|---|---|
| `public/search-index.json` | `npm run build-index` | Kompakter Index (ID, Name, Org, Ort, Kurzbeschreibung) für die Embedding-Berechnung |
| `public/offers.json` | `npm run build-index` | Vollständige Daten für die Detailansicht (HTML-Beschreibung, Kontakt, Kategorien) |
| `public/embeddings.json` | `npm run build-embeddings` | 429 Vektoren (1024 Dimensionen, multilingual-e5-large) für die Cosine-Similarity |

---

## Setup

```bash
npm install

# Schritt 1: JSON-Dateien aus XML-Exporten bauen
npm run build-index

# Schritt 2: Embeddings berechnen (~3 Minuten, einmalig)
npm run build-embeddings

# Entwicklungsserver starten
npm run dev
```

---

## Update-Workflow

Wenn neue XML-Exporte aus Freinet vorliegen:

```bash
# Neue Exportdateien nach docs/ kopieren, dann:
npm run build-index
npm run build-embeddings
```

`build-embeddings` muss nur neu ausgeführt werden, wenn sich Angebote inhaltlich geändert haben — nicht bei reinen Kontaktdaten-Updates.

---

## API-Konfiguration

Credentials in `.env` (nicht ins Git einchecken):

```
VITE_ADACOR_API_KEY=...
```

| Dienst | Endpoint | Verwendung |
|---|---|---|
| Embeddings | `https://api.adacor.ai/embeddings/privateai/v1/embeddings` | Query embedden + Build-Script |
| Chat | `https://api.adacor.ai/chat/privateai/v1/chat/completions` | Begründungen generieren |
| Embedding-Modell | `multilingual-e5-large` | Semantisches Matching |
| Chat-Modell | `mistral-3-24b-128k` | Begründungstexte |

API-Calls vom Browser laufen über einen lokalen Vite-Proxy (CORS-Umgehung).
Das API-Key wird dabei nie direkt an den Client ausgeliefert.

---

## Projektstruktur

```
├── docs/                        Freinet-Exportdateien (Quelldaten)
├── public/
│   ├── search-index.json        Generiert – kompakter Suchindex
│   ├── offers.json              Generiert – vollständige Angebotsdaten
│   └── embeddings.json          Generiert – vorberechnete Vektoren
├── scripts/
│   ├── build-index.js           XML → JSON (search-index + offers)
│   └── build-embeddings.js      search-index → Vektoren via Embedding API
├── src/
│   ├── App.jsx                  Haupt-UI (Suche, Ergebnisliste)
│   ├── App.css
│   ├── components/
│   │   └── DetailModal.jsx      Detailansicht eines Angebots
│   └── services/
│       └── searchService.js     Embedding, Cosine-Similarity, LLM-Begründungen
├── .env                         API-Key (nicht einchecken)
├── vite.config.js               Dev-Server + API-Proxy
└── index.html
```

---

## Score-Schwellenwert

Ergebnisse mit einem Cosine-Similarity-Score unter **0.45** werden nicht angezeigt.
Damit werden semantisch unverwandte Treffer (Halluzinationen des alten Ansatzes) zuverlässig herausgefiltert. Der Wert kann in `searchService.js` über `MIN_SCORE` angepasst werden.
