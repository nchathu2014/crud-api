import { IncomingMessage, ServerResponse } from 'node:http';
import { validate as uuidValidate } from 'uuid';

// Parse URL to get path and query params
export const parseUrl = (req: IncomingMessage): { path: string; segments: string[] } => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const path = url.pathname;
  const segments = path.split('/').filter(Boolean);
  
  return { path, segments };
};

// Parse JSON body from request
export const parseBody = async (req: IncomingMessage): Promise<any> => {
  return new Promise((resolve, reject) => {
    if (req.method === 'GET' || req.method === 'DELETE') {
      return resolve({});
    }
    
    const bodyParts: Uint8Array[] = [];
    
    req.on('data', (chunk) => {
      bodyParts.push(chunk);
    });
    
    req.on('end', () => {
      try {
        const body = Buffer.concat(bodyParts).toString();
        const data = body ? JSON.parse(body) : {};
        resolve(data);
      } catch (error) {
        reject(error);
      }
    });
    
    req.on('error', (err) => {
      reject(err);
    });
  });
};

// Send JSON response
export const sendJson = (res: ServerResponse, data: any, statusCode = 200): void => {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
};

// Validate UUID format
export const isValidUuid = (uuid: string): boolean => {
  return uuidValidate(uuid);
};