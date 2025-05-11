import cluster from 'cluster';
import os from 'os';
import http, { IncomingMessage, ServerResponse } from 'http';
import { createServer } from './server'; // Assuming your actual server logic is here
import { config } from 'dotenv';
import { User } from '../types/user.types'; // Adjust the import based on your project structure
import EventEmitter from 'events';
import { userDb } from '../database/dbuser'; // Assuming this is your database module

config();

// Number of available CPU cores minus 1 (for the primary process)
// or use all cores if only 1 or 2 are available.
const totalCPUs = os.cpus().length;
const numCPUs = totalCPUs <= 2 ? totalCPUs : totalCPUs - 1;

const basePort = Number(process.env.PORT) || 4000;

interface WorkerInfo {
  port: number;
  connections: number;
}
let workersData: Record<number, WorkerInfo> = {};
let dbState: User[] = [];

// Choose a load balancing algorithm: 'round-robin', 'ip-hash', 'least-connections'
const loadBalancingAlgorithm = process.env.LOAD_BALANCING_ALGORITHM || 'round-robin';

let nextWorkerIndexForRoundRobin = 0; // For round-robin

// Create and start the cluster
export const startCluster = (): void => {
  if (cluster.isPrimary) {
    console.log(`Primary ${process.pid} is running`);
    console.log(
      `Starting load balancer on port ${basePort} using ${loadBalancingAlgorithm} algorithm`
    );
    console.log(`Server will utilize ${numCPUs} worker processes`);

    // Create worker processes
    for (let i = 0; i < numCPUs; i++) {
      const workerPort = basePort + i + 1;

      const worker = cluster.fork({ WORKER_PORT: workerPort });

      workersData[worker.id] = { port: workerPort, connections: 0 };
      console.log(
        `Worker ${worker.process.pid} (ID: ${worker.id}) will listen on port ${workerPort}`
      );
    }

    // Set up IPC message handling for database synchronization
    cluster.on('message', (worker, message) => {
      if (message && message.type === 'DB_UPDATE') {
        console.log(
          `Primary process received DB_UPDATE from worker ${worker.id}, data has ${message.data ? message.data.length : 0} users`
        );

        // Update shared state
        if (message.data && Array.isArray(message.data)) {
          dbState = [...message.data];

          // Broadcast to all workers EXCEPT the one that sent the update
          for (const id in cluster.workers) {
            const workerId = Number(id);
            if (workerId !== worker.id) {
              try {
                console.log(`Primary process broadcasting DB_SYNC to worker ${id}`);
                cluster.workers[id]?.send({
                  type: 'DB_SYNC',
                  data: dbState,
                });
              } catch (err) {
                console.error(`Error sending DB_SYNC to worker ${id}:`, err);
              }
            }
          }
        } else {
          console.error('Primary received invalid DB_UPDATE data:', message);
        }
      }
    });

    // Create load balancer
    const loadBalancer = http.createServer((req: IncomingMessage, res: ServerResponse) => {
      try {
        const workerId = selectWorker(req); // Select a worker
        const workerInfo = workersData[workerId];

        if (!workerInfo) {
          console.error(
            `Load Balancer: No worker info found for selected ID ${workerId}. This should not happen.`
          );
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Service Unavailable: Worker not found' }));
          return;
        }

        const targetPort = workerInfo.port; // Get port from our stored info

        // Update connection count (optional, for 'least-connections')
        workersData[workerId].connections++;

        // Log request details including URL path
        console.log(
          `Load balancer forwarding ${req.method} ${req.url} to worker ${workerId} on port ${targetPort}`
        );

        // Forward the request to the target worker
        forwardRequest(req, res, targetPort, workerId);
      } catch (error: any) {
        if (error.message === 'SERVICE_UNAVAILABLE_NO_WORKERS') {
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
      console.log(
        `Worker ${worker.process.pid} (ID: ${worker.id}) died. Code: ${code}, Signal: ${signal}`
      );

      const deadWorkerInfo = workersData[worker.id];

      if (!deadWorkerInfo) {
        console.error(
          `Critical: Could not find data for dead worker ${worker.id}. Cannot determine port to restart.`
        );
        delete workersData[worker.id];
        return;
      }

      const deadWorkerPort = deadWorkerInfo.port;

      delete workersData[worker.id];
      console.log(
        `Removed worker ${worker.id} from tracking. Remaining workers: ${Object.keys(workersData).length}`
      );

      // Replace the dead worker
      console.log(`Restarting worker on port ${deadWorkerPort}...`);

      const newWorker = cluster.fork({ WORKER_PORT: deadWorkerPort });

      workersData[newWorker.id] = { port: deadWorkerPort, connections: 0 };
      console.log(
        `New worker ${newWorker.process.pid} (ID: ${newWorker.id}) forked for port ${deadWorkerPort}`
      );

      // Send current DB state to the new worker
      if (dbState.length > 0) {
        console.log(
          `Sending current database state with ${dbState.length} users to new worker ${newWorker.id}`
        );
        newWorker.send({ type: 'DB_SYNC', data: dbState });
      }
    });
  } else {
    // The WORKER_PORT env variable is set by the primary when forking
    const workerPort = Number(process.env.WORKER_PORT);

    if (!workerPort) {
      console.error(
        `Worker ${process.pid} (ID: ${cluster.worker?.id}) could not determine its port. Exiting.`
      );
      process.exit(1);
    }

    process.on('message', (message: any) => {
      if (message && message.type === 'DB_SYNC' && message.data) {
        console.log(
          `Worker ${process.pid} (ID: ${cluster.worker?.id}) received DB_SYNC with ${message.data.length} users`
        );

        if (userDb && typeof userDb.syncState === 'function') {
          userDb.syncState(message.data);
        } else {
          console.error(
            `Worker ${process.pid} (ID: ${cluster.worker?.id}): userDb.syncState is not available or not a function.`
          );
        }
      }
    });

    createServer(workerPort);
    console.log(`Worker ${process.pid} (ID: ${cluster.worker?.id}) started on port ${workerPort}`);
  }
};

// Select a worker based on the chosen load balancing algorithm
const selectWorker = (req: IncomingMessage): number => {
  const workerIds = Object.keys(workersData)
    .map(Number)
    .filter((id) => workersData[id]); // Ensure worker still exists

  if (workerIds.length === 0) {
    console.warn('selectWorker: No available workers!');
    throw new Error('SERVICE_UNAVAILABLE_NO_WORKERS');
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
  if (!workersData[selectedWorkerId]) {
    // Double check if worker died between selection and use
    console.warn(
      `selectWorker: Selected worker ${selectedWorkerId} no longer exists, falling back.`
    );
    // Fallback to first available or re-select. For simplicity, fallback to first.
    if (workerIds.length > 0) return workerIds[0];
    throw new Error('SERVICE_UNAVAILABLE_NO_WORKERS');
  }
  return selectedWorkerId;
};

// Forward the request to a worker
const forwardRequest = (
  req: IncomingMessage,
  res: ServerResponse,
  targetPort: number,
  workerId: number
): void => {
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
      if (workersData[workerId]) {
        workersData[workerId].connections = Math.max(0, workersData[workerId].connections - 1);
      }
    });
  });

  proxyReq.on('error', (error) => {
    console.error(
      `Proxy request error to worker ${workerId} on port ${targetPort}:`,
      error.message
    );
    if (workersData[workerId]) {
      workersData[workerId].connections = Math.max(0, workersData[workerId].connections - 1);
    }

    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad Gateway: Error connecting to worker process' }));
    } else {
      res.end();
    }
  });

  req.pipe(proxyReq, { end: true });
};
