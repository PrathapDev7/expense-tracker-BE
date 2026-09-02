/**
 * Loads the VFE exercise animations into the exerciseanimations collection.
 *
 * The same work runs automatically on boot when the collection is empty, so
 * this exists for the cases boot cannot cover: reseeding after a wipe, or
 * loading a fresh host without restarting the API. It is safe to re-run —
 * rows already present are skipped, not rewritten.
 *
 * Usage: npm run seedAnimations
 */
const mongoose = require('mongoose');

const {seedCatalog, SOURCE_FILE} = require('../services/animationCatalog');

require('dotenv').config();

async function runSeeder() {
    try {
        mongoose.set('strictQuery', false);
        await mongoose.connect(process.env.MONGO_URL, {useNewUrlParser: true, useUnifiedTopology: true});
        console.log('Connected to MongoDB.');
        console.log(`Reading ${SOURCE_FILE}`);

        // Reported per batch because a cold seed takes minutes: without it there
        // is no way to tell a slow run from a hung one.
        const totals = await seedCatalog({
            onProgress: ({read, inserted, duplicates}) => {
                process.stdout.write(`\r  read ${read} | inserted ${inserted} | already present ${duplicates}   `);
            },
        });

        process.stdout.write('\n');
        console.log(`Done. read ${totals.read}, inserted ${totals.inserted}, already present ${totals.duplicates}, rejected ${totals.rejected}`);

        await mongoose.connection.close();
        console.log('Seeder completed. Database connection closed.');

        // A rejected entry means the catalog on disk is short or damaged, which is
        // worth a non-zero exit so a deploy step running this does not sail past it.
        if (totals.rejected > 0) process.exit(1);
    } catch (err) {
        console.error('Error running the seeder:', err);
        await mongoose.connection.close();
        process.exit(1);
    }
}

runSeeder();
