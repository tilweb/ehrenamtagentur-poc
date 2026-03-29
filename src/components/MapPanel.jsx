import { useState, useEffect, useRef, useCallback } from 'react'
import { loadGoogleMaps, geocodeAddress, getDistances } from '../services/mapService'

const MODES = [
  { key: 'WALKING',   label: 'Zu Fuß',  icon: '🚶' },
  { key: 'BICYCLING', label: 'Fahrrad', icon: '🚴' },
  { key: 'TRANSIT',   label: 'Öffis',   icon: '🚌' },
  { key: 'DRIVING',   label: 'Auto',    icon: '🚗' },
]

const ESSEN = { lat: 51.4556, lng: 7.0116 }

function numberedIcon(n) {
  const size = n > 9 ? 28 : 24
  const fs   = n > 9 ? 9 : 11
  const svg  = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#C0392B"/>
    <text x="${size / 2}" y="${size / 2}" text-anchor="middle" dominant-baseline="central"
      fill="white" font-weight="bold" font-size="${fs}" font-family="Arial,sans-serif">${n}</text>
  </svg>`
  return {
    url: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    scaledSize: new window.google.maps.Size(size, size),
    anchor: new window.google.maps.Point(size / 2, size / 2),
  }
}

export default function MapPanel({ results, onUpdate }) {
  const mapRef       = useRef(null)
  const mapInstance  = useRef(null)
  const markersRef   = useRef([])
  const originMarker = useRef(null)

  const [mapsReady,    setMapsReady]    = useState(false)
  const [mapsError,    setMapsError]    = useState(false)
  const [addressInput, setAddressInput] = useState('')
  const [originCoords, setOriginCoords] = useState(null)
  const [activeMode,   setActiveMode]   = useState(null)
  const [loadingAddr,  setLoadingAddr]  = useState(false)
  const [loadingTimes, setLoadingTimes] = useState(false)

  // Load Maps API
  useEffect(() => {
    loadGoogleMaps().then(() => setMapsReady(true)).catch(() => setMapsError(true))
  }, [])

  // Init map instance
  useEffect(() => {
    if (!mapsReady || !mapRef.current || mapInstance.current) return
    mapInstance.current = new window.google.maps.Map(mapRef.current, {
      center: ESSEN,
      zoom: 12,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    })
  }, [mapsReady])

  // Update markers when results change
  useEffect(() => {
    if (!mapsReady || !mapInstance.current) return

    let cancelled = false

    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []
    onUpdate(null, {})
    setActiveMode(null)

    if (!results?.length) return

    const withAddr = results
      .map((offer, idx) => ({ offer, number: idx + 1 }))
      .filter(({ offer }) => offer.address || offer.orgAddress)

    Promise.all(
      withAddr.map(({ offer, number }) =>
        geocodeAddress(offer.address || offer.orgAddress).then(coords => ({ offer, number, coords }))
      )
    ).then(geocoded => {
      if (cancelled || !mapInstance.current) return

      const bounds = new window.google.maps.LatLngBounds()
      let hasCoords = false

      geocoded.forEach(({ offer, number, coords }) => {
        if (!coords) return

        const marker = new window.google.maps.Marker({
          position: coords,
          map: mapInstance.current,
          title: `${number}. ${offer.name}`,
          icon: numberedIcon(number),
        })

        const infoWindow = new window.google.maps.InfoWindow({
          content: `<div style="font-size:13px;line-height:1.5;max-width:200px">
            <strong>${number}. ${offer.name}</strong><br>
            <span style="color:#666;font-size:12px">${offer.org}</span>
          </div>`,
        })

        marker.addListener('click', () => infoWindow.open(mapInstance.current, marker))
        markersRef.current.push(marker)
        bounds.extend(coords)
        hasCoords = true
      })

      if (hasCoords) mapInstance.current.fitBounds(bounds, 80)
    })

    return () => { cancelled = true }
  }, [results, mapsReady]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch travel times for a given mode and origin
  const fetchTimes = useCallback(async (mode, origin) => {
    if (!origin || !results?.length) return
    setLoadingTimes(true)

    const geocoded = await Promise.all(
      results.map(offer =>
        geocodeAddress(offer.address || offer.orgAddress).then(coords => ({ id: offer.id, coords }))
      )
    )

    const valid = geocoded.filter(d => d.coords)
    if (!valid.length) { setLoadingTimes(false); return }

    const times = await getDistances(origin, valid.map(d => d.coords), mode)
    if (times) {
      const map = {}
      valid.forEach((d, i) => { if (times[i]) map[d.id] = times[i] })
      onUpdate(mode, map)
    }
    setLoadingTimes(false)
  }, [results, onUpdate])

  const handleAddressSubmit = async (e) => {
    e.preventDefault()
    if (!addressInput.trim() || !mapsReady) return

    setLoadingAddr(true)
    setActiveMode(null)
    onUpdate(null, {})

    const coords = await geocodeAddress(addressInput)
    setOriginCoords(coords)
    setLoadingAddr(false)

    if (coords && mapInstance.current) {
      if (originMarker.current) originMarker.current.setMap(null)
      originMarker.current = new window.google.maps.Marker({
        position: coords,
        map: mapInstance.current,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: '#C0392B',
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 2.5,
        },
        title: 'Dein Startpunkt',
        zIndex: 100,
      })
      mapInstance.current.panTo(coords)
    }
  }

  const handleModeClick = (mode) => {
    if (activeMode === mode) {
      setActiveMode(null)
      onUpdate(null, {})
    } else {
      setActiveMode(mode)
      fetchTimes(mode, originCoords)
    }
  }

  return (
    <div className="map-panel">
      <div className="map-controls">
        {mapsError ? (
          <p className="map-error-msg">Karte konnte nicht geladen werden.</p>
        ) : (
          <>
            <form className="map-address-form" onSubmit={handleAddressSubmit}>
              <span className="map-address-icon">📍</span>
              <input
                className="map-address-input"
                type="text"
                value={addressInput}
                onChange={e => setAddressInput(e.target.value)}
                placeholder="Deine Adresse als Startpunkt"
                disabled={!mapsReady}
              />
              <button
                className="map-address-btn"
                type="submit"
                disabled={!mapsReady || loadingAddr || !addressInput.trim()}
              >
                {loadingAddr ? '…' : '→'}
              </button>
            </form>

            {originCoords && (
              <div className="map-modes">
                {MODES.map(m => (
                  <button
                    key={m.key}
                    className={`map-mode-pill${activeMode === m.key ? ' active' : ''}`}
                    onClick={() => handleModeClick(m.key)}
                    disabled={loadingTimes}
                  >
                    <span>{m.icon}</span> {m.label}
                  </button>
                ))}
                {loadingTimes && <span className="map-times-spinner" />}
              </div>
            )}
          </>
        )}
      </div>

      <div ref={mapRef} className="map-container" />
    </div>
  )
}
