const os = require("node:os");
const path = require("node:path");

process.env.NODE_ENV = "test";
process.env.BCRYPT_ROUNDS = "4";
process.env.LOG_LEVEL = "silent";
process.env.UPLOAD_DIR = path.join(os.tmpdir(), `slp-uploads-${process.pid}`);
delete process.env.CLOUDINARY_URL;
// dotenv never overrides variables that are already set, so blank these to stop apps/api/.env leaking a real key into tests.
for (const k of ["GROQ_API_KEY", "GEMINI_API_KEY", "OPENAI_API_KEY", "LLM_API_KEY"])
  process.env[k] = "";
// The toy test embedder scores lower than the real model, so use a lower similarity floor in tests.
process.env.RAG_MIN_SCORE = "0.2";
