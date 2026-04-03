import { useState, useEffect, useCallback, useMemo } from 'react'
import { loadData, semanticSearch, getFilterOptions, formatStadtteil } from './services/searchService'
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

const EMPTY_FILTERS = { categories: [], stadtteile: [], targets: [] }
const MAX_BROWSE = 50

/* ── Filter-Akkordeon ──────────────────────────────────────────── */

function FilterAccordion({ label, options, selected, onChange, displayFn }) {
  const [open, setOpen] = useState(false)

  const toggle = (value) => {
    onChange(
      selected.includes(value)
        ? selected.filter(v => v !== value)
        : [...selected, value]
    )
  }

  return (
    <div className="filter-group">
      <button className="filter-header" type="button" onClick={() => setOpen(!open)}>
        <span>
          {label}
          {selected.length > 0 && <span className="filter-count">{selected.length}</span>}
        </span>
        <span className={`filter-chevron${open ? ' open' : ''}`}>&#9662;</span>
      </button>
      {open && (
        <div className="filter-options">
          {options.map(opt => (
            <label key={opt} className="filter-option">
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
              />
              <span>{displayFn ? displayFn(opt) : opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Hilfsfunktion: Beschreibung für Browse-Modus ─────────────── */

function getDesc(item) {
  if (item.desc) return item.desc
  if (!item.description) return ''
  const text = item.description.replace(/<[^>]+>/g, '').trim()
  return text.length > 180 ? text.slice(0, 177) + '…' : text
}

/* ── Ergebnis-Karte ────────────────────────────────────────────── */

function ResultCard({ item, onOpen, travelTime, number }) {
  const desc = getDesc(item)
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
      {desc && <p className="card-desc">{desc}</p>}
      <span className="card-cta">Details ansehen →</span>
    </article>
  )
}

/* ── App ───────────────────────────────────────────────────────── */

export default function App() {
  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [data, setData]           = useState(null)
  const [dataError, setDataError] = useState(null)
  const [selected, setSelected]   = useState(null)
  const [stadtteil, setStadtteil] = useState(null)
  const [filters, setFilters]     = useState(EMPTY_FILTERS)
  const [travelInfo, setTravelInfo] = useState({ mode: null, times: {} })

  useEffect(() => {
    loadData()
      .then(setData)
      .catch(() => setDataError('Daten konnten nicht geladen werden.'))
  }, [])

  const filterOptions = useMemo(() => data ? getFilterOptions(data) : null, [data])

  const hasActiveFilters = filters.categories.length + filters.stadtteile.length + filters.targets.length > 0

  // Angebote nach Filtern filtern
  const applyFilters = useCallback((offers) => {
    if (!hasActiveFilters) return offers
    return offers.filter(offer => {
      if (filters.categories.length > 0 && !(offer.categories || []).some(c => filters.categories.includes(c))) return false
      if (filters.stadtteile.length > 0 && !(offer.stadtteile || []).some(s => filters.stadtteile.includes(s))) return false
      if (filters.targets.length > 0 && !(offer.targets || []).some(t => filters.targets.includes(t))) return false
      return true
    })
  }, [filters, hasActiveFilters])

  // Angezeigte Ergebnisse: Suche + Filter kombiniert, oder nur Filter (Browse)
  const displayedResults = useMemo(() => {
    if (!data) return null
    if (results !== null) return applyFilters(results)
    if (hasActiveFilters) return applyFilters([...data.offersMap.values()]).slice(0, MAX_BROWSE)
    return null
  }, [data, results, applyFilters, hasActiveFilters])

  const isBrowseMode = results === null && hasActiveFilters
  const totalBrowseCount = useMemo(() => {
    if (!isBrowseMode || !data) return 0
    return applyFilters([...data.offersMap.values()]).length
  }, [isBrowseMode, data, applyFilters])

  const runSearch = useCallback(
    async (q) => {
      if (!q.trim() || !data) return
      setLoading(true)
      setError(null)
      setResults(null)
      try {
        const { results: matches, stadtteil: st } = await semanticSearch(q, data)
        setResults(matches)
        setStadtteil(st)
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
    setStadtteil(null)
    setQuery('')
    setFilters(EMPTY_FILTERS)
  }

  const handleFilterChange = (key) => (values) => {
    setFilters(prev => ({ ...prev, [key]: values }))
  }

  const handleTravelUpdate = useCallback((mode, times) => {
    setTravelInfo({ mode, times })
  }, [])

  const showExamples = displayedResults === null && !loading && !error

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
        {/* ── Linke Spalte: Suche + Filter + Ergebnisse ── */}
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

            {/* ── Filter ── */}
            {filterOptions && (
              <section className="filter-panel">
                <FilterAccordion
                  label="Einsatzbereiche"
                  options={filterOptions.categories}
                  selected={filters.categories}
                  onChange={handleFilterChange('categories')}
                />
                <FilterAccordion
                  label="Stadtteile"
                  options={filterOptions.stadtteile}
                  selected={filters.stadtteile}
                  onChange={handleFilterChange('stadtteile')}
                  displayFn={formatStadtteil}
                />
                <FilterAccordion
                  label="Zielgruppen"
                  options={filterOptions.targets}
                  selected={filters.targets}
                  onChange={handleFilterChange('targets')}
                />
                {hasActiveFilters && (
                  <button
                    className="filter-reset"
                    type="button"
                    onClick={() => setFilters(EMPTY_FILTERS)}
                  >
                    Filter zurücksetzen
                  </button>
                )}
              </section>
            )}

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

            {displayedResults !== null && !loading && (
              <section className="results-section">
                <div className="results-header">
                  <p className="results-count">
                    {displayedResults.length === 0
                      ? 'Keine passenden Angebote gefunden.'
                      : isBrowseMode && totalBrowseCount > MAX_BROWSE
                        ? `${MAX_BROWSE} von ${totalBrowseCount} Angeboten`
                        : `${displayedResults.length} Angebot${displayedResults.length !== 1 ? 'e' : ''} gefunden`}
                    {stadtteil && ` in ${stadtteil}`}
                  </p>
                  <button className="link-btn" onClick={handleReset}>← Neue Suche</button>
                </div>

                {displayedResults.length > 0 && (
                  <div className="results-grid">
                    {displayedResults.map((item, idx) => (
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
          <MapPanel results={displayedResults} onUpdate={handleTravelUpdate} />
        </div>
      </div>

      {selected && (
        <DetailModal offer={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
