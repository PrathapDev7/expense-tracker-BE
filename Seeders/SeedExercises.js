/**
 * Loads the CSV exercise catalog into the exercises collection.
 *
 * The same work runs automatically on boot exactly once (dropping the legacy
 * Lottie collection), so this exists for the cases boot cannot cover:
 * reloading after editing the CSV, or loading a host without restarting the
 * API. Safe to re-run -- it replaces the collection wholesale.
 *
 * Usage: npm run seedExercises
 */
const mongoose = require('mongoose');

const {seedCatalog} = require('../services/exerciseCatalog');

require('dotenv').config();

async function runSeeder() {
    try {
        mongoose.set('strictQuery', false);
        await mongoose.connect(process.env.MONGO_URL, {useNewUrlParser: true, useUnifiedTopology: true});
        console.log('Connected to MongoDB.');

        const totals = await seedCatalog({source: 'manual'});

        console.log(`Done. read ${totals.read}, stored ${totals.stored}, without gif ${totals.withoutGif}`);

        await mongoose.connection.close();
        console.log('Seeder completed. Database connection closed.');

        if (totals.failed) process.exit(1);
    } catch (err) {
        console.error('Error running the seeder:', err);
        await mongoose.connection.close();
        process.exit(1);
    }
}

runSeeder();
