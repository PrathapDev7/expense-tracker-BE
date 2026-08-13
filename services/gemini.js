const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function parseFoodText(userInput) {
  const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });

  const prompt = `You are a nutrition analyzer. Given the user's food description, parse it into individual food items with nutritional values.

Rules:
- Extract each distinct food item mentioned
- Estimate standard serving-size nutrition values (per the quantity specified or per 100g if no quantity given)
- Return ONLY valid JSON matching this exact structure — no markdown, no explanation text:
{ "items": [ { "originalText": "<exact user phrase>", "foodName": "<canonical name>", "portion": "<quantity with unit>", "calories": <number>, "protein": <number>, "carbs": <number>, "fat": <number>, "fiber": <number>, "sugar": <number> } ] }
- If user didn't specify quantity, estimate for ~1 serving or 100g
- Be accurate with Indian foods and common foods
- All nutrition values are estimates rounded to nearest whole number`;

  const result = await model.generateContent(userInput);
  const response = await result.response;
  const text = response.text();

  // Extract JSON from response (may contain markdown code blocks)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch[0]);
}

async function getLoadingMessage(step) {
  // step: 'starting', 'analyzing', 'calculating', 'finalizing'
  const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });

  const prompts = {
    starting: "Generate ONE short friendly message (under 12 words) telling user you're starting to analyze their food diary entry. Just the message, nothing else.",
    analyzing: "Generate ONE short encouraging message (under 12 words) about identifying individual food ingredients. Just the message, nothing else.",
    calculating: "Generate ONE short message (under 12 words) about crunching nutrition numbers and macros. Just the message, nothing else.",
    finalizing: "Generate ONE short message (under 12 words) about nearly finishing and showing results. Just the message, nothing else."
  };

  const result = await model.generateContent(prompts[step] || prompts.starting);
  const response = await result.response;
  return response.text().trim();
}

module.exports = { parseFoodText, getLoadingMessage };
