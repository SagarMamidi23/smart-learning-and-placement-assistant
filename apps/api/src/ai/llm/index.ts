import { config, llmEnv } from "../../config";
import { logger } from "../../logger";
import { resolveLLMConfig } from "./config";
import { OpenAICompatibleProvider } from "./provider";
import { LLMService } from "./service";

export { LLMService } from "./service";
export type { GenerateJsonArgs } from "./service";

let instance: LLMService | undefined;

function createLLMService(): LLMService {
  const cfg = resolveLLMConfig(llmEnv);
  if (!cfg) {
    logger.warn({ provider: llmEnv.provider }, "LLM not configured: AI endpoints will return 503");
  }
  return new LLMService(cfg ? new OpenAICompatibleProvider(cfg) : null, {
    timeoutMs: config.llmTimeoutMs,
  });
}

export const getLLM = () => (instance ??= createLLMService());

/** Tests swap in a fake; call with no argument to restore the env-configured service. */
export const setLLM = (service?: LLMService) => {
  instance = service;
};
