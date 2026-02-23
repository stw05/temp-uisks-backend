import dotenv from "dotenv";
import path from "node:path";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  APP_DB_HOST: z.string(),
  APP_DB_PORT: z.coerce.number().default(3306),
  APP_DB_NAME: z.string(),
  APP_DB_USER: z.string(),
  APP_DB_PASSWORD: z.string(),
  APP_DB_LOCALE: z.string().default("рус"),
  USERS_DB_HOST: z.string().default("localhost"),
  USERS_DB_PORT: z.coerce.number().default(5433),
  USERS_DB_NAME: z.string().default("users_db"),
  USERS_DB_USER: z.string().default("users_admin"),
  USERS_DB_PASSWORD: z.string().default("users_password"),
  JWT_SECRET: z.string(),
  JWT_EXPIRES_IN: z.string().default("1d"),
  SQL_EXAMPLE_BASE: z.string().default("sql_example")
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment config: ${parsed.error.message}`);
}

export const env = {
  ...parsed.data,
  SQL_EXAMPLE_BASE: path.resolve(process.cwd(), parsed.data.SQL_EXAMPLE_BASE)
};
