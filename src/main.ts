import { buildApp } from "./app";
import { env } from "./shared/config/env";
import { closePools } from "./shared/db/postgresPool";
import { closeMysqlPool } from "./shared/db/mysqlPool";

const app = buildApp();

const server = app.listen(env.PORT, () => {
  console.log(`API is running on http://localhost:${env.PORT}`);
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${env.PORT} is already in use. Stop previous process or run with PORT=<free_port>.`);
    process.exit(1);
  }

  console.error("Server failed to start:", error.message);
  process.exit(1);
});

const shutdown = async (): Promise<void> => {
  server.close(async () => {
    await Promise.all([closePools(), closeMysqlPool()]);
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
