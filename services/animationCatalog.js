const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const zlib = require('zlib');

const mongoose = require('mongoose');

const ExerciseAnimationSchema = require('../models/ExerciseAnimationModel');

const SOURCE_FILE = path.join(__dirname, '..', 'Seeders', 'data', 'vfe_animation_index_lottie.json');

// The source is written one complete JSON entry per line, so it can be read with
// constant memory. Parsing the whole array instead costs 527 MB of heap and dies
// outright under a 512 MB limit.
const BATCH_SIZE = 100;

// Level 9 costs ~2s more than the default across the whole catalog and buys 1.5%.
// Worth it for a one-time write that every read benefits from.
const GZIP_LEVEL = 9;

// Where the "has this been seeded, and by whom, and did it finish" marker lives.
// A plain driver collection rather than a model: it holds exactly one document
// and nothing else in the app has any reason to know it exists.
const STATE_COLLECTION = 'seedstates';
const STATE_ID = 'vfe-animations';

// How long a claimed-but-unfinished seed is believed before another instance may
// take it over. Long enough to cover a slow cold seed against Atlas, short enough
// that a crashed process does not block re-seeding until the next redeploy.
const STALE_CLAIM_MS = 15 * 60 * 1000;

// How many times boot re-checks after finding the work already claimed. Bounded
// so a source file that can never be loaded does not re-read 92 MB forever.
const SEED_RETRY_LIMIT = 3;

const stateCollection = () => mongoose.connection.db.collection(STATE_COLLECTION);

/**
 * Turns one index entry into a storable document, or null if its composition is
 * not usable. Returning null rather than throwing keeps a single bad row from
 * failing the whole seed, but the caller must treat a non-zero reject count as a
 * failed seed — a partially loaded catalog that reports success is the exact
 * failure this dataset has already suffered once.
 */
const toDocument = (entry, now) => {
    const composition = entry && entry.lottie;

    if (!composition || typeof composition.v !== 'string') return null;
    if (!Array.isArray(composition.layers) || composition.layers.length === 0) return null;
    if (!(composition.w > 0 && composition.h > 0)) return null;
    if (!(composition.fr > 0) || !(composition.op > composition.ip)) return null;
    if (!entry.path || !entry.name) return null;

    const json = JSON.stringify(composition);

    return {
        _id: entry.path,
        name: entry.name,
        gender: entry.gender,
        equipment: entry.equipment,
        muscle: entry.muscle,
        file: entry.file,
        width: composition.w,
        height: composition.h,
        frameRate: composition.fr,
        inPoint: composition.ip,
        outPoint: composition.op,
        durationMs: Math.round(((composition.op - composition.ip) / composition.fr) * 1000),
        composition: zlib.gzipSync(json, {level: GZIP_LEVEL}),
        sha256: crypto.createHash('sha256').update(json).digest('hex'),
        // Written by hand because inserting through the driver bypasses the
        // schema, and with it mongoose's timestamps.
        createdAt: now,
        updatedAt: now,
    };
};

/**
 * Writes one batch, treating duplicate keys as success.
 *
 * With ordered:false the driver writes every document it can and then rejects
 * with the collected errors, so a duplicate _id — another instance got there
 * first, or an earlier run was interrupted after writing it — is the resumable
 * case, not a failure. Anything else is real and must not be swallowed.
 */
const insertBatch = async (batch) => {
    try {
        const result = await ExerciseAnimationSchema.collection.insertMany(batch, {ordered: false});
        return {inserted: result.insertedCount, duplicates: 0};
    } catch (error) {
        const writeErrors = error.writeErrors || [];
        const duplicates = writeErrors.filter((writeError) => (writeError.err || writeError).code === 11000);

        if (!writeErrors.length || duplicates.length !== writeErrors.length) throw error;

        return {inserted: error.result ? error.result.insertedCount : 0, duplicates: duplicates.length};
    }
};

/**
 * Streams the source file into the collection. Safe to run against a partially
 * populated collection: rows already present are rejected on _id and counted as
 * duplicates rather than rewritten.
 */
const seedCatalog = async ({onProgress} = {}) => {
    const now = new Date();
    const input = fs.createReadStream(SOURCE_FILE, {encoding: 'utf8'});
    const lines = readline.createInterface({input, crlfDelay: Infinity});

    let batch = [];
    const totals = {read: 0, inserted: 0, duplicates: 0, rejected: 0};

    const flush = async () => {
        if (!batch.length) return;
        const {inserted, duplicates} = await insertBatch(batch);
        totals.inserted += inserted;
        totals.duplicates += duplicates;
        batch = [];
        if (onProgress) onProgress(totals);
    };

    try {
        for await (const rawLine of lines) {
            // The array's own punctuation: "[" opens it, "]" closes it, and every
            // entry but the last carries a trailing comma.
            const line = rawLine.trim().replace(/,$/, '');
            if (line === '' || line === '[' || line === ']') continue;

            totals.read += 1;

            let entry;
            try {
                entry = JSON.parse(line);
            } catch (error) {
                totals.rejected += 1;
                continue;
            }

            const document = toDocument(entry, now);
            if (!document) {
                totals.rejected += 1;
                continue;
            }

            batch.push(document);
            if (batch.length >= BATCH_SIZE) await flush();
        }

        await flush();
    } finally {
        lines.close();
        input.destroy();
    }

    return totals;
};

/**
 * Claims the right to seed, atomically.
 *
 * The filter deliberately does not match a claim that is both running and fresh,
 * so when another instance holds one the upsert falls through to inserting a
 * second document with the same _id and Mongo rejects it. That duplicate key IS
 * the "someone else is doing it" signal — no transaction needed, which matters
 * because a standalone mongod cannot run them.
 */
const claim = async () => {
    const now = new Date();

    try {
        await stateCollection().findOneAndUpdate(
            {
                _id: STATE_ID,
                $or: [
                    {completedAt: {$ne: null}},
                    {startedAt: {$lt: new Date(now.getTime() - STALE_CLAIM_MS)}},
                ],
            },
            {$set: {startedAt: now, completedAt: null, host: os.hostname()}},
            {upsert: true, returnDocument: 'after'},
        );
        return true;
    } catch (error) {
        if (error.code === 11000) return false;
        throw error;
    }
};

/**
 * Whether the catalog is present AND complete. A row count alone cannot tell a
 * finished seed from one that died two thirds of the way through, so the marker
 * is written only after the last batch lands — marker-present therefore implies
 * every row it claims actually made it.
 */
const isSeeded = async () => {
    const marker = await stateCollection().findOne({_id: STATE_ID});
    if (!marker || !marker.completedAt) return false;

    // A regenerated catalog can swap exercises without moving the row count --
    // 40 retired, 40 added, still 1603 -- so counting alone would call a stale
    // collection complete. The source size shifts whenever the catalog really
    // changes and, unlike mtime, does not churn when the same bytes are fetched
    // again. A deployed host has no source file; there the count is all there is.
    if (fs.existsSync(SOURCE_FILE) && marker.sourceSize !== fs.statSync(SOURCE_FILE).size) return false;

    const live = await ExerciseAnimationSchema.countDocuments();
    return live > 0 && live === marker.count;
};

/**
 * Boot entry point. Seeds only when the catalog is missing or incomplete, and
 * never throws into the caller — a catalog that failed to load is a degraded
 * feature, not a reason to take the whole API down.
 */
const seedAnimationsIfNeeded = async () => {
    if (await isSeeded()) return {skipped: 'already seeded'};

    if (!fs.existsSync(SOURCE_FILE)) {
        // The expected case on a deployed host: the source file is not in git.
        console.warn(`[animations] not seeded — source missing at ${path.relative(process.cwd(), SOURCE_FILE)}`);
        console.warn('[animations] run "npm run fetchVfeLottie" to regenerate it, then "npm run seedAnimations"');
        return {skipped: 'source file missing'};
    }

    if (!(await claim())) return {skipped: 'another instance is seeding'};

    console.log('[animations] seeding catalog...');
    const totals = await seedCatalog();

    if (totals.rejected > 0) {
        // Leaves the claim uncompleted on purpose, so a short catalog is never
        // recorded as finished. The claim is still fresh, so the next boot waits
        // out STALE_CLAIM_MS before retrying — deliberate, since a crash-looping
        // container would otherwise re-read the whole source file every restart.
        // Once the source is repaired, "npm run seedAnimations" loads it at once.
        console.error(`[animations] seed incomplete: ${totals.rejected} of ${totals.read} entries unusable`);
        return {failed: true, ...totals};
    }

    const stored = await ExerciseAnimationSchema.countDocuments();
    await stateCollection().updateOne(
        {_id: STATE_ID},
        {$set: {completedAt: new Date(), count: stored, expected: totals.read, sourceSize: fs.statSync(SOURCE_FILE).size}},
    );

    console.log(`[animations] seeded ${stored} animations (${totals.inserted} new, ${totals.duplicates} already present)`);
    return {...totals, stored};
};

/**
 * Boot hook: runs the seed, and re-checks later if it could not run.
 *
 * A process that dies mid-seed leaves its claim behind, and boot is the only
 * trigger -- so the instance that takes over would skip once and then sit on a
 * half-loaded catalog until somebody restarted it. That is the ordinary path on
 * a rolling deploy, not the unlucky one. Re-checks are spaced by the stale
 * window, which is the soonest an abandoned claim can be taken over.
 */
const startAnimationSeeder = (attempt = 0) => {
    seedAnimationsIfNeeded()
        .then((result) => {
            const settled = result.stored !== undefined
                || result.skipped === 'already seeded'
                || result.skipped === 'source file missing';
            if (settled) return;

            if (attempt >= SEED_RETRY_LIMIT) {
                console.warn(`[animations] catalog still incomplete after ${SEED_RETRY_LIMIT} retries -- run "npm run seedAnimations"`);
                return;
            }

            // unref so a pending re-check never holds the process open by itself.
            setTimeout(() => startAnimationSeeder(attempt + 1), STALE_CLAIM_MS).unref();
        })
        .catch((error) => console.log('Animation Seed Error', error));
};

module.exports = {SOURCE_FILE, seedCatalog, seedAnimationsIfNeeded, startAnimationSeeder, isSeeded};
