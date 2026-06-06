import OpenAI from "openai";

let _client: OpenAI | null = null;

/** Returns a lazily-initialised OpenAI client. Throws if API key is missing. */
export function getOpenAI(): OpenAI {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}
