import { IncomingMessage, ServerResponse } from 'http';
import { parseUrl } from './helpers';
import { ApiError, handleError } from './error-handler';

type RouteHandler = (req: IncomingMessage, res: ServerResponse, ...params: string[]) => Promise<void>;

interface Route {
  method: string;
  path: RegExp;
  handler: RouteHandler;
}

const routes: Route[] = [];

// Register routes
export const registerRoute = (method: string, path: RegExp, handler: RouteHandler): void => {
  routes.push({ method, path, handler });
};

// Handle routing
export const handleRoutes = async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
  try {
    const method = req.method || 'GET';
    const { path } = parseUrl(req);
    
    // Find matching route
    for (const route of routes) {
      if (route.method === method) {
        const match = path.match(route.path);
        
        if (match) {
          // Extract parameters from path (starting from index 1 to skip the full match)
          const params = match.slice(1);
          
          // Call the route handler
          await route.handler(req, res, ...params);
          return true;
        }
      }
    }
    
    // No matching route found
    throw ApiError.notFound(`Cannot ${method} ${path}`);
  } catch (error) {
    handleError(error as Error, res);
    return true;
  }
}