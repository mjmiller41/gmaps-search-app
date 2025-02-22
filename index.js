const axios = require('axios');
const { Pool } = require('pg');
require('dotenv').config(); // For API key security

// Google Maps API config
const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// Database connection (keep pool open for EC2)
const pool = new Pool({
  user: process.env.RDS_USER || 'postgres',
  host: process.env.RDS_ENDPOINT || 'gmap-search-db.chsm6wwis875.us-east-1.rds.amazonaws.com',
  database: process.env.RDS_DATABASE || 'postgres',   // Use 'postgres' or 'gmap_search_db'
  password: process.env.RDS_PASSWORD || 'SecurePass123!',
  port: 5432,
  ssl: { rejectUnauthorized: false }, // Allow SSL without certificate
  max: 20, // Max connections in pool (tune for t2.micro)
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 2000 // Timeout for establishing connections
});

const zipDailyLimit = process.env.ZIP_DAILY_LIMIT || 1000;

async function getZipCodes(lastProcessedZip = null) {
  try {
    let query = 'SELECT zip, latitude AS lat, longitude AS lon FROM zip_codes';
    if (lastProcessedZip) {
      query += ` WHERE zip > $1 ORDER BY zip LIMIT ${zipDailyLimit}`; // Process ~1000 ZIPs/day
    } else {
      query += ` ORDER BY zip LIMIT ${zipDailyLimit}`; // Start with first 1,667 ZIPs
    }
    const result = await pool.query(query, lastProcessedZip ? [lastProcessedZip] : []);
    return result.rows; // Returns up to 1,667 rows with valid coordinates
  } catch (error) {
    console.error('Error fetching zip codes:', error);
    throw error;
  }
}

async function getLastProcessedZip() {
  try {
    const result = await pool.query(`
            SELECT zip FROM processing_progress ORDER BY id DESC LIMIT 1
        `);
    return result.rows[0]?.zip || null;
  } catch (error) {
    console.error('Error fetching last processed zip:', error);
    return null;
  }
}

async function updateProcessingProgress(zip) {
  try {
    await pool.query(
      'INSERT INTO processing_progress (zip) VALUES ($1)',
      [zip]
    );
    console.log(`Updated progress: Last processed ZIP ${zip}`);
  } catch (error) {
    console.error('Error updating processing progress:', error);
    throw error;
  }
}

async function createProgressTable() {
  try {
    await pool.query(`
            CREATE TABLE IF NOT EXISTS processing_progress (
                id SERIAL PRIMARY KEY,
                zip VARCHAR(5) UNIQUE,
                processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
    console.log('Processing progress table created or verified.');
  } catch (error) {
    console.error('Error creating progress table:', error);
    throw error;
  }
}

async function loadAndProcessZipCodes() {
  await createProgressTable();
  const lastZip = await getLastProcessedZip();
  const zipcodes = await getZipCodes(lastZip);
  console.log(`Loaded ${zipcodes.length} zip codes (starting after ${lastZip || 'none'})`);
  return zipcodes;
}

async function batchPlaceDetails(placeIds, zip) {
  const batchSize = 50; // Batch size for placeDetails
  const results = [];

  for (let i = 0; i < placeIds.length; i += batchSize) {
    const batch = placeIds.slice(i, i + batchSize);
    const batchPromises = batch.map(placeId =>
      axios.get(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,rating&key=${API_KEY}`, { timeout: 5000 })
    );

    try {
      const responses = await Promise.all(batchPromises);
      responses.forEach(response => {
        const details = response.data.result;
        if (details) {
          results.push({
            zip_code: zip,
            place_id: details.place_id,
            name: details.name,
            address: details.formatted_address,
            rating: details.rating || null
          });
        }
      });
    } catch (batchError) {
      console.error(`Error processing batch for zip ${zip}:`, batchError.message);
      if (batchError.response?.status === 429) {
        console.log('Rate limit hit for batch, waiting 5 seconds...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      continue; // Skip this batch, retry later if needed
    }

    await new Promise(resolve => setTimeout(resolve, 500)); // Delay between batches
  }

  return results;
}

async function searchPlaces() {
  try {
    // Create places table if not exists, limiting fields to reduce costs
    await pool.query(`
            CREATE TABLE IF NOT EXISTS places (
                id SERIAL PRIMARY KEY,
                zip_code VARCHAR(5),
                place_id VARCHAR(50),
                name TEXT,
                address TEXT,
                rating FLOAT
            )
        `);

    const zipcodes = await loadAndProcessZipCodes();

    if (zipcodes.length === 0) {
      console.log('No more ZIPs to process. All ZIPs completed or error occurred.');
      process.exit(0); // Explicitly exit, triggering PM2 stop unless restarted
    }

    const searchTerm = process.env.SEARCH_TERM
    const encSearchTerm = encodeURIComponent(searchTerm)

    for (const { zip, lat, lon } of zipcodes) {
      try {
        // FindPlaceFromText request (minimal fields to reduce costs)
        const searchUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encSearchTerm}&inputtype=textquery&locationbias=circle:50000@${lat},${lon}&fields=place_id&key=${API_KEY}`;
        const searchResp = await axios.get(searchUrl, { timeout: 5000 });
        const candidates = searchResp.data.candidates || [];

        if (candidates.length > 0) {
          console.log(`Found ${candidates.length} candidates for zip ${zip} with search ${searchTerm}`);
          const placeDetailsResults = await batchPlaceDetails(candidates.map(c => c.place_id), zip);

          if (placeDetailsResults.length > 0) {
            const query = `
                  INSERT INTO places (zip_code, place_id, name, address, rating)
                  VALUES ${placeDetailsResults.map((_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`).join(', ')}
                  ON CONFLICT (place_id, zip_code) DO UPDATE SET name = EXCLUDED.name, address = EXCLUDED.address, rating = EXCLUDED.rating
                  RETURNING *;
              `;
            const values = placeDetailsResults.flatMap(r => [
              r.zip_code, r.place_id, r.name, r.address, r.rating
            ]);
            await pool.query(query, values);
            console.log(`Stored/Updated ${placeDetailsResults.length} places for zip ${zip} with search ${searchTerm}`);
          }
        } else {
          console.log(`No candidates found for zip ${zip} with search ${searchTerm}`);
        }

      } catch (apiError) {
        console.error(`Error processing zip ${zip}:`, apiError.message);
        if (apiError.response?.status === 429) { // Rate limit exceeded
          console.log('Rate limit hit, waiting 5 seconds...');
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait longer
        } else if (apiError.code === 'ETIMEDOUT') {
          console.log('API timeout, waiting 5 seconds...');
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
        continue; // Skip to next ZIP on API error
      }

      // Rate limiting (increase for cost control and safety)
      await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay to reduce request rate

      // Update progress after each ZIP to ensure resumability
      await updateProcessingProgress(zip);
    }
  } catch (dbError) {
    console.error('Database error:', dbError.message);
    throw dbError;
  }
}

// Handle uncaught exceptions and exit gracefully for EC2
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the script for EC2 (remove if testing locally)
searchPlaces()
  .then(() => console.log('Place search completed successfully'))
  .catch((error) => console.error('Place search failed:', error))
  .finally(() => {
    console.log('Script finished.');
  });
