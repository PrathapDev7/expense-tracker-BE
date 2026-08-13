const OpenAI = require('openai');

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

async function parseFoodText(userInput) {
  const response = await client.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages: [
      {
        role: 'system',
        content: `You are a nutrition analyzer. Given the user's food description, parse it into individual food items with nutritional values.

Rules:
- Extract each distinct food item mentioned
- Estimate standard serving-size nutrition values (per the quantity specified or per 100g if no quantity given)
- Return ONLY valid JSON matching this exact structure — no markdown, no explanation text:
{ "items": [ { "originalText": "<exact user phrase>", "foodName": "<canonical name>", "portion": "<quantity with unit>", "calories": <number>, "protein": <number>, "carbs": <number>, "fat": <number>, "fiber": <number>, "sugar": <number> } ] }
- If user didn't specify quantity, estimate for ~1 serving or 100g
- Be accurate with Indian foods and common foods
- All nutrition values are estimates rounded to nearest whole number`,
      },
      { role: 'user', content: userInput },
    ],
    temperature: 0.3,
    max_tokens: 2000,
  });

  const text = response.choices[0].message.content;

  // Extract JSON from response (may contain markdown code blocks)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`No JSON found in Groq response: ${text.substring(0, 200)}`);
  }
  const parsed = JSON.parse(jsonMatch[0]);
  return { parsed, rawResponse: text };
}

async function getLoadingMessage(step) {
  const prompts = {
    starting: "Generate ONE short friendly message (under 12 words) telling user you're starting to analyze their food diary entry. Just the message, nothing else.",
    analyzing: "Generate ONE short encouraging message (under 12 words) about identifying individual food ingredients. Just the message, nothing else.",
    calculating: "Generate ONE short message (under 12 words) about crunching nutrition numbers and macros. Just the message, nothing else.",
    finalizing: "Generate ONE short message (under 12 words) about nearly finishing and showing results. Just the message, nothing else."
  };

  const response = await client.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages: [
      { role: 'system', content: 'You generate short loading messages for a food analysis app. Be friendly and encouraging. Under 12 words.' },
      { role: 'user', content: prompts[step] || prompts.starting },
    ],
    temperature: 0.8,
    max_tokens: 50,
  });

  return response.choices[0].message.content.trim();
}

module.exports = { parseFoodText, getLoadingMessage };
