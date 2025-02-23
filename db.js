const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.RDS_ENDPOINT,
  database: process.env.RDS_DATABASE,
  user: process.env.RDS_USER,
  password: process.env.RDS_PASSWORD,
  port: 5432, // PostgreSQL default
});

async function getZipData() {
  const query = `
    SELECT zip, latitude, longitude, irs_estimated_population
    FROM zip_codes
  `;
  const { rows } = await pool.query(query);

  // Deduplicate by lat/lon
  const coordToZips = new Map();
  rows.forEach(row => {
    const key = `${row.latitude},${row.longitude}`;
    if (!coordToZips.has(key)) {
      coordToZips.set(key, {
        lat: parseFloat(row.latitude),
        lon: parseFloat(row.longitude),
        population: 0,
        zips: []
      });
    }
    coordToZips.get(key).zips.push(row.zip);
    coordToZips.get(key).population += parseInt(row.irs_estimated_population) || 0;
  });

  return Array.from(coordToZips.values());
}

async function saveRestaurants(restaurants) {
  if (!restaurants.length) return;

  const query = `
    INSERT INTO sushi_restaurants (
      name, housenumber, street, city, state, postcode, phone, website, opening_hours, latitude, longitude
    ) VALUES ${restaurants.map(() => '($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)').join(',')}
    ON CONFLICT DO NOTHING
  `;

  const flatValues = restaurants.flat();
  await pool.query(query, flatValues);
}

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sushi_restaurants (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255),
      housenumber VARCHAR(50),
      street VARCHAR(255),
      city VARCHAR(100),
      state VARCHAR(50),
      postcode VARCHAR(20),
      phone VARCHAR(50),
      website VARCHAR(255),
      opening_hours VARCHAR(255),
      latitude DECIMAL(10,6),
      longitude DECIMAL(10,6),
      UNIQUE (name, latitude, longitude)
      -- Add scraped fields later, e.g., rating DECIMAL(2,1), review_count INTEGER
    )
  `);
}

module.exports = { getZipData, saveRestaurants, initializeDatabase };