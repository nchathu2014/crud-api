import cluster from 'cluster';
import os from 'os';
import http, { IncomingMessage, ServerResponse } from 'http';
import { createServer } from './server'; // Assuming your actual server logic is here
import { config } from 'dotenv';

config();

// Number of available CPU cores minus 1 (for the primary process)
// or use all cores if only 1 or 2 are available.
const totalCPUs = os.cpus().length;
const numCPUs = totalCPUs <= 2 ? totalCPUs : totalCPUs - 1;

const basePort = Number(process.env.PORT) || 4000;

// --- MODIFIED PART: Store worker port along with connection count ---
interface WorkerInfo {
  port: number;
  connections: number;
  // You could add 'worker: cluster.Worker' if needed, but id is the key
}
let workersData: Record<number, WorkerInfo> = {};
// --- END MODIFIED PART ---

// Choose a load balancing algorithm: 'round-robin', 'ip-hash', 'least-connections'
const loadBalancingAlgorithm = process.env.LOAD_BALANCING_ALGORITHM || 'round-robin'; // Default to round-robin

let nextWorkerIndexForRoundRobin = 0; // For round-robin

// Create and start the cluster
export const startCluster = (): void => {
  if (cluster.isPrimary) {
    console.log(`Primary ${process.pid} is running`);
    console.log(`Starting load balancer on port ${basePort} using ${loadBalancingAlgorithm} algorithm`);
    console.log(`Server will utilize ${numCPUs} worker processes`);

    // Create worker processes
    for (let i = 0; i < numCPUs; i++) {
      const workerPort = basePort + i + 1; // Assign a unique port to each worker

      // Fork workers with their port as an environment variable
      const worker = cluster.fork({ WORKER_PORT: workerPort });

      // --- MODIFIED PART: Initialize worker data with port ---
      workersData[worker.id] = { port: workerPort, connections: 0 };
      console.log(`Worker ${worker.process.pid} (ID: ${worker.id}) will listen on port ${workerPort}`);
      // --- END MODIFIED PART ---
    }

    // Create load balancer
    const loadBalancer = http.createServer((req: IncomingMessage, res: ServerResponse) => {
      try {
        const workerId = selectWorker(req); // Select a worker
        const workerInfo = workersData[workerId];

        if (!workerInfo) {
          console.error(`Load Balancer: No worker info found for selected ID ${workerId}. This should not happen.`);
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Service Unavailable: Worker not found' }));
          return;
        }

        const targetPort = workerInfo.port; // Get port from our stored info

        // Update connection count (optional, for 'least-connections')
        workersData[workerId].connections++;

        // Forward the request to the target worker
        forwardRequest(req, res, targetPort, workerId);
      } catch (error: any) {
        if (error.message === "SERVICE_UNAVAILABLE_NO_WORKERS") {
          console.error('Load Balancer: No workers available.');
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Service Unavailable: No workers available' }));
        } else {
          console.error('Load Balancer Error:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal Server Error in Load Balancer' }));
        }
      }
    });

    // Start the load balancer
    loadBalancer.listen(basePort, () => {
      console.log(`Load balancer running at http://localhost:${basePort}/`);
    });

    // Handle worker disconnections
    cluster.on('exit', (worker, code, signal) => {
      console.log(`Worker ${worker.process.pid} (ID: ${worker.id}) died. Code: ${code}, Signal: ${signal}`);

      // --- MODIFIED PART: Retrieve port from workersData ---
      const deadWorkerInfo = workersData[worker.id];

      if (!deadWorkerInfo) {
        console.error(`Critical: Could not find data for dead worker ${worker.id}. Cannot determine port to restart.`);
        delete workersData[worker.id]; // Still try to clean up if it exists
        return;
      }

      const deadWorkerPort = deadWorkerInfo.port; // Get port from stored info
      // --- END MODIFIED PART ---

      // Remove from tracking
      delete workersData[worker.id];
      console.log(`Removed worker ${worker.id} from tracking. Remaining workers: ${Object.keys(workersData).length}`);


      // Replace the dead worker
      console.log(`Restarting worker on port ${deadWorkerPort}...`);

      const newWorker = cluster.fork({ WORKER_PORT: deadWorkerPort });

      // --- MODIFIED PART: Add new worker to tracking ---
      workersData[newWorker.id] = { port: deadWorkerPort, connections: 0 };
      console.log(`New worker ${newWorker.process.pid} (ID: ${newWorker.id}) forked for port ${deadWorkerPort}`);
      // --- END MODIFIED PART ---
    });

  } else {
    // Worker processes
    // The WORKER_PORT env variable is set by the primary when forking
    const workerPort = Number(process.env.WORKER_PORT);

    if (!workerPort) {
      console.error(`Worker ${process.pid} (ID: ${cluster.worker?.id}) could not determine its port. Exiting.`);
      process.exit(1); // Exit if port is not defined
    }

    // Start the actual server application on the assigned port
    createServer(workerPort); // Your existing createServer function from server.ts
    console.log(`Worker ${process.pid} (ID: ${cluster.worker?.id}) started on port ${workerPort}`);
  }
};

// Select a worker based on the chosen load balancing algorithm
const selectWorker = (req: IncomingMessage): number => {
  const workerIds = Object.keys(workersData).map(Number).filter(id => workersData[id]); // Ensure worker still exists

  if (workerIds.length === 0) {
    console.warn("selectWorker: No available workers!");
    throw new Error("SERVICE_UNAVAILABLE_NO_WORKERS");
  }

  let selectedWorkerId: number;

  switch (loadBalancingAlgorithm) {
    case 'ip-hash': {
      const clientIp = req.socket.remoteAddress || req.headers['x-forwarded-for'] || '0.0.0.0';
      let hash = 0;
      // Simple hash function
      for (let i = 0; i < String(clientIp).length; i++) {
        hash = (hash << 5) - hash + String(clientIp).charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
      }
      selectedWorkerId = workerIds[Math.abs(hash) % workerIds.length];
      break;
    }
    case 'least-connections': {
      let minConnections = Infinity;
      selectedWorkerId = workerIds[0]; // Default to first
      for (const id of workerIds) {
        if (workersData[id].connections < minConnections) {
          minConnections = workersData[id].connections;
          selectedWorkerId = id;
        }
      }
      break;
    }
    case 'round-robin':
    default: {
      if (nextWorkerIndexForRoundRobin >= workerIds.length) {
        nextWorkerIndexForRoundRobin = 0; // Reset if out of bounds
      }
      selectedWorkerId = workerIds[nextWorkerIndexForRoundRobin];
      nextWorkerIndexForRoundRobin = (nextWorkerIndexForRoundRobin + 1) % workerIds.length;
      break;
    }
  }
  if (!workersData[selectedWorkerId]) { // Double check if worker died between selection and use
      console.warn(`selectWorker: Selected worker ${selectedWorkerId} no longer exists, falling back.`);
      // Fallback to first available or re-select. For simplicity, fallback to first.
      if (workerIds.length > 0) return workerIds[0];
      throw new Error("SERVICE_UNAVAILABLE_NO_WORKERS"); // Should be caught by initial check
  }
  return selectedWorkerId;
};

// Forward the request to a worker
const forwardRequest = (req: IncomingMessage, res: ServerResponse, targetPort: number, workerId: number): void => {
  const options = {
    hostname: 'localhost', // Workers are on the same machine
    port: targetPort,
    path: req.url,
    method: req.method,
    headers: req.headers,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
    proxyRes.pipe(res, { end: true });

    proxyRes.on('end', () => {
      // Decrement connection count (optional, for 'least-connections')
      if (workersData[workerId]) {
        workersData[workerId].connections = Math.max(0, workersData[workerId].connections - 1);
      }
    });
  });

  proxyReq.on('error', (error) => {
    console.error(`Proxy request error to worker ${workerId} on port ${targetPort}:`, error.message);
    // Decrement connection count (optional, for 'least-connections')
    if (workersData[workerId]) {
      workersData[workerId].connections = Math.max(0, workersData[workerId].connections - 1);
    }

    // If the worker is down, the 'exit' event should handle its restart.
    // Here, we just inform the client.
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' }); // Bad Gateway
      res.end(JSON.stringify({ error: 'Bad Gateway: Error connecting to worker process' }));
    } else {
      res.end();
    }
  });

  req.pipe(proxyReq, { end: true });
};