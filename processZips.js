const { getZipData, saveRestaurants, initializeDatabase, pool } = require('./db');
const { searchSushiRestaurants } = require('./searchRestaurants');

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

function logError(message) {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] ERROR: ${message}`);
}

const MAX_ZIPS = 100;

async function startProcessing() {
  log('Starting sushi restaurant search...');
  await initializeDatabase();
  const coordsWithZips = await getZipData();
  const limitedCoords = MAX_ZIPS === -1 ? coordsWithZips : coordsWithZips.slice(0, MAX_ZIPS);
  let totalNewRecords = 0; // Track total new inserts

  for (const coordData of limitedCoords) {
    log(`Searching coords ${coordData.lat},${coordData.lon} (zips: ${coordData.zips.join(', ')}, pop: ${coordData.population})...`);
    try {
      const restaurants = await searchSushiRestaurants(coordData);
      if (restaurants.length) {
        const { insertedCount } = await saveRestaurants(restaurants);
        totalNewRecords += insertedCount; // Accumulate new records
        log(`Found ${restaurants.length} restaurants, inserted ${insertedCount} new records for coords ${coordData.lat},${coordData.lon}`);
      } else {
        log(`No restaurants found for coords ${coordData.lat},${coordData.lon}`);
      }
    } catch (error) {
      logError(`Failed for coords ${coordData.lat},${coordData.lon}: ${error.message}`);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  const { rows } = await pool.query('SELECT COUNT(*) FROM sushi_restaurants');
  log(`Total records in sushi_restaurants: ${rows[0].count}`);
  log(`Total new records inserted this run: ${totalNewRecords}`);
  log('Process completed successfully.');
}

module.exports = { startProcessing };