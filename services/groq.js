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
        content: `You are a nutrition analyzer. Given the user's food description, parse it into individual food items with nutrient DENSITY values (per 100g) plus the estimated gram weight of the portion mentioned. Do NOT multiply anything yourself — report the density and the grams separately and a calculator will scale them.

CRITICAL: You MUST return ONLY a valid JSON object. NO markdown, NO code blocks, NO explanation text, NO backticks. Just raw JSON.

Return this exact structure:
{ "items": [ { "originalText": "<exact user phrase>", "foodName": "<canonical name>", "portion": "<human-readable quantity, e.g. '1kg' or '2 eggs (~100g)'>", "grams": <total edible weight in grams that this portion represents>, "caloriesPer100g": <number>, "proteinPer100g": <number>, "carbsPer100g": <number>, "fatPer100g": <number>, "fiberPer100g": <number>, "sugarPer100g": <number> } ] }

Rules:
- Extract each distinct food item mentioned
- "grams" is the TOTAL weight of what the user said (e.g. "1kg watermelon" -> grams: 1000, NOT 100). Convert units like kg, cups, pieces, servings to grams using standard reference weights.
- If the user didn't specify a quantity, assume grams: 100 (one 100g reference serving)
- caloriesPer100g/proteinPer100g/etc. are always per-100g NUTRIENT DENSITY values for that food — they must stay the same regardless of how much the user ate. Never scale them by the portion size yourself.
- Be accurate with Indian foods and common foods
- Example: input "1kg watermelon" -> watermelon is ~30 kcal per 100g, so: { "foodName": "Watermelon", "portion": "1kg", "grams": 1000, "caloriesPer100g": 30, "proteinPer100g": 0.6, "carbsPer100g": 8, "fatPer100g": 0.2, "fiberPer100g": 0.4, "sugarPer100g": 6 }
- All density values are estimates rounded to 1 decimal place`,
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

  // Scale per-100g nutrient density by the reported gram weight ourselves —
  // small models are unreliable at doing this multiplication inline, and
  // tend to just echo the per-100g figure as if it were the portion total.
  const scale = (per100g, grams) => Math.round(((per100g || 0) * grams) / 100);
  parsed.items = (parsed.items || []).map(item => {
    const grams = item.grams > 0 ? item.grams : 100;
    return {
      originalText: item.originalText,
      foodName: item.foodName,
      portion: item.portion,
      calories: scale(item.caloriesPer100g, grams),
      protein: scale(item.proteinPer100g, grams),
      carbs: scale(item.carbsPer100g, grams),
      fat: scale(item.fatPer100g, grams),
      fiber: scale(item.fiberPer100g, grams),
      sugar: scale(item.sugarPer100g, grams),
    };
  });

  return { parsed, rawResponse: text };
}

const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const GOAL_CALORIE_ADJUSTMENTS = {
  lose: -500,
  maintain: 0,
  gain: 350,
};

// Derives daily nutrition targets from a person's stats using the standard
// Mifflin-St Jeor + activity-multiplier method, computed directly rather
// than asking an LLM to do the arithmetic (small models are unreliable at
// multi-step math and nothing here needs the LLM's language ability).
function calculateCalorieGoals({ age, gender, heightCm, weightKg, activityLevel, goal }) {
  const bmrMale = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  const bmrFemale = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  const bmr = gender === 'male' ? bmrMale : gender === 'female' ? bmrFemale : (bmrMale + bmrFemale) / 2;

  const activityMultiplier = ACTIVITY_MULTIPLIERS[activityLevel] ?? ACTIVITY_MULTIPLIERS.moderate;
  const tdee = bmr * activityMultiplier;

  const calorieAdjustment = GOAL_CALORIE_ADJUSTMENTS[goal] ?? 0;
  const calorieTarget = Math.max(1200, Math.round(tdee + calorieAdjustment));

  const proteinTarget = Math.round(1.6 * weightKg);
  const fatTarget = Math.round((calorieTarget * 0.25) / 9);
  const carbTarget = Math.max(
    0,
    Math.round((calorieTarget - proteinTarget * 4 - fatTarget * 9) / 4)
  );
  const sugarTarget = Math.min(50, Math.round((calorieTarget * 0.1) / 4));

  return { calorieTarget, proteinTarget, fatTarget, carbTarget, sugarTarget };
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

module.exports = { parseFoodText, getLoadingMessage, processEntry, calculateCalorieGoals };
