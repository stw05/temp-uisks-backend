import { Pool } from "pg";
import { env } from "../config/env";

export const usersDbPool = new Pool({
  host: env.USERS_DB_HOST,
  port: env.USERS_DB_PORT,
  database: env.USERS_DB_NAME,
  user: env.USERS_DB_USER,
  password: env.USERS_DB_PASSWORD
});

export const closePools = async (): Promise<void> => {
  await Promise.all([usersDbPool.end()]);
};
