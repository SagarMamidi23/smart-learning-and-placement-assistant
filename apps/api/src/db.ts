import mongoose from "mongoose";
import { config } from "./config";
import { logger } from "./logger";

export async function connectDb(uri = config.mongoUri, dbName?: string) {
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10_000 });
  logger.info("mongo connected");
}

export const dbReady = () => mongoose.connection.readyState === 1;
