const { getZipData, saveRestaurants, initializeDatabase } = require('./db');
const { searchSushiRestaurants } = require('./searchRestaurants');
const { pool } = require('./db'); // Add this to access the pool directly

const MAX_ZIPS = 100; // Or -1 for full run

async function startProcessing() {
  await initializeDatabase();
  const coordsWithZips = await getZipData();
  const limitedCoords = MAX_ZIPS === -1 ? coordsWithZips : coordsWithZips.slice(0, MAX_ZIPS);

  for (const coordData of limitedCoords) {
    console.log(`Searching coords ${coordData.lat},${coordData.lon} (zips: ${coordData.zips.join(', ')}, pop: ${coordData.population})...`);
    const restaurants = await searchSushiRestaurants(coordData);
    if (restaurants.length) {
      await saveRestaurants(restaurants);
      console.log(`Saved ${restaurants.length} restaurants for coords ${coordData.lat},${coordData.lon}`);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Add count query
  const { rows } = await pool.query('SELECT COUNT(*) FROM sushi_restaurants');
  console.log(`Total records in sushi_restaurants: ${rows[0].count}`);
}

module.exports = { startProcessing };