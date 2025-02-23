require('dotenv').config();
console.log('Current Dir:', process.cwd());
console.log('RDS_CA_PATH:', process.env.RDS_CA_PATH);
const { startProcessing } = require('./processZips');

async function main() {
  try {
    console.log('Starting sushi restaurant search...');
    await startProcessing();
    console.log('Process completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Error in main process:', error.message);
    process.exit(1);
  }
}

main();