const mongoose = require('mongoose');
const ExpenseSchema = require("../models/ExpenseModel");

require('dotenv').config();

async function runSeeder() {
    try {
        mongoose.set('strictQuery', false);
        await mongoose.connect(process.env.MONGO_URL, {useNewUrlParser: true, useUnifiedTopology: true});
        console.log('Connected to MongoDB.');

        await ExpenseSchema.updateMany({}, {$set: {type: 'self'}});

        await mongoose.connection.close();
        console.log('Seeder completed. Database connection closed.');
    } catch (err) {
        console.error('Error running the seeder:', err);
        await mongoose.connection.close();
        process.exit(1);
    }
}

runSeeder();
