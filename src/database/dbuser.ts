import { v4 as uuidv4 } from 'uuid';
import cluster from 'node:cluster';
import { CreateUserDto, UpdateUserDto, User } from '../types/user.types';

// Declare global variable for database synchronization
declare global {
  var dbSyncEvent: any;
}
// In-memory database
export class UserDatabase {
  private users: User[] = [];
  private isSyncing = false;

  constructor() {
    console.log(`UserDatabase constructor called in process ${process.pid}`);

    // Set up synchronization for worker processes
    if (!cluster.isPrimary) {
      // Listen for database sync events
      process.on('db-sync', (data: User[]) => {
        try {
          console.log(
            `Worker ${process.pid} (ID: ${cluster.worker?.id}) received db-sync event with ${Array.isArray(data) ? data.length : 'unknown'} users`
          );
          this.isSyncing = true;

          // Safety check: ensure data is an array
          if (Array.isArray(data)) {
            this.users = [...data];
            console.log(
              `Worker ${process.pid} (ID: ${cluster.worker?.id}) database synchronized, ${this.users.length} users`
            );
          } else {
            console.error(`Worker ${process.pid} received invalid db-sync data:`, data);
          }

          this.isSyncing = false;
        } catch (error) {
          console.error(`Error handling db-sync event:`, error);
          this.isSyncing = false;
        }
      });

      // Check if we already have data (in case event was emitted before listener was set up)
      if (global.dbSyncEvent && Array.isArray(global.dbSyncEvent)) {
        console.log(
          `Worker ${process.pid} found existing dbSyncEvent with ${global.dbSyncEvent.length} users`
        );
        this.users = [...global.dbSyncEvent];
      }
    }
  }

  // Send updates to primary process
  private notifyChanges(): void {
    if (!cluster.isPrimary && cluster.worker?.isConnected() && !this.isSyncing) {
      try {
        console.log(
          `Worker ${process.pid} (ID: ${cluster.worker?.id}) sending database update with ${this.users.length} users to primary`
        );
        process.send!({
          type: 'DB_UPDATE',
          data: [...this.users],
        });
      } catch (error) {
        console.error(`Error sending DB_UPDATE message:`, error);
      }
    }
  }

  getAllUsers(): User[] {
    console.log(`Worker ${process.pid} getAllUsers called, returning ${this.users.length} users`);
    return [...this.users];
  }

  getUserById(id: string): User | undefined {
    const user = this.users.find((user) => user.id === id);
    console.log(
      `Worker ${process.pid} getUserById called for ${id}, user ${user ? 'found' : 'not found'}`
    );
    return user;
  }

  createUser(userData: CreateUserDto): User {
    console.log(`Worker ${process.pid} creating user:`, userData);

    const newUser: User = {
      id: uuidv4(),
      ...userData,
    };

    this.users.push(newUser);
    console.log(
      `Worker ${process.pid} created user ${newUser.id}, database now has ${this.users.length} users`
    );

    // Notify primary process about changes
    this.notifyChanges();

    return { ...newUser };
  }

  updateUser(id: string, userData: UpdateUserDto): User | undefined {
    const userIndex = this.users.findIndex((user) => user.id === id);

    if (userIndex === -1) {
      console.log(`Worker ${process.pid} updateUser: user ${id} not found`);
      return undefined;
    }

    const updatedUser: User = {
      ...this.users[userIndex],
      ...userData,
    };

    this.users[userIndex] = updatedUser;
    console.log(`Worker ${process.pid} updated user ${id}`);

    // Notify primary process about changes
    this.notifyChanges();

    return { ...updatedUser };
  }

  deleteUser(id: string): boolean {
    const initialLength = this.users.length;
    this.users = this.users.filter((user) => user.id !== id);

    const userDeleted = this.users.length < initialLength;
    console.log(
      `Worker ${process.pid} delete user ${id}: ${userDeleted ? 'success' : 'user not found'}`
    );

    // Notify primary process about changes if a user was deleted
    if (userDeleted) {
      this.notifyChanges();
    }

    return userDeleted;
  }

  syncState(newState: User[]): void {
    if (!Array.isArray(newState)) {
      console.error(
        `Worker ${process.pid} (ID: ${cluster.worker?.id}) received invalid data for syncState:`,
        newState
      );
      return;
    }

    const previousIsSyncing = this.isSyncing;
    this.isSyncing = true;

    console.log(
      `Worker ${process.pid} (ID: ${cluster.worker?.id}) syncState method called. Current users: ${this.users.length}, New state users: ${newState.length}`
    );
    this.users = [...newState];

    this.isSyncing = previousIsSyncing;
    console.log(
      `Worker ${process.pid} (ID: ${cluster.worker?.id}) database synchronized via syncState method. New user count: ${this.users.length}`
    );
  }
}

const userDbInstance = new UserDatabase();
export const userDb = userDbInstance;
