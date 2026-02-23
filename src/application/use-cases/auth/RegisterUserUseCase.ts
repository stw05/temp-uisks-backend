import { z } from "zod";
import { User } from "../../../domain/users/User";
import { PasswordHasher } from "../../ports/SecurityServices";
import { UserRepository } from "../../ports/UserRepository";
import { AppError } from "../../../shared/http/errors";
import { TokenService } from "../../ports/SecurityServices";

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(8),
  role: z.enum(["admin", "staff", "viewer"]).optional()
});

export type RegisterUserInput = z.infer<typeof registerSchema>;

export class RegisterUserUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokenService: TokenService
  ) {}

  async execute(input: RegisterUserInput): Promise<{ token: string; user: Omit<User, "passwordHash"> }> {
    const validated = registerSchema.parse(input);
    const existingUser = await this.userRepository.findByEmail(validated.email.toLowerCase());

    if (existingUser) {
      throw new AppError("User already exists", 409);
    }

    const passwordHash = await this.passwordHasher.hash(validated.password);
    const user = await this.userRepository.create({
      email: validated.email.toLowerCase(),
      fullName: validated.name,
      passwordHash,
      role: validated.role ?? "viewer"
    });

    const userWithoutPassword = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    const token = this.tokenService.sign({
      sub: user.id,
      role: user.role
    });

    return { token, user: userWithoutPassword };
  }
}
