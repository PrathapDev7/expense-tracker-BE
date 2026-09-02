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

    // Deliberately not awaited: a cold animation seed takes seconds against a
    // local mongod and minutes against Atlas, and the API has no reason to stay
    // down while it runs. Every route that needs the catalog reads it from Mongo,
    // so the worst an early request sees is a short catalog, not a crash.
    const {startAnimationSeeder} = require('../services/animationCatalog');
    startAnimationSeeder();

    // Same reasoning, and it waits for the catalog on its own: the metadata is
    // derived from the exercise names, so it has nothing to annotate until the
    // rows exist. Editing services/exerciseTaxonomy changes the rules hash,
    // which is what makes the next boot rewrite every row without anyone having
    // to run a script.
    const {startMetadataSeeder} = require('../services/exerciseMetadata');
    startMetadataSeeder();
};

module.exports = {db};
