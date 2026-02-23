import jwt, { SignOptions } from "jsonwebtoken";
import { TokenPayload, TokenService } from "../../application/ports/SecurityServices";

export class JwtService implements TokenService {
  private readonly jwtExpiresIn: SignOptions["expiresIn"];

  constructor(
    private readonly secret: string,
    private readonly expiresIn: string
  ) {
    this.jwtExpiresIn = expiresIn as SignOptions["expiresIn"];
  }

  sign(payload: TokenPayload): string {
    return jwt.sign(payload, this.secret, { expiresIn: this.jwtExpiresIn });
  }

  verify(token: string): TokenPayload {
    return jwt.verify(token, this.secret) as TokenPayload;
  }
}
