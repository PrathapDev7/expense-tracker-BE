/**
 * Loads the exercise animations into the exerciseanimations collection.
 *
 * The same work runs automatically on boot when the collection is missing or
 * stale, so this exists for the cases boot cannot cover: reconciling on demand
 * after regenerating the catalog, or loading a host without restarting the API.
 * It is safe to re-run — unchanged rows are skipped without being rewritten,
 * changed rows are replaced, and retired rows are removed.
 *
 * Usage: npm run seedAnimations
 */
const mongoose = require('mongoose');

const {seedAnimationsIfNeeded, resolveSource} = require('../services/animationCatalog');

require('dotenv').config();

async function runSeeder() {
    try {
        mongoose.set('strictQuery', false);
        await mongoose.connect(process.env.MONGO_URL, {useNewUrlParser: true, useUnifiedTopology: true});
        console.log('Connected to MongoDB.');
        console.log(`Reading ${resolveSource() || '(no catalog found)'}`);

        // Routed through the boot path rather than seedCatalog directly so the
        // completion marker is written by the one place that knows how — a CLI
        // run that skipped it would leave every subsequent boot re-seeding.
        // force, because being asked explicitly outranks the up-to-date check.
        const totals = await seedAnimationsIfNeeded({
            force: true,
            // Reported per batch because a cold seed takes minutes: without it
            // there is no way to tell a slow run from a hung one.
            onProgress: ({read, inserted, updated, unchanged}) => {
                process.stdout.write(`\r  read ${read} | new ${inserted} | updated ${updated} | unchanged ${unchanged}   `);
            },
        });

        process.stdout.write('\n');

        if (totals.skipped) {
            console.log(`Nothing to do: ${totals.skipped}.`);
        } else {
            console.log(`Done. read ${totals.read}, new ${totals.inserted}, updated ${totals.updated}, unchanged ${totals.unchanged}, removed ${totals.removed}, rejected ${totals.rejected}`);
        }

        await mongoose.connection.close();
        console.log('Seeder completed. Database connection closed.');

        // A rejected entry means the catalog on disk is short or damaged, which is
        // worth a non-zero exit so a deploy step running this does not sail past it.
        if (totals.failed || totals.skipped === 'source file missing') process.exit(1);
    } catch (err) {
        console.error('Error running the seeder:', err);
        await mongoose.connection.close();
        process.exit(1);
    }
}

runSeeder();
