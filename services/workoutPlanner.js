const Exercise = require('../models/ExerciseModel');
const {chatCompletionWithFallback} = require('./aiModels');

/**
 * "Build me a routine": turns a short brief into a week of routines, then
 * pins every exercise it names to a real catalog entry.
 *
 * The model is asked for exercise *names*, not ids -- the catalog is 1,324
 * rows and will not fit in a prompt, and a model asked to echo ids invents
 * them. Matching happens here instead, against the same catalog the picker
 * lists, so a generated routine carries the target muscle, the gif and the
 * instructions a hand-picked one does.
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
- Rest: the brief's default rest between sets applies to every exercise unless a lift genuinely needs otherwise (heavier compounds get longer, isolation shorter). Prefer the default.
- Honour every constraint in the brief, including injuries and dislikes. When earlier instructions conflict with a later change request, the later one wins but the earlier ones still apply wherever they do not conflict.`;

/* ------------------------------------------------------------ generation -- */

function briefToText(brief = {}) {
    const lines = [];
    if (brief.days) lines.push(`Training days per week: ${brief.days}`);
    if (brief.goal) lines.push(`Goal: ${brief.goal}`);
    if (brief.level) lines.push(`Experience: ${brief.level}`);
    if (brief.equipment) lines.push(`Equipment available: ${brief.equipment}`);
    if (brief.minutes) lines.push(`Session length: about ${brief.minutes} minutes`);
    if (brief.defaultRestSec !== undefined) {
        lines.push(`Default rest between sets: ${brief.defaultRestSec} seconds — use this for every exercise unless a lift genuinely needs otherwise`);
    }
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
    const defaultRest = clamp(brief.defaultRestSec, 0, 600, 90);
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
                        restSec: exercise.restSec === undefined || exercise.restSec === null
                            ? defaultRest
                            : clamp(exercise.restSec, 0, 600, defaultRest),
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

    const rows = await Exercise.aggregate([
        {$sort: {name: 1}},
        {$project: {
            _id: 0,
            catalogId: '$_id',
            name: 1,
            muscle: '$target',
            equipment: 1,
            primaryMuscle: '$target',
            instructions: 1,
            gif: 1,
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
                gif: match?.gif,
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
 *
 * `history` is every instruction so far — the brief's notes first, then each
 * change request in order. The latest change is sent as the request; the rest
 * travel as earlier instructions so nothing the user said is forgotten.
 */
async function buildPlan({brief, current, request, history}) {
    const prior = Array.isArray(history)
        ? history.map((line) => String(line || '').trim()).filter(Boolean)
        : [];
    const latest = String(request || '').trim();

    const messages = [
        {role: 'system', content: SYSTEM_PROMPT},
        {role: 'user', content: briefToText(brief)},
    ];

    if (current && latest) {
        const earlier = prior.filter((line) => line !== latest);
        if (earlier.length) {
            messages.push({
                role: 'user',
                content: `Earlier instructions (still apply unless this change overrides them):\n${earlier.map((line, i) => `${i + 1}. ${line}`).join('\n')}`,
            });
        }
        messages.push({role: 'assistant', content: JSON.stringify(current)});
        messages.push({
            role: 'user',
            content: `Change request: ${latest}\n\nReturn the complete updated plan as JSON in the same shape, keeping everything the request does not touch.`,
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

/**
 * "Update with AI": refines the routines a plan already has instead of writing
 * a fresh week. The stored builder conversation (brief + history) travels back
 * in as context, the plan on screen is what gets edited, and the change
 * request says what to do differently.
 *
 * Unlike [buildPlan], there is no day count to hit and no session length to
 * fit — the week keeps its shape and only what the request touches changes.
 */
const REFINE_SYSTEM_PROMPT = `You are an experienced strength coach editing one person's existing training week.

CRITICAL: reply with ONE raw JSON object. No markdown, no code fences, no commentary.

Shape:
{
  "summary": "<one sentence, max 14 words, describing what changed>",
  "routines": [
    {
      "name": "<keep the existing day name unless the request renames it>",
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
- Keep the same routines in the same order unless the request adds, removes or renames one. Never rewrite the whole week unasked.
- Keep every exercise, its sets, reps and rest exactly as they are unless the request touches them.
- Use exercise names as they are commonly written in a gym. Never invent names, never add brand names, never number them.
- Respect the stored context: injuries, dislikes and equipment from the original conversation still apply.
- When the request conflicts with earlier instructions, the request wins but the earlier ones still apply wherever they do not conflict.`;

/** A stored builder brief back into prose, so it reads as context. */
function storedBriefToText(brief = {}) {
    const lines = [];
    if (brief.goal) lines.push(`Goal: ${brief.goal}`);
    if (brief.level) lines.push(`Experience: ${brief.level}`);
    if (brief.equipment) lines.push(`Equipment available: ${brief.equipment}`);
    if (brief.minutes) lines.push(`Session length: about ${brief.minutes} minutes`);
    if (brief.defaultRestSec !== undefined) {
        lines.push(`Default rest between sets: ${brief.defaultRestSec} seconds`);
    }
    if (brief.notes) lines.push(`Also: ${brief.notes}`);
    return lines.join('\n');
}

/** A saved routine back into the compact shape the model already speaks. */
function routineToCompact(routine = {}) {
    return {
        name: routine.name || '',
        focus: '',
        exercises: (Array.isArray(routine.exercises) ? routine.exercises : [])
            .filter((exercise) => exercise && exercise.name)
            .map((exercise) => {
                const sets = Array.isArray(exercise.sets) ? exercise.sets : [];
                const first = sets[0] || {};
                const compact = {
                    name: exercise.name,
                    muscle: exercise.primaryMuscle || exercise.muscle || '',
                    equipment: exercise.equipment || '',
                    sets: sets.length || 3,
                };
                if (first.durationSec) compact.seconds = first.durationSec;
                else if (first.reps) compact.reps = first.reps;
                if (exercise.restBetweenSetsSec !== undefined) {
                    compact.restSec = exercise.restBetweenSetsSec;
                }
                return compact;
            }),
    };
}

async function refinePlan({routines, brief, history, request}) {
    const current = (Array.isArray(routines) ? routines : [])
        .map(routineToCompact)
        .filter((routine) => routine.exercises.length);
    if (!current.length) throw new Error('There is nothing to refine yet');

    const prior = Array.isArray(history)
        ? history.map((line) => String(line || '').trim()).filter(Boolean)
        : [];
    const latest = String(request || '').trim();
    if (!latest) throw new Error('A change request is required');

    const stored = storedBriefToText(brief || {});
    const messages = [{role: 'system', content: REFINE_SYSTEM_PROMPT}];
    if (stored) {
        messages.push({
            role: 'user',
            content: `Original context (still applies unless the change overrides it):\n${stored}`,
        });
    }
    const earlier = prior.filter((line) => line !== latest);
    if (earlier.length) {
        messages.push({
            role: 'user',
            content: `Earlier instructions (still apply unless this change overrides them):\n${earlier.map((line, i) => `${i + 1}. ${line}`).join('\n')}`,
        });
    }
    messages.push({role: 'assistant', content: JSON.stringify({routines: current})});
    messages.push({
        role: 'user',
        content: `Change request: ${latest}\n\nReturn the complete updated plan as JSON in the same shape, keeping everything the request does not touch.`,
    });

    const {text} = await chatCompletionWithFallback({
        messages,
        temperature: 0.4,
        max_tokens: 3000,
    });

    // No day count to enforce on a refine, and the default rest falls back to
    // whatever the stored brief asked for.
    const plan = normalise(extractJson(text), {days: current.length, defaultRestSec: brief?.defaultRestSec});
    if (!plan.routines.length) throw new Error('The planner returned no routines');

    return decorate(plan);
}

module.exports = {buildPlan, refinePlan};
