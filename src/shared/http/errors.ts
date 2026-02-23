export class AppError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const toHttpError = (error: unknown): { status: number; message: string } => {
  if (error instanceof AppError) {
    return { status: error.statusCode, message: error.message };
  }

  if (error instanceof Error) {
    return { status: 500, message: error.message };
  }

  return { status: 500, message: "Internal server error" };
};
