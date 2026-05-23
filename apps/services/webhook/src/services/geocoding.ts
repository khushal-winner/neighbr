import axios from 'axios'

export interface GeocodeResult {
  lat: number
  lon: number
  displayName: string
}

export async function geocodeLocation(location: string): Promise<GeocodeResult> {
  const response = await axios.get('https://nominatim.openstreetmap.org/search', {
    params: {
      q: location,
      format: 'json',
      limit: 1,
    },
    headers: {
      'User-Agent': 'Neighbr-Webhook-Service/1.0',
    },
  })

  if (!response.data || response.data.length === 0) {
    throw new Error(`Location not found: ${location}`)
  }

  const result = response.data[0]
  return {
    lat: parseFloat(result.lat),
    lon: parseFloat(result.lon),
    displayName: result.display_name,
  }
}
