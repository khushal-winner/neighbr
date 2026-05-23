'use client'

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

// fix default marker icon broken by webpack
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

interface Post {
    id: string
    title: string
    type: string
    lat?: number
    lon?: number
}

// default centre — New Delhi for dev
const DEFAULT_CENTER: [number, number] = [28.6315, 77.2167]

export default function MapView({ posts }: { posts: Post[] }) {
    const postsWithLocation = posts.filter(p => p.lat && p.lon)

    return (
        <MapContainer
            center={DEFAULT_CENTER}
            zoom={15}
            className="h-full w-full"
        >
            <TileLayer
                attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {postsWithLocation.map(post => (
                <Marker key={post.id} position={[post.lat!, post.lon!]}>
                    <Popup>
                        <strong>{post.title}</strong>
                        <br />
                        <span className="text-xs text-gray-500">{post.type}</span>
                    </Popup>
                </Marker>
            ))}
        </MapContainer>
    )
}