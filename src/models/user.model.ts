import { MESSAGES } from '../messages/user.messages';

// Validation functions
export function validateCreateUserDto(data: any): string | null {
  if (!data) {
    return MESSAGES.COMMON.REQUIRED_REQUEST_BODY;
  }

  if (!data.username || typeof data.username !== 'string') {
    return MESSAGES.COMMON.REQUIRED_USERNAME;
  }

  if (data.age === undefined || typeof data.age !== 'number' || data.age < 0) {
    return MESSAGES.COMMON.REQUIRED_AGE;
  }

  if (!Array.isArray(data.hobbies)) {
    return MESSAGES.COMMON.REQUIRED_HOBBIES;
  }

  for (const hobby of data.hobbies) {
    if (typeof hobby !== 'string') {
      return MESSAGES.COMMON.REQUIRED_HOBBY_TYPE;
    }
  }

  return null;
}

export function validateUpdateUserDto(data: any): string | null {
  if (!data) {
    return MESSAGES.COMMON.REQUIRED_REQUEST_BODY;
  }

  if (data.username !== undefined && typeof data.username !== 'string') {
    return MESSAGES.COMMON.REQUIRED_USERNAME;
  }

  if (data.age !== undefined && (typeof data.age !== 'number' || data.age < 0)) {
    return MESSAGES.COMMON.REQUIRED_AGE;
  }

  if (data.hobbies !== undefined) {
    if (!Array.isArray(data.hobbies)) {
      return MESSAGES.COMMON.REQUIRED_HOBBIES;
    }

    for (const hobby of data.hobbies) {
      if (typeof hobby !== 'string') {
        return MESSAGES.COMMON.REQUIRED_HOBBY_TYPE;
      }
    }
  }

  return null;
}
