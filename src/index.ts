import { createServer } from './server/server';
import { startCluster } from './server/cluster';
import { config } from 'dotenv';
import { registerUserRoutes } from './controllers/user.controller';

config();

const registerRoutes = (): void => {
  registerUserRoutes();
};

//when cluster mode running
const isClusterMode = process.argv.includes('--cluster');

const initializeApp = (): void => {
  registerRoutes();
  
  // Start the appropriate server mode
  if (isClusterMode) {
    console.log('Starting server in cluster mode...');
    startCluster();
  } else {
    const port = Number(process.env.PORT) || 4000;
    console.log(`Starting single-instance server on port ${port}...`);
    createServer(port);
  }
};

initializeApp();