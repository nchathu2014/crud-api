import cluster from 'node:cluster';
import os from 'node:os';
import http, { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from './server';
import { config } from 'dotenv';
import { User } from '../types/user.types';

// Load environment variables
config();

// Number of available CPU cores minus 1 (for the primary process)
const numCPUs = Math.max(1, os.cpus().length - 1);
const basePort = Number(process.env.PORT) || 4000;

// Track active connections for each worker
let workerConnections: Record<number, number> = {};

// Shared database state
let dbState: User[] = [];

// Choose a load balancing algorithm: 'round-robin', 'ip-hash', 'least-connections'
const loadBalancingAlgorithm = process.env.LOAD_BALANCING_ALGORITHM || 'round-robin';

// Create and start the load balancer
export function startCluster(): void {
  if (cluster.isPrimary) {
    console.log(`Primary ${process.pid} is running`);
    console.log(`Starting load balancer on port ${basePort} using ${loadBalancingAlgorithm} algorithm`);
    console.log(`Server will utilize ${numCPUs} worker processes`);
    
    // Create worker processes
    for (let i = 0; i < numCPUs; i++) {
      const workerPort = basePort + i + 1;
      
      // Fork workers with their port as environment variable
      const worker = cluster.fork({ WORKER_PORT: workerPort });
      
      // Initialize connection counter for this worker
      workerConnections[worker.id] = 0;
    }
    
    // Set up IPC message handling
    cluster.on('message', (worker, message) => {
      if (message.type === 'DB_UPDATE') {
        // Update shared state
        dbState = message.data;
        
        // Broadcast to all workers
        for (const id in cluster.workers) {
          cluster.workers[id]?.send({ type: 'DB_SYNC', data: dbState });
        }
      }
    });
    
    // Create load balancer
    const loadBalancer = http.createServer((req: IncomingMessage, res: ServerResponse) => {
      // Determine which worker to forward to based on chosen algorithm
      const workerId = selectWorker(req);
      const targetPort = getPortForWorker(workerId);
      
      // Update connection count
      workerConnections[workerId]++;
      
      // Forward the request to the target worker
      forwardRequest(req, res, targetPort, workerId);
    });
    
    // Start the load balancer
    loadBalancer.listen(basePort, () => {
      console.log(`Load balancer running at http://localhost:${basePort}/`);
    });
    
    // Handle worker disconnections
    cluster.on('exit', (worker, code, signal) => {
      console.log(`Worker ${worker.process.pid} died`);
      
      // Remove from connection tracking
      delete workerConnections[worker.id];
      
      // Replace the dead worker
      const deadWorkerPort = Number(worker.process.env.WORKER_PORT);
      console.log(`Restarting worker on port ${deadWorkerPort}...`);
      
      const newWorker = cluster.fork({ WORKER_PORT: deadWorkerPort });
      workerConnections[newWorker.id] = 0;
      
      // Send current DB state to the new worker
      newWorker.send({ type: 'DB_SYNC', data: dbState });
    });
  } else {
    // Worker processes
    const workerPort = Number(process.env.WORKER_PORT) || (basePort + 1);
    
    // Set up message handling for DB state sync
    process.on('message', (message:any) => {
      if (message.type === 'DB_SYNC') {
        // Notify the worker to update its database
        process.emit('db-sync', message.data);
      }
    });
    
    // Start the server on the assigned port
    createServer(workerPort);
    console.log(`Worker ${process.pid} started on port ${workerPort}`);
  }
}

// Select a worker based on the chosen load balancing algorithm
function selectWorker(req: IncomingMessage): number {
  const workerIds = Object.keys(workerConnections).map(Number);
  
  switch (loadBalancingAlgorithm) {
    case 'round-robin': {
      // Simple round-robin: just rotate through workers
      const workerIdToUse = workerIds[0];
      
      // Move this worker to the end of the array for next request
      workerIds.push(workerIds.shift()!);
      
      return workerIdToUse;
    }
    
    case 'ip-hash': {
      // IP Hash: route requests from the same IP to the same worker
      const clientIp = req.socket.remoteAddress || '0.0.0.0';
      
      // Create a simple hash from the IP
      let hash = 0;
      for (let i = 0; i < clientIp.length; i++) {
        hash = (hash + clientIp.charCodeAt(i)) % workerIds.length;
      }
      
      return workerIds[hash];
    }
    
    case 'least-connections': {
      // Least Connections: route to the worker with the fewest active connections
      let minConnections = Infinity;
      let selectedWorkerId = workerIds[0];
      
      for (const workerId of workerIds) {
        if (workerConnections[workerId] < minConnections) {
          minConnections = workerConnections[workerId];
          selectedWorkerId = workerId;
        }
      }
      
      return selectedWorkerId;
    }
    
    default:
      // Default to round-robin
      return workerIds[0];
  }
}

// Get the port number for a specific worker
function getPortForWorker(workerId: number): number {
  // Convert worker ID to an index (0-based)
  const workerIds = Object.keys(workerConnections).map(Number);
  const workerIndex = workerIds.indexOf(workerId);
  
  // Calculate port based on index
  return basePort + workerIndex + 1;
}

// Forward the request to a worker
function forwardRequest(req: IncomingMessage, res: ServerResponse, targetPort: number, workerId: number): void {
  const options = {
    hostname: 'localhost',
    port: targetPort,
    path: req.url,
    method: req.method,
    headers: req.headers
  };
  
  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
    
    // Decrement connection count when the response ends
    proxyRes.on('end', () => {
      workerConnections[workerId]--;
    });
  });
  
  // Handle errors in the proxied request
  proxyReq.on('error', (error) => {
    console.error(`Proxy request error to worker ${workerId}:`, error);
    
    // Decrement connection count
    workerConnections[workerId]--;
    
    // Send an error response
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  });
  
  // Pipe the request body to the proxied request
  req.pipe(proxyReq, { end: true });
}