import { useState, useEffect, useCallback } from 'react'
import { loadData, semanticSearch } from './services/searchService'
import DetailModal from './components/DetailModal'
import MapPanel from './components/MapPanel'
import './App.css'

const EXAMPLES = [
  'mit Kindern arbeiten',
  'Senioren begleiten',
  'Sport und Bewegung',
  'Umwelt und Natur',
  'Nachhilfe und Bildung',
  'soziale Beratung',
  'Geflüchtete unterstützen',
  'handwerklich helfen',
]

const MODE_ICONS = {
  WALKING:   '🚶',
  BICYCLING: '🚴',
  TRANSIT:   '🚌',
  DRIVING:   '🚗',
}

function ResultCard({ item, onOpen, travelTime, number }) {
  return (
    <article className="card" onClick={() => onOpen(item)} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(item)}>
      <div className="card-header">
        <span className="card-number">{number}</span>
        <p className="card-org">{item.org}</p>
      </div>
      <h3 className="card-title">{item.name}</h3>
      {item.ort && <p className="card-location">{item.ort}</p>}
      {travelTime && <p className="card-travel">{travelTime}</p>}
      {item.desc && <p className="card-desc">{item.desc}</p>}
      <span className="card-cta">Details ansehen →</span>
    </article>
  )
}

export default function App() {
  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [data, setData]           = useState(null)
  const [dataError, setDataError] = useState(null)
  const [selected, setSelected]   = useState(null)
  const [travelInfo, setTravelInfo] = useState({ mode: null, times: {} })

  useEffect(() => {
    loadData()
      .then(setData)
      .catch(() => setDataError('Daten konnten nicht geladen werden.'))
  }, [])

  const runSearch = useCallback(
    async (q) => {
      if (!q.trim() || !data) return
      setLoading(true)
      setError(null)
      setResults(null)
      try {
        const matches = await semanticSearch(q, data)
        setResults(matches)
      } catch (err) {
        setError('Suche fehlgeschlagen: ' + err.message)
      } finally {
        setLoading(false)
      }
    },
    [data]
  )

  const handleSubmit = (e) => {
    e.preventDefault()
    runSearch(query)
  }

  const handleExample = (q) => {
    setQuery(q)
    runSearch(q)
  }

  const handleReset = () => {
    setResults(null)
    setError(null)
    setQuery('')
  }

  const handleTravelUpdate = useCallback((mode, times) => {
    setTravelInfo({ mode, times })
  }, [])

  const showExamples = results === null && !loading && !error

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div>
            <h1 className="site-title">Engagementfinder</h1>
            <p className="site-sub">Ehrenamt in Essen finden</p>
          </div>
          <img src="/logo.png" alt="Engagementfinder Ehrenamt Agentur Essen" className="header-logo" />
        </div>
      </header>

      <div className="app-body">
        {/* ── Linke Spalte: Suche + Ergebnisse ── */}
        <div className="left-panel">
          <div className="left-inner">

            <section className="search-section">
              <form className="search-form" onSubmit={handleSubmit}>
                <input
                  className="search-input"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Was möchtest du tun? z.B. »mit Kindern arbeiten«"
                  disabled={loading || !!dataError}
                  autoFocus
                />
                <button
                  className="search-btn"
                  type="submit"
                  disabled={loading || !!dataError || !query.trim()}
                >
                  {loading ? <span className="btn-spinner" /> : 'Suchen'}
                </button>
              </form>
              {dataError && <p className="msg-error">{dataError}</p>}
            </section>

            {showExamples && (
              <section className="examples-section">
                <p className="examples-label">Oder wähle ein Thema:</p>
                <div className="examples-list">
                  {EXAMPLES.map((q) => (
                    <button
                      key={q}
                      className="example-chip"
                      onClick={() => handleExample(q)}
                      disabled={!data}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {loading && (
              <div className="status-loading">
                <div className="loading-bar" />
                <p>Suche nach passenden Angeboten…</p>
              </div>
            )}

            {error && !loading && (
              <div className="msg-error">
                <p>{error}</p>
                <button className="link-btn" onClick={handleReset}>Neu versuchen</button>
              </div>
            )}

            {results !== null && !loading && (
              <section className="results-section">
                <div className="results-header">
                  <p className="results-count">
                    {results.length === 0
                      ? 'Keine passenden Angebote gefunden.'
                      : `${results.length} Angebot${results.length !== 1 ? 'e' : ''} gefunden`}
                  </p>
                  <button className="link-btn" onClick={handleReset}>← Neue Suche</button>
                </div>

                {results.length > 0 && (
                  <div className="results-grid">
                    {results.map((item, idx) => (
                      <ResultCard
                        key={item.id}
                        item={item}
                        onOpen={setSelected}
                        number={idx + 1}
                        travelTime={
                          travelInfo.mode && travelInfo.times[item.id]
                            ? `${MODE_ICONS[travelInfo.mode]} ${travelInfo.times[item.id]}`
                            : null
                        }
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

          </div>

          <footer className="footer">
            <p>
              Daten bereitgestellt von{' '}
              <a href="https://www.ehrenamtessen.de" target="_blank" rel="noopener noreferrer">
                Ehrenamt Agentur Essen e.V.
              </a>
            </p>
          </footer>
        </div>

        {/* ── Rechte Spalte: Karte ── */}
        <div className="right-panel">
          <MapPanel results={results} onUpdate={handleTravelUpdate} />
        </div>
      </div>

      {selected && (
        <DetailModal offer={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
