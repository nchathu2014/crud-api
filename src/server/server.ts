import http, { IncomingMessage, ServerResponse } from 'node:http';
import { parseUrl } from './helpers';
import { handleError, ApiError } from './error-handler';
import { handleRoutes } from './routes';
import { config } from 'dotenv';

config();

// Create HTTP server
export const createServer = (port: number = Number(process.env.PORT) || 4000): http.Server => {
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
      
      // Pass to route handler
      const handled = await handleRoutes(req, res);
      
      // If no route handled the request, it's a 404
      if (!handled) {
        const { path } = parseUrl(req);
        throw ApiError.notFound(`Cannot ${req.method} ${path}`);
      }
    } catch (error) {
      handleError(error as Error, res);
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