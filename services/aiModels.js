const OpenAI = require('openai');

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

// Tried in order — most accurate first, falling back to faster/smaller models
// only when an earlier one errors out (rate limit, timeout, bad JSON, etc).
const MODELS = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
];

// Shared fallback runner for every Groq-backed AI call in the app — walks
// `models` in order and returns the first successful completion's text.
async function chatCompletionWithFallback({ messages, temperature = 0.3, max_tokens = 2000, models = MODELS }) {
  let lastError;

  for (const model of models) {
    try {
      const response = await client.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens,
      });

      return { text: response.choices[0].message.content, model };
    } catch (err) {
      console.error(`[ai] model "${model}" failed: ${err.message || err}`);
      lastError = err;
    }
  }

  throw lastError;
}

module.exports = { client, MODELS, chatCompletionWithFallback };
