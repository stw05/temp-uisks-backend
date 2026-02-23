import { z } from "zod";
import { PasswordHasher, TokenService } from "../../ports/SecurityServices";
import { UserRepository } from "../../ports/UserRepository";
import { AppError } from "../../../shared/http/errors";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export type LoginUserInput = z.infer<typeof loginSchema>;

export class LoginUserUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokenService: TokenService
  ) {}

  async execute(input: LoginUserInput): Promise<{
    token: string;
    role: string;
    user: { id: string; email: string; name: string };
  }> {
    const validated = loginSchema.parse(input);
    const user = await this.userRepository.findByEmail(validated.email.toLowerCase());

    if (!user) {
      throw new AppError("Invalid credentials", 401);
    }

    const isMatch = await this.passwordHasher.compare(validated.password, user.passwordHash);
    if (!isMatch) {
      throw new AppError("Invalid credentials", 401);
    }

    const token = this.tokenService.sign({
      sub: user.id,
      role: user.role
    });

    return {
      token,
      role: user.role,
      user: {
        id: user.id,
        email: user.email,
        name: user.fullName
      }
    };
  }
}
