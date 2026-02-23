import { User, UserRole } from "../../domain/users/User";

export interface CreateUserInput {
  email: string;
  fullName: string;
  passwordHash: string;
  role?: UserRole;
}

export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(input: CreateUserInput): Promise<User>;
}
