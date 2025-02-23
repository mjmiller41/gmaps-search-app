const axios = require('axios');

const OVERPASS_API = 'https://overpass-api.de/api/interpreter';
const DENSITY = 1000;
const MIN_RADIUS_MILES = 2.5;

async function searchSushiRestaurants(coordData) {
  try {
    const { lat, lon, population } = coordData;

    const areaSqMiles = population / DENSITY;
    const sideLengthMiles = Math.sqrt(areaSqMiles);
    const radiusMiles = Math.max(sideLengthMiles / 2, MIN_RADIUS_MILES);

    const latRadius = radiusMiles / 69;
    const lonRadius = radiusMiles / (69 * Math.cos(lat * Math.PI / 180));

    const south = lat - latRadius;
    const north = lat + latRadius;
    const west = lon - lonRadius;
    const east = lon + lonRadius;

    const overpassQuery = `
      [out:json];
      node["amenity"="restaurant"]["cuisine"~"sushi"](${south},${west},${north},${east});
      out body;
    `;

    const response = await axios.post(OVERPASS_API, overpassQuery, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    return response.data.elements.map(element => [
      element.tags.name || 'Unnamed Sushi Restaurant',
      element.tags['addr:housenumber'] || null,
      element.tags['addr:street'] || null,
      element.tags['addr:city'] || null,
      element.tags['addr:state'] || null,
      element.tags['addr:postcode'] || null,
      element.tags.phone || null,
      element.tags.website || null,
      element.tags.opening_hours || null,
      element.lat,
      element.lon
    ]);
  } catch (error) {
    console.error(`Error searching coords ${coordData.lat},${coordData.lon}:`, error.message);
    return [];
  }
}

module.exports = { searchSushiRestaurants };