
import { createServer } from './server/server';
import { config } from 'dotenv';

// Load environment variables
config();

// Determine if we should run in cluster mode
const isClusterMode = process.argv.includes('--cluster');

function initializeApp(): void {
  // Start the appropriate server mode
  if (isClusterMode) {
    console.log('Starting server in cluster mode...');
  } else {
    const port = Number(process.env.PORT) || 5000;
    console.log(`Starting single-instance server on port ${port}...`);
    createServer(port);
  }
}

initializeApp();