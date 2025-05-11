import http from 'node:http';
import { createServer } from '../src/server/server';
import { registerUserRoutes } from '../src/controllers/user.controller';

registerUserRoutes();

const request = (options: any, body?: any): Promise<{ statusCode: number; body: any }> => {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      const chunks: Buffer[] = [];

      res.on('data', (chunk) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString();
        resolve({
          statusCode: res.statusCode || 500,
          body: responseBody ? JSON.parse(responseBody) : null,
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
};

describe('CRUD API Tests', () => {
  let server: http.Server;
  const testPort = process.env.TEST_PORT ? parseInt(process.env.TEST_PORT, 10) : 5000;
  let createdUserId: string;

  beforeAll(() => {
    server = createServer(testPort);
  });

  afterAll((done) => {
    server.close(done);
  });

  test('GET /api/users should return an empty array initially', async () => {
    const response = await request({
      method: 'GET',
      hostname: 'localhost',
      port: testPort,
      path: '/api/users',
    });

    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBe(0);
  });

  test('POST /api/users should create a new user', async () => {
    const userData = {
      username: 'johndoe',
      age: 30,
      hobbies: ['reading', 'swimming'],
    };

    const response = await request(
      {
        method: 'POST',
        hostname: 'localhost',
        port: testPort,
        path: '/api/users',
        headers: {
          'Content-Type': 'application/json',
        },
      },
      userData
    );

    expect(response.statusCode).toBe(201);
    expect(response.body).toHaveProperty('id');
    expect(response.body.username).toBe(userData.username);
    expect(response.body.age).toBe(userData.age);
    expect(response.body.hobbies).toEqual(userData.hobbies);

    createdUserId = response.body.id;
  });

  test('GET /api/users/:id should return a specific user', async () => {
    const response = await request({
      method: 'GET',
      hostname: 'localhost',
      port: testPort,
      path: `/api/users/${createdUserId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty('id', createdUserId);
  });

  test('PUT /api/users/:id should update a user', async () => {
    const updateData = {
      username: 'johndoe_updated',
      age: 31,
      hobbies: ['reading', 'swimming', 'coding'],
    };

    const response = await request(
      {
        method: 'PUT',
        hostname: 'localhost',
        port: testPort,
        path: `/api/users/${createdUserId}`,
        headers: {
          'Content-Type': 'application/json',
        },
      },
      updateData
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty('id', createdUserId);
    expect(response.body.username).toBe(updateData.username);
    expect(response.body.age).toBe(updateData.age);
    expect(response.body.hobbies).toEqual(updateData.hobbies);
  });

  test('DELETE /api/users/:id should delete a user', async () => {
    const response = await request({
      method: 'DELETE',
      hostname: 'localhost',
      port: testPort,
      path: `/api/users/${createdUserId}`,
    });

    expect(response.statusCode).toBe(204);
  });

  test('GET /api/users/:id should return 404 for deleted user', async () => {
    const response = await request({
      method: 'GET',
      hostname: 'localhost',
      port: testPort,
      path: `/api/users/${createdUserId}`,
    });

    expect(response.statusCode).toBe(404);
  });

  test('GET /api/users/:id with invalid UUID should return 400', async () => {
    const response = await request({
      method: 'GET',
      hostname: 'localhost',
      port: testPort,
      path: `/api/users/invalid-uuid`,
    });

    expect(response.statusCode).toBe(400);
  });

  test('POST /api/users with invalid data should return 400', async () => {
    const invalidUserData = {
      // Missing username
      age: 25,
      hobbies: ['reading'],
    };

    const response = await request(
      {
        method: 'POST',
        hostname: 'localhost',
        port: testPort,
        path: `/api/users`,
        headers: {
          'Content-Type': 'application/json',
        },
      },
      invalidUserData
    );

    expect(response.statusCode).toBe(400);
  });
});
