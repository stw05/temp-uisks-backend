export type UserRole = "admin" | "staff" | "viewer";

export interface User {
  id: string;
  email: string;
  fullName: string;
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}
