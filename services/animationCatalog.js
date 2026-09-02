const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const zlib = require('zlib');

const mongoose = require('mongoose');

const ExerciseAnimationSchema = require('../models/ExerciseAnimationModel');

const DATA_DIR = path.join(__dirname, '..', 'Seeders', 'data');

// The catalog ships as a gzipped file because the raw JSON is 92 MB -- too big
// for git, and the whole point of committing it is that a deployed host can
// seed itself with no network and no manual step. The raw form is kept as a
// candidate so a developer who has just re-fetched can seed without packing.
const SOURCE_CANDIDATES = [
    path.join(DATA_DIR, 'exercise_animations.json.gz'),
    path.join(DATA_DIR, 'exercise_animations.json'),
];

/**
 * Picks the catalog to seed from: whichever candidate exists, most recent
 * first. Newest-wins rather than a fixed preference because both directions
 * happen -- "npm run fetchAnimations" freshens the raw file, "git pull"
 * freshens the archive -- and either one being stale is a silent wrong-data
 * bug. Returns null on a host that has neither.
 */
const resolveSource = () => SOURCE_CANDIDATES
    .filter((candidate) => fs.existsSync(candidate))
    .map((candidate) => ({file: candidate, mtime: fs.statSync(candidate).mtimeMs}))
    .sort((a, b) => b.mtime - a.mtime)
    .map((candidate) => candidate.file)[0] || null;

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
const STATE_ID = 'exercise-animations';

// How long a claimed-but-unfinished seed is believed before another instance may
// take it over. Long enough to cover a slow cold seed against Atlas, short enough
// that a crashed process does not block re-seeding until the next redeploy.
const STALE_CLAIM_MS = 15 * 60 * 1000;

// How many times boot re-checks after finding the work already claimed. Bounded
// so a source file that can never be loaded does not re-read 92 MB forever.
const SEED_RETRY_LIMIT = 3;

const stateCollection = () => mongoose.connection.db.collection(STATE_COLLECTION);

const openSource = (file) => (file.endsWith('.gz')
    ? fs.createReadStream(file).pipe(zlib.createGunzip())
    : fs.createReadStream(file, {encoding: 'utf8'}));

/**
 * Describes one index entry, or returns null if its composition is not usable.
 *
 * Deliberately stops short of compressing: the gzip is by far the most
 * expensive thing done per row, and a re-seed skips most rows on the strength
 * of the hash alone. Returning null rather than throwing keeps a single bad row
 * from failing the whole seed, but the caller must treat a non-zero reject
 * count as a failed seed -- a partially loaded catalog that reports success is
 * the exact failure this dataset has already suffered once.
 */
const describe = (entry) => {
    const composition = entry && entry.lottie;

    if (!composition || typeof composition.v !== 'string') return null;
    if (!Array.isArray(composition.layers) || composition.layers.length === 0) return null;
    if (!(composition.w > 0 && composition.h > 0)) return null;
    if (!(composition.fr > 0) || !(composition.op > composition.ip)) return null;
    if (!entry.path || !entry.name) return null;

    const json = JSON.stringify(composition);

    return {
        _id: entry.path,
        json,
        sha256: crypto.createHash('sha256').update(json).digest('hex'),
        fields: {
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
        },
    };
};

/**
 * Turns a described row into the upsert that stores it.
 *
 * An upsert rather than an insert because a re-seed has to be able to REPLACE a
 * row, not just skip it: when an exercise is re-rendered upstream its path stays
 * the same, so an insert-only writer silently keeps serving the old animation
 * forever. createdAt is set only on insert so a repair does not rewrite history.
 */
const toUpsert = (described, now) => ({
    updateOne: {
        filter: {_id: described._id},
        update: {
            $set: {
                ...described.fields,
                composition: zlib.gzipSync(described.json, {level: GZIP_LEVEL}),
                sha256: described.sha256,
                // Written by hand because writing through the driver bypasses
                // the schema, and with it mongoose's timestamps.
                updatedAt: now,
            },
            $setOnInsert: {createdAt: now},
        },
        upsert: true,
    },
});

/**
 * Writes one batch of upserts, tolerating a duplicate key.
 *
 * An upsert can still collide on _id when two instances race the same row --
 * both miss on the filter, both try to insert. That is the resumable case, not
 * a failure. Anything else is real and must not be swallowed.
 */
const writeBatch = async (batch) => {
    try {
        const result = await ExerciseAnimationSchema.collection.bulkWrite(batch, {ordered: false});
        return {inserted: result.upsertedCount, updated: result.modifiedCount};
    } catch (error) {
        const writeErrors = error.writeErrors || [];
        const duplicates = writeErrors.filter((writeError) => (writeError.err || writeError).code === 11000);

        if (!writeErrors.length || duplicates.length !== writeErrors.length) throw error;

        const result = error.result || {};
        return {
            inserted: typeof result.upsertedCount === 'number' ? result.upsertedCount : 0,
            updated: typeof result.modifiedCount === 'number' ? result.modifiedCount : 0,
        };
    }
};

/**
 * Streams the source file into the collection, reconciling rather than merely
 * filling: a row whose composition changed upstream is rewritten, and a row the
 * catalog no longer lists is removed. Safe to run against a partially populated
 * collection, and cheap to re-run against a complete one.
 */
const seedCatalog = async ({onProgress, sourceFile} = {}) => {
    const file = sourceFile || resolveSource();
    if (!file) throw new Error('No animation catalog found in Seeders/data');

    const now = new Date();

    // What is already stored, by hash. ~1603 rows of {_id, sha256} is about
    // 200 KB, which buys the ability to skip a row without compressing it or
    // sending it -- the difference between a no-op re-seed costing a read and
    // costing 14 MB of uploads to collect duplicate-key errors.
    const stored = new Map();
    const cursor = ExerciseAnimationSchema.collection.find({}, {projection: {sha256: 1}});
    for await (const row of cursor) stored.set(row._id, row.sha256);

    const input = openSource(file);
    const lines = readline.createInterface({input, crlfDelay: Infinity});

    let batch = [];
    const seen = new Set();
    const totals = {read: 0, inserted: 0, updated: 0, unchanged: 0, removed: 0, rejected: 0};

    const flush = async () => {
        if (!batch.length) return;
        const {inserted, updated} = await writeBatch(batch);
        totals.inserted += inserted;
        totals.updated += updated;
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

            const described = describe(entry);
            if (!described) {
                totals.rejected += 1;
                continue;
            }

            seen.add(described._id);

            // The hash is the whole reason a re-seed is cheap: an unchanged row
            // costs a stringify and a sha, not a level-9 gzip and a round trip.
            if (stored.get(described._id) === described.sha256) {
                totals.unchanged += 1;
                continue;
            }

            batch.push(toUpsert(described, now));

            if (batch.length >= BATCH_SIZE) {
                // readline reads ahead while a flush is in flight. Against a
                // local mongod that is free; against Atlas, where every batch
                // waits on a majority ack, it buffers hundreds of parsed
                // compositions and takes peak RSS from 62 MB to 385 MB.
                lines.pause();
                try {
                    await flush();
                } finally {
                    lines.resume();
                }
            }
        }

        await flush();

        // Rows the catalog no longer lists. Guarded on a clean read: a stream
        // that died halfway looks exactly like a catalog that dropped half its
        // exercises, and this is the one operation that cannot be undone.
        if (totals.rejected === 0 && totals.read > 0) {
            const retired = [...stored.keys()].filter((id) => !seen.has(id));
            if (retired.length) {
                const result = await ExerciseAnimationSchema.collection.deleteMany({_id: {$in: retired}});
                totals.removed = result.deletedCount;
            }
        }
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
 * Hands a claim back after a failed seed.
 *
 * Without this the failing instance keeps a fresh lease it has already given up
 * on, and every peer's claim() returns false for the full stale window. Backing
 * startedAt up to the epoch makes the claim instantly takeable instead.
 */
const releaseClaim = async () => {
    try {
        await stateCollection().updateOne({_id: STATE_ID}, {$set: {startedAt: new Date(0)}});
    } catch (error) {
        console.warn('[animations] could not release the seed claim', error.message);
    }
};

/**
 * Whether the catalog is present AND complete.
 *
 * The marker is written only after the last batch lands, so marker-present
 * implies every row it claims actually made it. count and expected are compared
 * because count alone is written from the live count and so could never
 * disagree with it -- expected is the number of rows the source actually held.
 */
const isSeeded = async () => {
    const marker = await stateCollection().findOne({_id: STATE_ID});
    if (!marker || !marker.completedAt) return false;
    if (marker.count !== marker.expected) return false;

    // A regenerated catalog can swap exercises without moving the row count --
    // 40 retired, 40 added, still 1603 -- so counting alone would call a stale
    // collection complete. The source size shifts whenever the catalog really
    // changes and, unlike mtime, does not churn when the same bytes are fetched
    // again. A host with no catalog at all has only the count to go on.
    const source = resolveSource();
    if (source && marker.sourceSize !== fs.statSync(source).size) return false;

    const live = await ExerciseAnimationSchema.countDocuments();
    return live > 0 && live === marker.count;
};

/**
 * Boot entry point. Seeds only when the catalog is missing, incomplete or stale,
 * and never resolves a failure as success — a catalog that failed to load is a
 * degraded feature, not a reason to take the whole API down, but it must not be
 * recorded as done either.
 *
 * force skips only the up-to-date check, not the claim -- the CLI uses it to
 * reconcile on demand without racing a booting instance.
 */
const seedAnimationsIfNeeded = async ({force = false, onProgress} = {}) => {
    if (!force && await isSeeded()) return {skipped: 'already seeded'};

    const source = resolveSource();
    if (!source) {
        // Should not happen on a deployed host: the compressed catalog is
        // committed. If it is missing, the checkout is incomplete.
        console.warn(`[animations] not seeded — no catalog found in ${path.relative(process.cwd(), DATA_DIR)}`);
        console.warn('[animations] expected the committed exercise_animations.json.gz -- this checkout is incomplete; restore it and restart');
        return {skipped: 'source file missing'};
    }

    if (!(await claim())) return {skipped: 'another instance is seeding'};

    console.log(`[animations] seeding catalog from ${path.basename(source)}...`);

    let totals;
    try {
        totals = await seedCatalog({sourceFile: source, onProgress});
    } catch (error) {
        // Give the lease back before surfacing: a peer can then take over at
        // once instead of waiting out a stale window on behalf of a process
        // that is not going to finish.
        await releaseClaim();
        throw error;
    }

    const stored = await ExerciseAnimationSchema.countDocuments();

    if (totals.rejected > 0 || stored !== totals.read) {
        // Never record a short catalog as finished. The claim goes back so the
        // next boot -- or a peer -- can retry immediately rather than sitting on
        // a half-loaded catalog for the full stale window.
        console.error(`[animations] seed incomplete: ${totals.rejected} of ${totals.read} entries unusable, ${stored} rows stored`);
        await releaseClaim();
        return {failed: true, ...totals, stored};
    }

    await stateCollection().updateOne(
        {_id: STATE_ID},
        {$set: {completedAt: new Date(), count: stored, expected: totals.read, source: path.basename(source), sourceSize: fs.statSync(source).size}},
    );

    console.log(`[animations] seeded ${stored} animations (${totals.inserted} new, ${totals.updated} updated, ${totals.unchanged} unchanged, ${totals.removed} removed)`);
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
    const retry = () => {
        if (attempt >= SEED_RETRY_LIMIT) {
            console.warn(`[animations] catalog still incomplete after ${SEED_RETRY_LIMIT} retries -- run "npm run seedAnimations"`);
            return;
        }
        // unref so a pending re-check never holds the process open by itself.
        setTimeout(() => startAnimationSeeder(attempt + 1), STALE_CLAIM_MS).unref();
    };

    seedAnimationsIfNeeded()
        .then((result) => {
            const settled = (result.stored !== undefined && !result.failed)
                || result.skipped === 'already seeded'
                || result.skipped === 'source file missing';
            if (!settled) retry();
        })
        // A thrown seed is the case retry exists for -- a dropped socket partway
        // through a multi-minute Atlas load. Scheduling only from .then would
        // leave exactly that failure with no second attempt.
        .catch((error) => {
            console.error('[animations] seed error', error);
            retry();
        });
};

module.exports = {
    DATA_DIR,
    resolveSource,
    seedCatalog,
    seedAnimationsIfNeeded,
    startAnimationSeeder,
    isSeeded,
};
