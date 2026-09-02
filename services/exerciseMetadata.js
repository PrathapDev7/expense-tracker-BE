/**
 * Writes the derived exercise metadata -- fine muscles and written instructions
 * -- onto every row of the animation catalog.
 *
 * There is no source file to seed from. The rules in services/exerciseTaxonomy
 * are the source, so this reads the catalog, runs each row through classify(),
 * and writes back what comes out. That has one consequence worth stating: the
 * seed is a function of committed code, which means the deploy that changes the
 * rules is also the deploy that reseeds. Nobody has to remember to run
 * anything.
 *
 * The mechanism is a hash of the rule file, stamped onto every row it wrote.
 * Boot asks how many rows are missing the current hash; if the answer is zero
 * there is nothing to do. Editing a rule changes the hash and every row is
 * stale at once; adding animations to the catalog leaves the new rows with no
 * hash at all, which the same query finds. Both cases converge on their own.
 *
 * Concurrency is handled the way services/animationCatalog handles it, and for
 * the same reason: several instances boot at once on a rolling deploy, and Mongo
 * here is standalone so there are no transactions to lean on. The claim is a
 * conditional upsert on a marker document, and the duplicate-key collision that
 * a losing racer gets back is the signal that somebody else has it.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const mongoose = require('mongoose');

const ExerciseAnimationSchema = require('../models/ExerciseAnimationModel');
const {classify} = require('./exerciseTaxonomy');

const RULES_FILE = path.join(__dirname, 'exerciseTaxonomy.js');

// Same collection as the animation seed, different document. One place to look
// to answer "what has this database been seeded with".
const STATE_COLLECTION = 'seedstates';
const STATE_ID = 'exercise-metadata';

const STALE_CLAIM_MS = 15 * 60 * 1000;
const SEED_RETRY_LIMIT = 3;

// On a cold database the catalog seed is still running when this one first
// looks, and it can take minutes against Atlas. Waiting out the full stale
// window before looking again would leave the app without instructions for a
// quarter of an hour after a fresh deploy, so a not-ready-yet result is retried
// on a much shorter timer than a genuine failure.
const CATALOG_WAIT_MS = 30 * 1000;
const CATALOG_WAIT_LIMIT = 40;

// bulkWrite payload size. These are small updates -- a few short strings each --
// so the batch can be much larger than the animation seed's 100.
const BATCH_SIZE = 500;

const stateCollection = () => mongoose.connection.db.collection(STATE_COLLECTION);

/**
 * The identity of the current rules: a hash of the file that defines them.
 *
 * Hashing the file rather than versioning it by hand because a hand-maintained
 * number is a step somebody forgets, and the failure is silent -- edited rules
 * that never reach the database. Computed once per process; the file cannot
 * change under a running node.
 */
let cachedVersion = null;

const rulesVersion = () => {
    if (cachedVersion) return cachedVersion;

    cachedVersion = crypto
        .createHash('sha256')
        .update(fs.readFileSync(RULES_FILE))
        .digest('hex')
        .slice(0, 16);

    return cachedVersion;
};

/**
 * Claims the right to run, or reports that somebody else already has it.
 *
 * The filter matches only a marker that is finished or whose claim has gone
 * stale, so a live claim matches nothing and the upsert then collides on _id.
 * That collision -- error 11000 -- is the answer, not a failure: it is how a
 * losing racer learns it lost without a transaction.
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

// Backdating startedAt rather than deleting the marker: the document keeps its
// history, and any claim test reads it as long expired.
const releaseClaim = async () => {
    try {
        await stateCollection().updateOne({_id: STATE_ID}, {$set: {startedAt: new Date(0)}});
    } catch (error) {
        console.warn('[exercise-meta] could not release the seed claim', error.message);
    }
};

/** How many catalog rows are not carrying the current rules. */
const staleCount = (version) => ExerciseAnimationSchema.countDocuments({
    metadataVersion: {$ne: version},
});

/**
 * Runs the rules over every row that needs them.
 *
 * Only stale rows are read, so the ordinary case after a rules change is a full
 * pass and the ordinary case after adding a handful of animations is a pass over
 * that handful. The cursor is projected down to the three fields classify()
 * reads -- the composition is select:false already, but name/muscle/equipment is
 * a fraction of even the remaining metadata.
 */
const applyRules = async ({version, onProgress}) => {
    const totals = {read: 0, written: 0, unmatched: 0};
    const unmatchedNames = new Set();

    let operations = [];

    const flush = async () => {
        if (!operations.length) return;
        await ExerciseAnimationSchema.bulkWrite(operations, {ordered: false});
        totals.written += operations.length;
        operations = [];
        if (onProgress) onProgress(totals);
    };

    const cursor = ExerciseAnimationSchema
        .find({metadataVersion: {$ne: version}})
        .select('name muscle equipment')
        .lean()
        .cursor();

    for await (const row of cursor) {
        totals.read += 1;

        const derived = classify(row);

        if (!derived.matched) {
            totals.unmatched += 1;
            unmatchedNames.add(row.name);
        }

        operations.push({
            updateOne: {
                filter: {_id: row._id},
                update: {$set: {
                    primaryMuscle: derived.primaryMuscle,
                    secondaryMuscles: derived.secondaryMuscles,
                    instructions: derived.instructions,
                    metadataVersion: version,
                }},
            },
        });

        if (operations.length >= BATCH_SIZE) await flush();
    }

    await flush();

    return {...totals, unmatchedNames: [...unmatchedNames]};
};

/** Whether every row already carries the current rules. */
const isSeeded = async () => {
    const version = rulesVersion();
    const total = await ExerciseAnimationSchema.countDocuments();

    // An empty catalog is not "done" -- it is the animation seed not having run
    // yet, which is a different thing and must not be recorded as complete.
    if (total === 0) return false;

    return (await staleCount(version)) === 0;
};

/**
 * Boot entry point. Does nothing when the metadata is already current.
 *
 * force skips only the up-to-date check, not the claim, so the route and the CLI
 * can reconcile on demand without racing a booting instance.
 */
const seedMetadataIfNeeded = async ({force = false, onProgress} = {}) => {
    const version = rulesVersion();
    const total = await ExerciseAnimationSchema.countDocuments();

    if (total === 0) {
        // Not an error. On a cold database the animation seed is still loading
        // and there is simply nothing to annotate yet.
        return {skipped: 'catalog not seeded yet', version};
    }

    if (!force && (await staleCount(version)) === 0) {
        return {skipped: 'already seeded', version, count: total};
    }

    if (!(await claim())) return {skipped: 'another instance is seeding', version};

    const pending = force ? total : await staleCount(version);
    console.log(`[exercise-meta] applying rules ${version} to ${pending} of ${total} exercises...`);

    let totals;
    try {
        // force means every row, not just the stale ones, so the version is
        // cleared first and the same query then selects the whole catalog.
        if (force) {
            await ExerciseAnimationSchema.updateMany({}, {$unset: {metadataVersion: ''}});
        }

        totals = await applyRules({version, onProgress});
    } catch (error) {
        // Hand the lease back before surfacing so a peer can take over now,
        // rather than waiting out a stale window for a process that has already
        // given up.
        await releaseClaim();
        throw error;
    }

    const remaining = await staleCount(version);

    if (remaining > 0) {
        console.error(`[exercise-meta] incomplete: ${remaining} of ${total} exercises still unannotated`);
        await releaseClaim();
        return {failed: true, ...totals, remaining, version};
    }

    // Unmatched rows are not a failure -- they get generic but correct
    // instructions and their coarse muscle -- but they are the signal that the
    // rules need a new entry, so they are named rather than counted. Silence
    // here would mean shipping vague text and never finding out.
    if (totals.unmatched > 0) {
        console.warn(`[exercise-meta] ${totals.unmatched} exercises matched no rule and fell back to generic text:`);
        totals.unmatchedNames.slice(0, 25).forEach((name) => console.warn(`  - ${name}`));
        if (totals.unmatchedNames.length > 25) {
            console.warn(`  ... and ${totals.unmatchedNames.length - 25} more`);
        }
    }

    await stateCollection().updateOne(
        {_id: STATE_ID},
        {$set: {
            completedAt: new Date(),
            rulesVersion: version,
            count: totals.written,
            catalogCount: total,
            unmatched: totals.unmatched,
        }},
    );

    console.log(`[exercise-meta] annotated ${totals.written} exercises with rules ${version}`);
    return {...totals, version, catalogCount: total};
};

/**
 * Boot hook: runs the pass, and re-checks later if it could not.
 *
 * Two different waits are in here on purpose. "The catalog is not loaded yet" is
 * the ordinary first-boot path and resolves in seconds to minutes, so it polls.
 * "Somebody else holds the claim" or "it threw" is the abandoned-claim path,
 * and the soonest that can be taken over is the stale window, so waiting less
 * would just burn queries.
 */
const startMetadataSeeder = (attempt = 0, waits = 0) => {
    const retryAfter = (delay, nextAttempt, nextWaits) => {
        // unref so a pending re-check never holds the process open by itself.
        setTimeout(() => startMetadataSeeder(nextAttempt, nextWaits), delay).unref();
    };

    const retry = () => {
        if (attempt >= SEED_RETRY_LIMIT) {
            console.warn(`[exercise-meta] still incomplete after ${SEED_RETRY_LIMIT} retries -- run "npm run seedExerciseMetadata"`);
            return;
        }
        retryAfter(STALE_CLAIM_MS, attempt + 1, waits);
    };

    const waitForCatalog = () => {
        if (waits >= CATALOG_WAIT_LIMIT) {
            console.warn('[exercise-meta] gave up waiting for the animation catalog to finish seeding');
            return;
        }
        retryAfter(CATALOG_WAIT_MS, attempt, waits + 1);
    };

    seedMetadataIfNeeded()
        .then((result) => {
            if (result.skipped === 'catalog not seeded yet') return waitForCatalog();

            const settled = (result.written !== undefined && !result.failed)
                || result.skipped === 'already seeded';
            if (!settled) retry();
        })
        .catch((error) => {
            console.error('[exercise-meta] seed error', error);
            retry();
        });
};

module.exports = {
    STATE_ID,
    rulesVersion,
    isSeeded,
    seedMetadataIfNeeded,
    startMetadataSeeder,
};
