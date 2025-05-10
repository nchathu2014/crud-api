import { ServerResponse } from 'http';
import { sendJson } from './helpers';

export enum ErrorType {
  NOT_FOUND = 'NOT_FOUND',
  BAD_REQUEST = 'BAD_REQUEST',
  INTERNAL_SERVER = 'INTERNAL_SERVER',
  VALIDATION = 'VALIDATION'
}

export class ApiError extends Error {
  statusCode: number;
  errorType: ErrorType;

  constructor(message: string, statusCode: number, errorType: ErrorType) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errorType = errorType;
  }

  static notFound(message = 'Resource not found'): ApiError {
    return new ApiError(message, 404, ErrorType.NOT_FOUND);
  }

  static badRequest(message = 'Bad request'): ApiError {
    return new ApiError(message, 400, ErrorType.BAD_REQUEST);
  }

  static invalidUuid(): ApiError {
    return new ApiError('Invalid UUID format', 400, ErrorType.VALIDATION);
  }

  static internalServer(message = 'Internal server error'): ApiError {
    return new ApiError(message, 500, ErrorType.INTERNAL_SERVER);
  }

  static validation(message = 'Validation error'): ApiError {
    return new ApiError(message, 400, ErrorType.VALIDATION);
  }
}

export const handleError = (error: Error | ApiError, res: ServerResponse): void => {
  console.error('Error:', error.message);
  
  if (error instanceof ApiError) {
    sendJson(res, { error: error.message }, error.statusCode);
  } else {
    const isProduction = process.env.NODE_ENV === 'production';
    const message = isProduction ? 'Internal server error' : error.message;
    
    sendJson(res, { error: message }, 500);
  }
}