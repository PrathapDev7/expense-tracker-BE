/**
 * Writes the fine muscle taxonomy and the written instructions onto every row of
 * the exercise catalog.
 *
 * The same work runs automatically on boot whenever the rules in
 * services/exerciseTaxonomy change, so this exists for the cases boot cannot
 * cover: reconciling on demand after editing the rules, or annotating a host
 * without restarting the API. Safe to re-run -- it derives everything from the
 * exercise name, so the result is the same every time.
 *
 * Usage: npm run seedExerciseMetadata
 */
const mongoose = require('mongoose');

const {seedMetadataIfNeeded, rulesVersion} = require('../services/exerciseMetadata');

require('dotenv').config();

async function runSeeder() {
    try {
        mongoose.set('strictQuery', false);
        await mongoose.connect(process.env.MONGO_URL, {useNewUrlParser: true, useUnifiedTopology: true});
        console.log('Connected to MongoDB.');
        console.log(`Rules version ${rulesVersion()}`);

        // Routed through the boot path rather than the rules directly so the
        // completion marker is written by the one place that knows how -- a CLI
        // run that skipped it would leave every subsequent boot re-seeding.
        const totals = await seedMetadataIfNeeded({
            force: true,
            onProgress: ({read, written, unmatched}) => {
                process.stdout.write(`\r  read ${read} | written ${written} | unmatched ${unmatched}   `);
            },
        });

        process.stdout.write('\n');

        if (totals.skipped) {
            console.log(`Nothing to do: ${totals.skipped}.`);
        } else {
            console.log(`Done. read ${totals.read}, written ${totals.written}, unmatched ${totals.unmatched}`);
        }

        await mongoose.connection.close();
        console.log('Seeder completed. Database connection closed.');

        // A short pass means rows are still unannotated, which is worth a
        // non-zero exit so a deploy step running this does not sail past it. An
        // empty catalog is the same story: nothing was annotated because there
        // was nothing there, and that is not success.
        if (totals.failed || totals.skipped === 'catalog not seeded yet') process.exit(1);
    } catch (err) {
        console.error('Error running the seeder:', err);
        await mongoose.connection.close();
        process.exit(1);
    }
}

runSeeder();
