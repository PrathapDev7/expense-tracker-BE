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

const ACTIVITY_LABELS = {
  sedentary: 'sedentary (little to no exercise)',
  light: 'lightly active (light exercise 1-3 days/week)',
  moderate: 'moderately active (moderate exercise 3-5 days/week)',
  active: 'active (hard exercise 6-7 days/week)',
  very_active: 'very active (athlete / physical job)',
};

const GOAL_LABELS = {
  lose: 'lose weight (moderate calorie deficit)',
  maintain: 'maintain current weight',
  gain: 'gain weight / build muscle (lean calorie surplus)',
};

// Derives daily nutrition targets from a person's stats. Delegates the
// arithmetic to the LLM but pins it to the standard Mifflin-St Jeor +
// activity-multiplier method so results stay consistent and explainable.
async function calculateCalorieGoals({ age, gender, heightCm, weightKg, activityLevel, goal }) {
  const response = await client.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages: [
      {
        role: 'system',
        content: `You are a certified nutrition coach calculating daily nutrition targets for a client.

Method — follow these steps exactly:
1. BMR via Mifflin-St Jeor:
   - Male: BMR = 10*weightKg + 6.25*heightCm - 5*age + 5
   - Female: BMR = 10*weightKg + 6.25*heightCm - 5*age - 161
   - Other: average of the male and female formulas
2. TDEE = BMR * activity multiplier (sedentary=1.2, light=1.375, moderate=1.55, active=1.725, very_active=1.9)
3. calorieTarget: TDEE adjusted for goal (lose: TDEE-500, maintain: TDEE, gain: TDEE+350), minimum 1200
4. proteinTarget (g) = 1.6 * weightKg
5. fatTarget (g) = 25% of calorieTarget / 9
6. carbTarget (g) = remaining calories after protein+fat / 4
7. sugarTarget (g) = 10% of calorieTarget / 4, capped at 50

CRITICAL: Return ONLY a valid JSON object. NO markdown, NO code blocks, NO explanation text.
Return this exact structure:
{ "calorieTarget": <int>, "proteinTarget": <int>, "fatTarget": <int>, "carbTarget": <int>, "sugarTarget": <int> }`,
      },
      {
        role: 'user',
        content: `Age: ${age}, Gender: ${gender}, Height: ${heightCm}cm, Weight: ${weightKg}kg, Activity level: ${ACTIVITY_LABELS[activityLevel] || activityLevel}, Goal: ${GOAL_LABELS[goal] || goal}`,
      },
    ],
    temperature: 0.2,
    max_tokens: 200,
  });

  const text = response.choices[0].message.content;

  let cleanText = text;
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    cleanText = codeBlockMatch[1].trim();
  }

  const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`No JSON found in Groq response: ${cleanText.substring(0, 200)}`);
  }
  const parsed = JSON.parse(jsonMatch[0]);

  const clamp = (value, fallback, min = 0) => {
    const n = Math.round(Number(value));
    return Number.isFinite(n) && n >= min ? n : fallback;
  };

  return {
    calorieTarget: clamp(parsed.calorieTarget, 2000, 1200),
    proteinTarget: clamp(parsed.proteinTarget, 100),
    fatTarget: clamp(parsed.fatTarget, 80),
    carbTarget: clamp(parsed.carbTarget, 200),
    sugarTarget: clamp(parsed.sugarTarget, 50),
  };
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
