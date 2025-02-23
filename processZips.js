const { getZipData, saveRestaurants, initializeDatabase } = require('./db');
const { searchSushiRestaurants } = require('./searchRestaurants');

const MAX_ZIPS = 100; // -1 for all

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
    await new Promise(resolve => setTimeout(resolve, 1000)); // 1-second delay
  }
}

module.exports = { startProcessing };