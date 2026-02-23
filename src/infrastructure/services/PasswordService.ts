import bcrypt from "bcryptjs";
import { PasswordHasher } from "../../application/ports/SecurityServices";

export class PasswordService implements PasswordHasher {
  async hash(plainPassword: string): Promise<string> {
    return bcrypt.hash(plainPassword, 10);
  }

  async compare(plainPassword: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hash);
  }
}
