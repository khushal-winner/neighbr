"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.geocodeLocation = geocodeLocation;
const axios_1 = __importDefault(require("axios"));
async function geocodeLocation(location) {
    const response = await axios_1.default.get('https://nominatim.openstreetmap.org/search', {
        params: {
            q: location,
            format: 'json',
            limit: 1,
        },
        headers: {
            'User-Agent': 'Neighbr-Webhook-Service/1.0',
        },
    });
    if (!response.data || response.data.length === 0) {
        throw new Error(`Location not found: ${location}`);
    }
    const result = response.data[0];
    return {
        lat: parseFloat(result.lat),
        lon: parseFloat(result.lon),
        displayName: result.display_name,
    };
}
