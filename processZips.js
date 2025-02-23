const { getZipData, saveRestaurants, initializeDatabase, pool } = require('./db');
const { searchSushiRestaurants } = require('./searchRestaurants');

// Custom log function with timestamp
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`); // PM2 captures this
}

// Error logging (optional)
function logError(message) {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] ERROR: ${message}`); // Goes to PM2 error log
}

const MAX_ZIPS = 100;

async function startProcessing() {
  log('Starting sushi restaurant search...');
  await initializeDatabase();
  const coordsWithZips = await getZipData();
  const limitedCoords = MAX_ZIPS === -1 ? coordsWithZips : coordsWithZips.slice(0, MAX_ZIPS);

  for (const coordData of limitedCoords) {
    log(`Searching coords ${coordData.lat},${coordData.lon} (zips: ${coordData.zips.join(', ')}, pop: ${coordData.population})...`);
    try {
      const restaurants = await searchSushiRestaurants(coordData);
      if (restaurants.length) {
        await saveRestaurants(restaurants);
        log(`Saved ${restaurants.length} restaurants for coords ${coordData.lat},${coordData.lon}`);
      }
    } catch (error) {
      logError(`Failed for coords ${coordData.lat},${coordData.lon}: ${error.message}`);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  const { rows } = await pool.query('SELECT COUNT(*) FROM sushi_restaurants');
  log(`Total records in sushi_restaurants: ${rows[0].count}`);
  log('Process completed successfully.');
}

module.exports = { startProcessing };