# gmaps-search-app README

## Overview
This Node.js application searches for places (e.g., sushi restaurants) near US ZIP codes using the Google Maps API, stores results in an AWS RDS PostgreSQL database, and runs on an AWS EC2 t2.micro instance. It processes 1,000 ZIPs/day to stay within the $200/month Google Maps API free quota.

## Prerequisites
- Node.js 18.x or higher
- AWS EC2 t2.micro instance with Ubuntu 22.04 LTS
- AWS RDS PostgreSQL (db.t4g.micro) instance
- Google Maps API key with Places API enabled
- Git and Git Bash (Windows) or Git (Linux/Mac)
- PM2 for process management on EC2
- AWS credentials and `.pem` key for EC2 access

## Setup Instructions

### 1. Local Setup
- **Clone or Initialize the Repository**:
  ```bash
  cd /path/to/your/project
  git init
  git add index.js
  git commit -m "Initial commit: Add index.js"
  ```
  - Create `.gitignore`:
    ```bash
    echo ".env\nnode_modules/" > .gitignore
    git add .gitignore
    git commit -m "Add .gitignore"
  ```

- **Install Dependencies**:
  ```bash
  npm init -y
  npm install axios pg dotenv
  ```

- **Configure `.env`** (Do not commit this file):
  ```
  GOOGLE_MAPS_API_KEY="your_api_key_here"
  RDS_ENDPOINT="gmap-search-db.chsm6wwis875.us-east-1.rds.amazonaws.com"
  RDS_DATABASE="postgres"
  RDS_USER="admin"  # Update if your RDS master username differs
  RDS_PASSWORD="your_rds_password"
  SEARCH_TERM="sushi restaurant"
  ZIP_DAILY_LIMIT="1000"
  ```

- **Test Locally**:
  ```bash
  node index.js
  ```
  - Verify it processes 1,000 ZIPs, connects to RDS, and uses Google Maps API.

### 2. EC2 Deployment
- **SSH into EC2**:
  ```bash
  ssh -i /path/to/zipcode-key.pem ubuntu@<EC2_PUBLIC_IP>
  ```

- **Set Up Project Directory**:
  ```bash
  mkdir -p /home/ubuntu/zipcode-searcher
  cd /home/ubuntu/zipcode-searcher
  ```

- **Upload Files** (Manually for now, until Git remote is set):
  ```bash
  scp -i /path/to/zipcode-key.pem index.js ubuntu@<EC2_PUBLIC_IP>:/home/ubuntu/zipcode-searcher/
  scp -i /path/to/zipcode-key.pem .env ubuntu@<EC2_PUBLIC_IP>:/home/ubuntu/zipcode-searcher/
  ```

- **Install Dependencies**:
  ```bash
  npm init -y
  npm install axios pg dotenv
  ```

- **Secure `.env`**:
  ```bash
  chmod 600 .env
  ```

- **Start with PM2**:
  ```bash
  pm2 start index.js --name "zipcode-search"
  pm2 save
  pm2 startup
  pm2 cron add "0 1 * * *" --name zipcode-search  # Run daily at 1 AM UTC
  ```

- **Monitor**:
  ```bash
  pm2 logs zipcode-search
  ```

### 3. RDS Configuration
- Ensure your RDS instance (`gmap-search-db`) is publicly accessible, in `us-east-1`, and the security group allows EC2 and your local IP on port 5432.
- Verify tables (`zip_codes`, `places`, `processing_progress`) exist or are created by `index.js`.

### 4. Google Maps API
- Enable the Places API in Google Cloud Console for your `GOOGLE_MAPS_API_KEY`.
- Monitor usage in Google Cloud Console > APIs & Services > Usage to stay within $200/month (~3,334 requests/day, ~$6.67/day).

### 5. Manual Restarts
- After each daily run (1,000 ZIPs) or full cycle (42 days), manually restart PM2:
  ```bash
  pm2 start index.js --name "zipcode-search"
  ```
- After 42 days, update `.env` for a new `SEARCH_TERM` and reset `processing_progress`:
  ```bash
  echo "SEARCH_TERM=pizza" > .env
  psql -h gmap-search-db.chsm6wwis875.us-east-1.rds.amazonaws.com -U admin -d postgres -c "TRUNCATE TABLE processing_progress;"
  pm2 start index.js --name "zipcode-search"
  ```

### 6. Troubleshooting
- Check `pm2 logs zipcode-search` for errors.
- Verify RDS connectivity with:
  ```bash
  psql -h gmap-search-db.chsm6wwis875.us-east-1.rds.amazonaws.com -U admin -d postgres
  ```
- Ensure Google Maps API costs stay under $200/month via Google Cloud Console.

## Notes
- This app processes 41,929 US ZIP codes, finding places (e.g., sushi restaurants) within a 50 km radius, storing results in RDS, and staying within Free Tier limits (EC2: 750 hours/month, RDS: 20 GB storage).
- Keep `.env` secure and exclude it from Git.
