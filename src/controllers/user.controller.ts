import { IncomingMessage, ServerResponse } from 'node:http';
import { parseBody, sendJson, isValidUuid } from '../server/helpers';
import { ApiError } from '../server/error-handler';
import { registerRoute } from '../server/routes';
import { validateCreateUserDto, validateUpdateUserDto } from '../models/user.model';
import { userDb } from '../database/dbuser';
import { MESSAGES } from '../messages/user.messages';

// GET /api/users - Get all users
const getAllUsers = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  try {
    const users = userDb.getAllUsers();
    sendJson(res, users);
  } catch (error) {
    console.error(`Error in getAllUsers: ${error}`);
    throw ApiError.internalServer('Error retrieving users');
  }
};

// GET /api/users/:id - Get user by ID
const getUserById = async (
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> => {
  try {
    if (!isValidUuid(userId)) {
      throw ApiError.badRequest(MESSAGES.COMMON.INVALID_USER_ID);
    }

    const user = userDb.getUserById(userId);

    if (!user) {
      throw ApiError.notFound(MESSAGES.COMMON.USER_NOT_FOUND);
    }

    sendJson(res, user);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error(`Error in getUserById: ${error}`);
    throw ApiError.internalServer('Error retrieving user');
  }
};

// POST /api/users - Create user
const createUser = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  try {
    const userData = await parseBody(req);

    const validationError = validateCreateUserDto(userData);
    if (validationError) {
      throw ApiError.validation(validationError);
    }

    const newUser = userDb.createUser({
      username: userData.username,
      age: userData.age,
      hobbies: userData.hobbies,
    });

    sendJson(res, newUser, 201);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw ApiError.internalServer('Error creating user');
  }
};

// PUT /api/users/:id - Update user
const updateUser = async (
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> => {
  try {
    if (!isValidUuid(userId)) {
      throw ApiError.badRequest(MESSAGES.COMMON.INVALID_USER_ID);
    }

    // Check if user exists
    const existingUser = userDb.getUserById(userId);
    if (!existingUser) {
      throw ApiError.notFound(MESSAGES.COMMON.USER_NOT_FOUND);
    }

    const userData = await parseBody(req);
    const validationError = validateUpdateUserDto(userData);
    if (validationError) {
      throw ApiError.validation(validationError);
    }

    const updatedUser = userDb.updateUser(userId, userData);

    sendJson(res, updatedUser);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw ApiError.internalServer('Error updating user');
  }
};

// DELETE /api/users/:id - Delete user
const deleteUser = async (
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> => {
  try {
    if (!isValidUuid(userId)) {
      throw ApiError.badRequest('User ID is invalid');
    }

    const existingUser = userDb.getUserById(userId);
    if (!existingUser) {
      throw ApiError.notFound('User not found');
    }

    // Delete user
    userDb.deleteUser(userId);

    // Return 204 No Content
    res.writeHead(204);
    res.end();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw ApiError.internalServer('Error deleting user');
  }
};

// Register all user routes
export const registerUserRoutes = (): void => {
  // User routes
  registerRoute('GET', /^\/api\/users\/?$/, getAllUsers);
  registerRoute('GET', /^\/api\/users\/(.+)$/, getUserById);
  registerRoute('POST', /^\/api\/users\/?$/, createUser);
  registerRoute('PUT', /^\/api\/users\/(.+)$/, updateUser);
  registerRoute('DELETE', /^\/api\/users\/(.+)$/, deleteUser);
};
