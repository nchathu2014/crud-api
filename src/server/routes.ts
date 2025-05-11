import { IncomingMessage, ServerResponse } from 'node:http';
import { parseUrl, sendJson } from './helpers';
import { ApiError, handleError } from './error-handler';

type RouteHandler = (req: IncomingMessage, res: ServerResponse, ...params: string[]) => Promise<void>;

interface Route {
  method: string;
  path: RegExp;
  handler: RouteHandler;
}

const routes: Route[] = [];

// Register routes
export function registerRoute(method: string, path: RegExp, handler: RouteHandler): void {
  routes.push({ method, path, handler });
}

// Handle routing
export async function handleRoutes(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
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
          
          try {
            // Call the route handler
            await route.handler(req, res, ...params);
            return true;
          } catch (error) {
            console.error(`Error in route handler:`, error);
            handleError(error as Error, res);
            return true;
          }
        }
      }
    }
    
    // No matching route found
    console.log(`No route matched for: ${method} ${path}`);
    throw ApiError.notFound(`Cannot ${method} ${path}`);
  } catch (error) {
    console.error(`Error in handleRoutes:`, error);
    handleError(error as Error, res);
    return true;
  }
}