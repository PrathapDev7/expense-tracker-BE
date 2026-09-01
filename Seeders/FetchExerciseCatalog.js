/**
 * Fetches the public exercise catalog from myworkoutplan.app and writes it to
 * Seeders/data/exercises.json for review before it is inserted into the DB.
 *
 * The site is a Next.js app that server-renders the whole catalog into its RSC
 * flight payload, so the full list arrives in a single request - there is no
 * paginated API to walk.
 *
 * Usage: npm run fetchExercises
 */

const fs = require('fs');
const path = require('path');

const SOURCE_URL = 'https://www.myworkoutplan.app/workout-builder';
const OUT_DIR = path.join(__dirname, 'data');
const OUT_FILE = path.join(OUT_DIR, 'exercises.json');
const BACKSLASH = String.fromCharCode(92);

/**
 * Rebuilds the RSC flight payload by concatenating every self.__next_f.push
 * chunk embedded in the page.
 */
function readFlightPayload(html) {
    const marker = 'self.__next_f.push([1,';
    let payload = '';
    let cursor = 0;

    while ((cursor = html.indexOf(marker, cursor)) !== -1) {
        const start = cursor + marker.length;
        if (html[start] !== '"') {
            cursor = start;
            continue;
        }

        // Walk to the end of the JSON string literal, skipping escaped chars.
        let end = start + 1;
        while (end < html.length) {
            if (html[end] === BACKSLASH) {
                end += 2;
                continue;
            }
            if (html[end] === '"') break;
            end++;
        }

        payload += JSON.parse(html.slice(start, end + 1));
        cursor = end;
    }

    return payload;
}

/**
 * Extracts the dehydrated react-query array holding the catalog by matching
 * brackets from the start of the array, ignoring anything inside strings.
 */
function readCatalogArray(payload) {
    const anchor = payload.indexOf('"data":[{"id":"');
    if (anchor === -1) {
        throw new Error('Could not locate the exercise array - the page structure has changed.');
    }

    const start = anchor + '"data":'.length;
    let depth = 0;
    let inString = false;

    for (let i = start; i < payload.length; i++) {
        const char = payload[i];

        if (inString) {
            if (char === BACKSLASH) i++;
            else if (char === '"') inString = false;
            continue;
        }

        if (char === '"') inString = true;
        else if (char === '[') depth++;
        else if (char === ']') {
            depth--;
            if (depth === 0) return JSON.parse(payload.slice(start, i + 1));
        }
    }

    throw new Error('Exercise array was never closed - the page structure has changed.');
}

/**
 * Normalises a source record into the shape we intend to store.
 * The source `id` becomes `sourceId`: Mongoose exposes its own `id` virtual,
 * so keeping the catalog id under that name would collide with it.
 */
function normalise(exercise) {
    return {
        sourceId: exercise.id,
        name: exercise.name,
        muscle: exercise.muscle,
        equipment: exercise.equipment,
        isStretch: Boolean(exercise.isStretch),
        photoUrl: exercise.PhotoUrl,
        instructions: Array.isArray(exercise.notes) ? exercise.notes : [],
    };
}

async function fetchCatalog() {
    try {
        console.log('Fetching', SOURCE_URL);
        const response = await fetch(SOURCE_URL, {
            headers: {'User-Agent': 'Mozilla/5.0 (compatible; wealthify-catalog-import/1.0)'},
        });

        if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
        }

        const html = await response.text();
        const exercises = readCatalogArray(readFlightPayload(html)).map(normalise);

        if (!exercises.length) {
            throw new Error('Parsed zero exercises - refusing to overwrite the existing file.');
        }

        const duplicates = exercises.length - new Set(exercises.map((e) => e.sourceId)).size;
        if (duplicates > 0) {
            console.warn(`Warning: ${duplicates} duplicate sourceId values in the source data.`);
        }

        fs.mkdirSync(OUT_DIR, {recursive: true});
        fs.writeFileSync(OUT_FILE, JSON.stringify(exercises, null, 2));

        const tally = (field) => Object.entries(
            exercises.reduce((acc, e) => ({...acc, [e[field]]: (acc[e[field]] || 0) + 1}), {})
        ).sort((a, b) => b[1] - a[1]);

        console.log(`\nWrote ${exercises.length} exercises to ${path.relative(process.cwd(), OUT_FILE)}`);
        console.log(`Muscles (${tally('muscle').length}):`, tally('muscle').map(([k, v]) => `${k}:${v}`).join(', '));
        console.log(`Equipment (${tally('equipment').length}):`, tally('equipment').map(([k, v]) => `${k}:${v}`).join(', '));
        console.log(`Stretches: ${exercises.filter((e) => e.isStretch).length}`);
        console.log(`With instructions: ${exercises.filter((e) => e.instructions.length).length}`);
        console.log(`With photo: ${exercises.filter((e) => e.photoUrl).length}`);
    } catch (err) {
        console.error('Error fetching the exercise catalog:', err.message);
        process.exit(1);
    }
}

fetchCatalog();
