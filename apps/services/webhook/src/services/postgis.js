"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findAffectedCommunities = findAffectedCommunities;
const prisma_1 = __importDefault(require("../plugins/prisma"));
async function findAffectedCommunities(lat, lon, radiusMeters) {
    // Create a buffer circle around the point using PostGIS ST_Buffer
    // Then find all communities whose boundaries intersect with this circle
    const result = await prisma_1.default.$queryRaw `
    SELECT 
      id, 
      name, 
      "cityId"
    FROM "MicroCommunity"
    WHERE 
      boundary IS NOT NULL
      AND ST_Intersects(
        boundary,
        ST_Buffer(
          ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography,
          ${radiusMeters}
        )::geometry
      )
  `;
    return result;
}
