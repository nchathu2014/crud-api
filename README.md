# CRUD API with In-Memory Database

A simple implementation of a CRUD API using an in-memory database with TypeScript and Node.js.

## Features

- RESTful CRUD operations for user management
- Horizontal scaling with Node.js Cluster API
- Multiple load balancing algorithms (Round-Robin, IP Hash, Least Connections)

## Requirements

- Node.js (version 22.14.0 or higher)

## API Endpoints

- `GET /api/users` - Get all users
- `GET /api/users/{userId}` - Get a user by ID
- `POST /api/users` - Create a new user
- `PUT /api/users/{userId}` - Update a user
- `DELETE /api/users/{userId}` - Delete a user

## User Object

```typescript
interface User {
  id: string;          // UUID generated on server
  username: string;    // Required
  age: number;         // Required
  hobbies: string[];   // Required (can be empty array)
}
```

## Installation and Testing

1. Clone the repository
   ```
   git clone <repository-url>
   cd crud-api
   ```

2. Install dependencies
   ```
   npm install
   ```

## Available Scripts

- `npm start` - Start the server in development mode
- `npm run start:multi` - Start with horizontal scaling (cluster mode)

## Development

The project uses TypeScript and follows a modular architecture:

- `src/index.ts` - Application entry point
- `src/models/` - Data models and validation
- `src/controllers/` - Request handlers
- `src/server/` - Server infrastructure

## Horizontal Scaling

The application supports horizontal scaling using Node.js Cluster API:

```
npm run start:multi
```

This starts multiple worker processes (one per CPU core minus 1) with a load balancer that distributes requests using the selected algorithm (configured in `.env`).

![image](https://github.com/user-attachments/assets/f7223834-049b-47be-814f-b9559efacd93)


Available load balancing algorithms:
- `round-robin` - Distributes requests sequentially across workers
- `ip-hash` - Routes requests from the same IP to the same worker (best for session consistency)
- `least-connections` - Routes to the worker with the fewest active connections
