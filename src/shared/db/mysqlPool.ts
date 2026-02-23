import mysql from "mysql2/promise";
import { env } from "../config/env";

export const appDbPool = mysql.createPool({
  host: env.APP_DB_HOST,
  port: env.APP_DB_PORT,
  database: env.APP_DB_NAME,
  user: env.APP_DB_USER,
  password: env.APP_DB_PASSWORD,
  connectionLimit: 10,
  namedPlaceholders: false,
  multipleStatements: true
});

export const closeMysqlPool = async (): Promise<void> => {
  await appDbPool.end();
};
