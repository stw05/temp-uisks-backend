import { Pool } from "pg";
import { User } from "../../../domain/users/User";
import { CreateUserInput, UserRepository } from "../../../application/ports/UserRepository";

type UserRow = {
  id: string;
  email: string;
  full_name: string;
  password_hash: string;
  role: "admin" | "staff" | "viewer";
  created_at: Date;
  updated_at: Date;
};

const toUser = (row: UserRow): User => ({
  id: row.id,
  email: row.email,
  fullName: row.full_name,
  passwordHash: row.password_hash,
  role: row.role,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export class PostgresUserRepository implements UserRepository {
  constructor(private readonly usersDbPool: Pool) {}

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.usersDbPool.query<UserRow>(
      `SELECT id, email, full_name, password_hash, role, created_at, updated_at
       FROM users
       WHERE email = $1`,
      [email]
    );

    return result.rowCount ? toUser(result.rows[0]) : null;
  }

  async findById(id: string): Promise<User | null> {
    const result = await this.usersDbPool.query<UserRow>(
      `SELECT id, email, full_name, password_hash, role, created_at, updated_at
       FROM users
       WHERE id = $1`,
      [id]
    );

    return result.rowCount ? toUser(result.rows[0]) : null;
  }

  async create(input: CreateUserInput): Promise<User> {
    const result = await this.usersDbPool.query<UserRow>(
      `INSERT INTO users (email, full_name, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, full_name, password_hash, role, created_at, updated_at`,
      [input.email, input.fullName, input.passwordHash, input.role ?? "viewer"]
    );

    return toUser(result.rows[0]);
  }
}
