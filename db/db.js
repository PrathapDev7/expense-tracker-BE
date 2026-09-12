const mongoose = require('mongoose');

const db = async () => {
    try {
        mongoose.set('strictQuery', false);
        await mongoose.connect(process.env.MONGO_URL);
        console.log('Db Connected');
    } catch (error) {
        console.log('DB Connection Error', error);
        return;
    }

    // Index health and connection health are different facts. Sharing one catch
    // means a conflicting index definition takes the animation seed down with it
    // and blames the database, which is fine, for a problem it did not cause.
    try {
        const UserModel = require('../models/UserModel');
        await UserModel.syncIndexes();
    } catch (error) {
        console.log('User Index Sync Error', error);
    }

    // One-time migration: drops the legacy Lottie collection and loads the CSV
    // catalog with gif paths. Guarded by a marker so it runs at most once per
    // database; later CSV edits are a manual `npm run seedExercises`.
    const {startExerciseSeeder} = require('../services/exerciseCatalog');
    startExerciseSeeder();
};

module.exports = {db};
