const mongoose = require('mongoose');

const db = async () => {
    try {
        mongoose.set('strictQuery', false);
        await mongoose.connect(process.env.MONGO_URL);
        console.log('Db Connected');
        const UserModel = require('../models/UserModel');
        await UserModel.syncIndexes();

        // Deliberately not awaited: a cold animation seed takes minutes, and the
        // API has no reason to stay down while it runs. Every route that needs the
        // catalog reads it from Mongo, so the worst case for an early request is a
        // short catalog, not a crash. Errors are caught here because nothing is
        // awaiting this promise to catch them for us.
        const {seedAnimationsIfNeeded} = require('../services/animationCatalog');
        seedAnimationsIfNeeded().catch((error) => console.log('Animation Seed Error', error));
    } catch (error) {
        console.log('DB Connection Error', error);
    }
};

module.exports = {db};
