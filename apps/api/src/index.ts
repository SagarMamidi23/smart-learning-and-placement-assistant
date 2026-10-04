import { createApp } from "./app";
import { config } from "./config";
import { bootstrap } from "./bootstrap";
import { connectDb } from "./db";
import { logger } from "./logger";

async function main() {
  await connectDb();
  createApp().listen(config.port, () => logger.info(`api listening on :${config.port}`));
  // After listening, so health checks pass while seeding runs (embedding can wait on a cold ML service).
  void bootstrap();
}

main().catch((err) => {
  logger.fatal(err, "failed to start");
  process.exit(1);
});
