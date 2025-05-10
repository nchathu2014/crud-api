import { IncomingMessage, ServerResponse } from 'http';
import { parseBody, sendJson, isValidUuid } from '../server/helpers';
import { ApiError } from '../server/error-handler';
import { registerRoute } from '../server/routes';
import { validateCreateUserDto, validateUpdateUserDto } from './../models/user.model';
import { userDb } from '../database/dbuser';
import { MESSAGES } from '../../src/messages/user.messages';


// GET /api/users - Get all users
const getAllUsers = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  const users = userDb.getAllUsers();
  sendJson(res, users);
};

// GET /api/users/:id - Get user by ID
const getUserById = async (
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> => {
  // Validate UUID format
  if (!isValidUuid(userId)) {
    throw ApiError.badRequest(MESSAGES.COMMON.INVALID_USER_ID);
  }

  const user = userDb.getUserById(userId);

  if (!user) {
    throw ApiError.notFound(MESSAGES.COMMON.USER_NOT_FOUND);
  }

  sendJson(res, user);
};

// POST /api/users - Create user
const createUser = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
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
};

// PUT /api/users/:id - Update user
const updateUser = async (
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> => {
  if (!isValidUuid(userId)) {
    throw ApiError.badRequest(MESSAGES.COMMON.INVALID_USER_ID);
  }

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
};

// DELETE /api/users/:id - Delete user
const deleteUser = async (
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> => {
  if (!isValidUuid(userId)) {
    throw ApiError.badRequest(MESSAGES.COMMON.INVALID_USER_ID);
  }

  const existingUser = userDb.getUserById(userId);
  if (!existingUser) {
    throw ApiError.notFound(MESSAGES.COMMON.USER_NOT_FOUND);
  }

  userDb.deleteUser(userId);

  res.writeHead(204);
  res.end();
};

export const registerUserRoutes = (): void => {
  // User routes
  registerRoute('GET', /^\/api\/users\/?$/, getAllUsers);
  registerRoute('GET', /^\/api\/users\/(.+)$/, getUserById);
  registerRoute('POST', /^\/api\/users\/?$/, createUser);
  registerRoute('PUT', /^\/api\/users\/(.+)$/, updateUser);
  registerRoute('DELETE', /^\/api\/users\/(.+)$/, deleteUser);
};
