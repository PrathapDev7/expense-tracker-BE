const os = require('os');

const mongoose = require('mongoose');

const Exercise = require('../models/ExerciseModel');
const {readCatalog} = require('../Seeders/exerciseCatalog');

const STATE_COLLECTION = 'seedstates';
const STATE_ID = 'exercises-csv-v1';

// The old animation collection, dropped exactly once by the migration below.
// Named, not discovered: the drop must hit the Lottie rows and nothing else.
const LEGACY_COLLECTION = 'exerciseanimations';

const STALE_CLAIM_MS = 15 * 60 * 1000;
const SEED_RETRY_LIMIT = 3;

const stateCollection = () => mongoose.connection.db.collection(STATE_COLLECTION);

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

const releaseClaim = async () => {
    try {
        await stateCollection().updateOne({_id: STATE_ID}, {$set: {startedAt: new Date(0)}});
    } catch (error) {
        console.warn('[exercises] could not release the seed claim', error.message);
    }
};

/**
 * One-time migration: drops the legacy Lottie collection and loads the CSV
 * catalog with gif paths in its place. Runs at most once per database -- the
 * marker is written only after the last batch lands, so a crash before that
 * retries from scratch on the next boot. Later catalog edits are a manual
 * `npm run seedExercises`; boot must not rewrite user-visible data on its own.
 */
const migrateOnce = async () => {
    if (!(await claim())) return {skipped: 'another instance is seeding'};

    let totals;
    try {
        totals = await seedCatalog({source: 'boot-migration'});
    } catch (error) {
        await releaseClaim();
        throw error;
    }

    if (totals.failed) {
        await releaseClaim();
        return {failed: true, ...totals};
    }

    await stateCollection().updateOne(
        {_id: STATE_ID},
        {$set: {completedAt: new Date(), count: totals.stored, expected: totals.read}},
    );

    return totals;
};

const isMigrated = async () => {
    const marker = await stateCollection().findOne({_id: STATE_ID});
    if (!marker || !marker.completedAt) return false;
    if (marker.count !== marker.expected) return false;

    const live = await Exercise.countDocuments();
    return live > 0 && live === marker.count;
};

/**
 * Loads the CSV catalog, replacing whatever is there. A replace rather than
 * an upsert: the old rows key by catalog path and the new ones by CSV id
 * share no key, so anything short of a wipe leaves the Lottie rows behind.
 */
const seedCatalog = async ({source} = {}) => {
    const {records, withoutGif} = readCatalog();

    if (!records.length) throw new Error('Exercise CSV parsed to zero rows -- refusing to wipe the collection.');

    const legacy = await mongoose.connection.db.listCollections({name: LEGACY_COLLECTION}).toArray();
    if (legacy.length) {
        await mongoose.connection.db.collection(LEGACY_COLLECTION).drop();
        console.log(`[exercises] dropped legacy collection ${LEGACY_COLLECTION} (${source || 'manual'})`);
    }

    await Exercise.collection.deleteMany({});

    const BATCH = 500;
    for (let i = 0; i < records.length; i += BATCH) {
        await Exercise.collection.insertMany(records.slice(i, i + BATCH), {ordered: false});
    }

    const stored = await Exercise.countDocuments();
    const failed = stored !== records.length;

    if (failed) {
        console.error(`[exercises] seed incomplete: ${stored} of ${records.length} rows stored`);
    } else {
        console.log(`[exercises] seeded ${stored} exercises (${withoutGif} without a gif)`);
    }

    return {read: records.length, stored, withoutGif, failed};
};

const seedExercisesIfNeeded = async ({force = false} = {}) => {
    if (!force && await isMigrated()) return {skipped: 'already seeded'};

    const result = await migrateOnce();
    if (!result.failed && !result.skipped) {
        console.log(`[exercises] migrated ${result.stored} exercises (${result.withoutGif} without a gif)`);
    }
    return result;
};

const startExerciseSeeder = (attempt = 0) => {
    const retry = () => {
        if (attempt >= SEED_RETRY_LIMIT) {
            console.warn('[exercises] catalog still incomplete after retries -- run "npm run seedExercises"');
            return;
        }
        setTimeout(() => startExerciseSeeder(attempt + 1), STALE_CLAIM_MS).unref();
    };

    seedExercisesIfNeeded()
        .then((result) => {
            if (result.stored === undefined && result.skipped !== 'already seeded') retry();
        })
        .catch((error) => {
            console.error('[exercises] seed error', error);
            retry();
        });
};

module.exports = {seedCatalog, seedExercisesIfNeeded, startExerciseSeeder, isMigrated};
