import { v4 as uuidv4 } from 'uuid';
import cluster from 'node:cluster';
import { CreateUserDto, UpdateUserDto, User } from '../types/user.types';

// In-memory database
export class UserDatabase {
  private users: User[] = [];
  private isSyncing = false;

  constructor() {
    // Set up synchronization for worker processes
    if (!cluster.isPrimary) {
      // Listen for database sync events
      process.on('db-sync', (data: User[]) => {
        this.isSyncing = true;
        this.users = Array.isArray(data) ? [...data] : [];
        this.isSyncing = false;
      });
    }
  }

  // Send updates to primary process
  private notifyChanges(): void {
    if (!cluster.isPrimary && process.send && !this.isSyncing) {
      try {
        process.send({
          type: 'DB_UPDATE',
          data: [...this.users],
        });
      } catch (error) {
        console.error(`Error sending DB_UPDATE message: ${error}`);
      }
    }
  }

  getAllUsers(): User[] {
    return [...this.users];
  }

  getUserById(id: string): User | undefined {
    return this.users.find((user) => user.id === id);
  }

  createUser(userData: CreateUserDto): User {
    const newUser: User = {
      id: uuidv4(),
      ...userData,
    };
    this.users.push(newUser);

    // Notify primary process about changes
    this.notifyChanges();
    return { ...newUser };
  }

  updateUser(id: string, userData: UpdateUserDto): User | undefined {
    const userIndex = this.users.findIndex((user) => user.id === id);

    if (userIndex === -1) {
      return undefined;
    }

    const updatedUser: User = {
      ...this.users[userIndex],
      ...userData,
    };

    this.users[userIndex] = updatedUser;
    this.notifyChanges();
    return { ...updatedUser };
  }

  deleteUser(id: string): boolean {
    const initialLength = this.users.length;
    this.users = this.users.filter((user) => user.id !== id);
    const userDeleted = this.users.length < initialLength;

    // Notify primary process about changes if a user was deleted
    if (userDeleted) {
      this.notifyChanges();
    }
    return userDeleted;
  }
}

const userDbInstance = new UserDatabase();
export const userDb = userDbInstance;
