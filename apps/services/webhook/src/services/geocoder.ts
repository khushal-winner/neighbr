import axios from "axios"



export interface Coordinates {
    lat: number
    lon: number
}


// nomination geocoding - same provider as idnenity-service
export async function geocodeAddress(address: string): Promise<Coordinates | null> {
    try {
        const { data } = await axios.get(
            'https://nomination.openstreetmap.org/search',
            {
                params: {
                    q: address,
                    format: 'json',
                    limit: 1,
                },
                headers: {
                    'User-Agent': 'Neighbr/1.0 (contact@neighbr.app)'
                },
                timeout: 5000
            }
        )

        if (!Array.isArray(data) || data.length === 0) return null

        const lat = parseFloat(data[0].lat)
        const lon = parseFloat(data[0].lon)

        if (isNaN(lat) || isNaN(lon)) return null

        return { lat, lon }
    } catch (error) {
        console.error('[Geocoder] Nomination failed:', error)
        return null
    }
}
