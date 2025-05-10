
import { UpdateUserDto } from "../../src/types/user.types";
import { CreateUserDto } from "../../src/types/user.types";
import { User } from "../../src/types/user.types";
import { v4 as uuidv4 } from 'uuid';

// In-memory User database
export class UserDatabase {
    private users: User[] = [];
  
    getAllUsers(): User[] {
      return [...this.users];
    }
  
    getUserById(id: string): User | undefined {
      return this.users.find(user => user.id === id);
    }
  
    createUser(userData: CreateUserDto): User {
      const newUser: User = {
        id: uuidv4(),
        ...userData
      };
      
      this.users.push(newUser);
      return { ...newUser };
    }
  
    updateUser(id: string, userData: UpdateUserDto): User | undefined {
      const userIndex = this.users.findIndex(user => user.id === id);
      
      if (userIndex === -1) {
        return undefined;
      }
      
      const updatedUser: User = {
        ...this.users[userIndex],
        ...userData
      };
      
      this.users[userIndex] = updatedUser;
      return { ...updatedUser }; // Return a copy to prevent direct modification
    }
  
    deleteUser(id: string): boolean {
      const initialLength = this.users.length;
      this.users = this.users.filter(user => user.id !== id);
      return this.users.length < initialLength;
    }
  }
  
  export const userDb = new UserDatabase();