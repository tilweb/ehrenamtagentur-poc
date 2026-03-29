const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

let loadPromise = null

export function loadGoogleMaps() {
  if (window.google?.maps) return Promise.resolve()
  if (loadPromise) return loadPromise

  loadPromise = new Promise((resolve, reject) => {
    window.__mapsReady = resolve
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&callback=__mapsReady`
    script.async = true
    script.defer = true
    script.onerror = () => { loadPromise = null; reject(new Error('Google Maps failed to load')) }
    document.head.appendChild(script)
  })
  return loadPromise
}

const geocodeCache = new Map()

export async function geocodeAddress(address) {
  if (!address) return null
  if (geocodeCache.has(address)) return geocodeCache.get(address)

  return new Promise((resolve) => {
    new window.google.maps.Geocoder().geocode({ address, region: 'de' }, (results, status) => {
      const coords = status === 'OK' && results[0]
        ? { lat: results[0].geometry.location.lat(), lng: results[0].geometry.location.lng() }
        : null
      geocodeCache.set(address, coords)
      resolve(coords)
    })
  })
}

export async function getDistances(origin, destinations, mode) {
  return new Promise((resolve) => {
    new window.google.maps.DistanceMatrixService().getDistanceMatrix(
      {
        origins: [origin],
        destinations,
        travelMode: window.google.maps.TravelMode[mode],
        language: 'de',
        ...(mode === 'TRANSIT' ? { transitOptions: { departureTime: new Date() } } : {}),
      },
      (response, status) => {
        if (status !== 'OK') { resolve(null); return }
        resolve(
          (response.rows[0]?.elements || []).map(el =>
            el.status === 'OK' ? el.duration.text : null
          )
        )
      }
    )
  })
}
