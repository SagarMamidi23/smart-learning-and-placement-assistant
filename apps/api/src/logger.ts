import pino from "pino";
import { config } from "./config";

export const logger = pino({
  level: config.logLevel,
  redact: ["req.headers.cookie", "req.headers.authorization", "res.headers['set-cookie']"],
});
