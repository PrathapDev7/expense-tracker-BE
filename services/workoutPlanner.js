const ExerciseAnimationSchema = require('../models/ExerciseAnimationModel');
const {chatCompletionWithFallback} = require('./aiModels');

/**
 * "Build me a routine": turns a short brief into a week of routines, then
 * pins every exercise it names to a real catalog entry.
 *
 * The model is asked for exercise *names*, not ids -- the catalog is 1,603
 * rows and will not fit in a prompt, and a model asked to echo ids invents
 * them. Matching happens here instead, against the same grouped view the
 * picker lists, so a generated routine carries the animation, the fine muscle
 * and the instructions a hand-picked one does.
 */

const SYSTEM_PROMPT = `You are an experienced strength coach writing a training week for one person.

CRITICAL: reply with ONE raw JSON object. No markdown, no code fences, no commentary.

Shape:
{
  "summary": "<one sentence, max 14 words, describing the week>",
  "routines": [
    {
      "name": "<short day name, 1-3 words, e.g. Push A, Legs, Upper Body>",
      "focus": "<2-4 words naming what it trains>",
      "exercises": [
        {
          "name": "<widely used gym exercise name>",
          "muscle": "<the main muscle worked>",
          "equipment": "<barbell | dumbbell | machine | cable | bodyweight | kettlebell | band>",
          "sets": <2-5>,
          "reps": <4-20, omit for a timed hold>,
          "seconds": <10-120, only for a timed hold such as a plank>,
          "restSec": <30-180>
        }
      ]
    }
  ]
}

Rules:
- Produce exactly as many routines as the training days asked for.
- 4 to 7 exercises per routine, compound movements first, isolation after.
- Use exercise names as they are commonly written in a gym ("Barbell Bench Press", "Lat Pulldown", "Romanian Deadlift"). Never invent names, never add brand names, never number them.
- Respect the equipment available. Bodyweight briefs must not name a barbell or machine.
- Respect the session length: roughly 6 minutes per exercise including rest.
- Balance the week: nothing trains the same muscle hard on back-to-back days.
- Heavier compounds get longer rest (120-180s), isolation shorter (45-90s).
- Honour every constraint in the brief, including injuries and dislikes.`;

/* ------------------------------------------------------------ generation -- */

function briefToText(brief = {}) {
    const lines = [];
    if (brief.days) lines.push(`Training days per week: ${brief.days}`);
    if (brief.goal) lines.push(`Goal: ${brief.goal}`);
    if (brief.level) lines.push(`Experience: ${brief.level}`);
    if (brief.equipment) lines.push(`Equipment available: ${brief.equipment}`);
    if (brief.minutes) lines.push(`Session length: about ${brief.minutes} minutes`);
    if (brief.notes) lines.push(`Also: ${brief.notes}`);
    return lines.length ? lines.join('\n') : 'Build a balanced 3-day full-body week for a beginner in a full gym.';
}

function extractJson(text) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const body = fenced ? fenced[1].trim() : text;
    const match = body.match(/\{[\s\S]*\}/);
    if (!match) {
        throw new Error(`No JSON in planner response: ${body.slice(0, 200)}`);
    }
    return JSON.parse(match[0]);
}

const clamp = (value, min, max, fallback) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, Math.round(number)));
};

/**
 * Squeezes whatever the model returned into the shape the app can render.
 * Small models drop a field or overshoot a count now and then, and a routine
 * with a missing rep count is worth fixing rather than refusing.
 */
function normalise(parsed, brief = {}) {
    const wantedDays = clamp(brief.days, 1, 7, 0);
    const routines = (Array.isArray(parsed.routines) ? parsed.routines : [])
        .filter((routine) => routine && Array.isArray(routine.exercises) && routine.exercises.length)
        .slice(0, wantedDays || 7)
        .map((routine, index) => ({
            name: String(routine.name || `Day ${index + 1}`).trim().slice(0, 60),
            focus: String(routine.focus || '').trim().slice(0, 60),
            exercises: routine.exercises
                .filter((exercise) => exercise && exercise.name)
                .slice(0, 8)
                .map((exercise) => {
                    const seconds = exercise.seconds ? clamp(exercise.seconds, 5, 600, 30) : null;
                    return {
                        name: String(exercise.name).trim().slice(0, 120),
                        muscle: String(exercise.muscle || '').trim(),
                        equipment: String(exercise.equipment || '').trim(),
                        sets: clamp(exercise.sets, 1, 8, 3),
                        reps: seconds ? null : clamp(exercise.reps, 1, 50, 10),
                        seconds,
                        restSec: clamp(exercise.restSec, 0, 600, 90),
                    };
                }),
        }));

    return {
        summary: String(parsed.summary || '').trim().slice(0, 200),
        routines,
    };
}

/* -------------------------------------------------------- catalog match -- */

const normaliseName = (value) => String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Words that say nothing about which movement this is, so they should not pull
// two different exercises together or apart.
const STOP_WORDS = new Set(['the', 'a', 'with', 'and', 'on', 'to', 'up', 'exercise', 'variation']);

const tokenise = (value) => {
    const words = normaliseName(value)
        .split(' ')
        .filter((word) => word && !STOP_WORDS.has(word))
        // Crude singularisation: "curls" and "curl" are the same movement.
        .map((word) => (word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word));
    return new Set(words);
};

let cache = null;

/** The grouped catalog, held for a minute — it only changes on a re-seed. */
async function catalogIndex() {
    if (cache && Date.now() - cache.at < 60_000) return cache.rows;

    const rows = await ExerciseAnimationSchema.aggregate([
        {$sort: {name: 1, muscle: 1, equipment: 1, gender: 1}},
        {$group: {
            _id: {name: '$name', muscle: '$muscle', equipment: '$equipment'},
            catalogId: {$first: '$_id'},
            primaryMuscle: {$first: '$primaryMuscle'},
            instructions: {$first: '$instructions'},
        }},
        {$project: {
            _id: 0,
            catalogId: 1,
            primaryMuscle: 1,
            instructions: 1,
            name: '$_id.name',
            muscle: '$_id.muscle',
            equipment: '$_id.equipment',
        }},
    ]);

    const indexed = rows.map((row) => ({
        ...row,
        key: normaliseName(row.name),
        tokens: tokenise(row.name),
    }));

    cache = {rows: indexed, at: Date.now()};
    return indexed;
}

/**
 * The closest catalog row to a name the model wrote, or null when nothing is
 * close enough. An unmatched exercise is still added -- it just renders the
 * fallback icon instead of an animation, exactly like a custom one.
 */
function bestMatch(index, wanted, equipment) {
    const key = normaliseName(wanted);
    const tokens = tokenise(wanted);
    if (!tokens.size) return null;

    const wantedEquipment = normaliseName(equipment);
    let best = null;
    let bestScore = 0;

    for (const row of index) {
        let score;
        if (row.key === key) {
            score = 1;
        } else {
            let shared = 0;
            tokens.forEach((token) => {
                if (row.tokens.has(token)) shared += 1;
            });
            if (!shared) continue;
            const union = new Set([...tokens, ...row.tokens]).size;
            score = shared / union;
        }

        // A tie between "Bench Press (barbell)" and "Bench Press (machine)" goes
        // to whichever kit the brief actually has.
        if (wantedEquipment && normaliseName(row.equipment) === wantedEquipment) {
            score += 0.15;
        }

        if (score > bestScore) {
            bestScore = score;
            best = row;
        }
    }

    return bestScore >= 0.5 ? best : null;
}

// The app's own swatches. Colouring by muscle rather than by day makes a
// routine scannable: every pull movement carries the same stripe.
const SWATCHES = ['#5CC98E', '#4F9DFF', '#F0A94B', '#FF5C5C', '#B57BFF', '#22D3EE', '#F472B6'];

function swatchFor(muscle) {
    const key = normaliseName(muscle);
    if (!key) return SWATCHES[0];
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) % 997;
    return SWATCHES[hash % SWATCHES.length];
}

/**
 * Turns the model's exercises into routine documents: catalog ids where a name
 * matched, the planned sets expanded, and the instructions copied in the way
 * the picker copies them.
 */
async function decorate(plan) {
    const index = await catalogIndex();

    const routines = plan.routines.map((routine) => ({
        ...routine,
        exercises: routine.exercises.map((exercise) => {
            const match = bestMatch(index, exercise.name, exercise.equipment);
            const primaryMuscle = match?.primaryMuscle || exercise.muscle || '';
            const instructions = match?.instructions || [];

            return {
                catalogId: match?.catalogId,
                name: match?.name || exercise.name,
                muscle: match?.muscle || '',
                primaryMuscle,
                equipment: match?.equipment || exercise.equipment || '',
                mode: exercise.seconds ? 'time' : 'weights',
                weightUnit: 'kg',
                restBetweenSetsSec: exercise.restSec,
                color: swatchFor(primaryMuscle),
                notes: instructions.map((step, i) => `${i + 1}. ${step}`).join('\n'),
                sets: Array.from({length: exercise.sets}, () => (exercise.seconds
                    ? {durationSec: exercise.seconds}
                    : {reps: exercise.reps})),
                // Shown in the preview so the user knows which rows will animate.
                matched: Boolean(match),
                setCount: exercise.sets,
                reps: exercise.reps,
                seconds: exercise.seconds,
            };
        }),
    }));

    return {...plan, routines};
}

/**
 * One turn of the builder: the first call carries only the brief, and every
 * "actually, make it shorter" carries the plan on screen plus the change, so
 * the model edits rather than starts over.
 */
async function buildPlan({brief, current, request}) {
    const messages = [
        {role: 'system', content: SYSTEM_PROMPT},
        {role: 'user', content: briefToText(brief)},
    ];

    if (current && request) {
        messages.push({role: 'assistant', content: JSON.stringify(current)});
        messages.push({
            role: 'user',
            content: `Change request: ${request}\n\nReturn the complete updated plan as JSON in the same shape, keeping everything the request does not touch.`,
        });
    }

    const {text} = await chatCompletionWithFallback({
        messages,
        temperature: 0.4,
        max_tokens: 3000,
    });

    const plan = normalise(extractJson(text), brief);
    if (!plan.routines.length) throw new Error('The planner returned no routines');

    return decorate(plan);
}

module.exports = {buildPlan};
