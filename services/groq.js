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

CRITICAL: You MUST return ONLY a valid JSON object. NO markdown, NO code blocks, NO explanation text, NO backticks. Just raw JSON.

Return this exact structure:
{ "items": [ { "originalText": "<exact user phrase>", "foodName": "<canonical name>", "portion": "<quantity with unit>", "calories": <number>, "protein": <number>, "carbs": <number>, "fat": <number>, "fiber": <number>, "sugar": <number> } ] }

Rules:
- Extract each distinct food item mentioned
- Estimate standard serving-size nutrition values (per the quantity specified or per 100g if no quantity given)
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

  // Strip markdown code blocks if present
  let cleanText = text;
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    cleanText = codeBlockMatch[1].trim();
  }

  // Extract JSON from response
  const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`No JSON found in Groq response: ${cleanText.substring(0, 200)}`);
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

// Buckets a new meal submission into breakfast/lunch/dinner by time of day.
// `localHour` (0-23), when supplied by the client, reflects the user's own
// timezone — the server's clock (often UTC) would otherwise misclassify meals.
function currentMealType(localHour) {
  const hour = typeof localHour === 'number' && localHour >= 0 && localHour <= 23
    ? localHour
    : new Date().getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  return 'dinner';
}

// Shared processing function — used by both the auth controller and the health retry
async function processEntry(entryId, text, localHour) {
  const CalorieEntry = require('../models/CalorieEntryModel');

  await CalorieEntry.findByIdAndUpdate(entryId, { foodText: text, status: 'inprogress' });

  const { parsed, rawResponse } = await parseFoodText(text);

  const mealType = currentMealType(localHour);
  const addedItems = parsed.items.map(item => ({
    originalText: item.originalText,
    foodName: item.foodName,
    portion: item.portion,
    calories: item.calories || 0,
    protein: item.protein || 0,
    carbs: item.carbs || 0,
    fat: item.fat || 0,
    fiber: item.fiber || 0,
    sugar: item.sugar || 0,
    mealType,
    mealStatus: 'completed',
  }));

  const entry = await CalorieEntry.findById(entryId);
  const existingItems = (entry?.mealItems || []).map(m => m.toObject());
  const mealItems = [...existingItems, ...addedItems];

  const dailyTotals = mealItems.reduce((acc, item) => {
    acc.calories += item.calories || 0;
    acc.protein += item.protein || 0;
    acc.carbs += item.carbs || 0;
    acc.fat += item.fat || 0;
    acc.fiber += item.fiber || 0;
    acc.sugar += item.sugar || 0;
    return acc;
  }, { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 });

  const updated = await CalorieEntry.findByIdAndUpdate(entryId, {
    mealItems,
    dailyTotals,
    status: 'success',
  }, { new: true });

  // The newly added items as stored (with generated _ids) so the FE can show a details modal.
  const savedAddedItems = updated.mealItems.slice(-addedItems.length);

  return { mealItems: updated.mealItems, addedItems: savedAddedItems, dailyTotals, rawResponse };
}

module.exports = { parseFoodText, getLoadingMessage, processEntry };
