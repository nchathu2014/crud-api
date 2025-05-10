import http, { IncomingMessage, ServerResponse } from 'http';
import { config } from 'dotenv';

// Load environment variables
config();


export function createServer(port: number = Number(process.env.PORT)): http.Server {
  const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      // Set CORS headers for development
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }
     
    } catch (error) {
      console.error('Error handling request:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
    }
  });

  // Start the server
  server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
  });

  // Handle server errors
  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use`);
      process.exit(1);
    } else {
      console.error('Server error:', error);
    }
  });

  return server;
}