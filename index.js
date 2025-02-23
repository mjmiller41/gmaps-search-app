require('dotenv').config();
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