const mongoose = require('mongoose');

// An exercise the user typed in themselves, for anything the seeded catalog does
// not cover. Its own collection rather than an embedded copy inside each plan so
// that adding it once makes it available in every plan's picker.
const customExerciseSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
        maxLength: 120,
    },
    // Free text rather than an enum: the catalog's own muscle values are coarse
    // ("ARMS and SHOULDERS", "UPPER BODY"), so pinning users to that vocabulary
    // would be pinning them to its rough edges.
    muscle: {
        type: String,
        trim: true,
    },
    equipment: {
        type: String,
        trim: true,
    },
}, {timestamps: true});

// One name per user. Case-insensitive so "Farmer Carry" and "farmer carry" do
// not both end up in the picker.
customExerciseSchema.index(
    {user: 1, name: 1},
    {unique: true, collation: {locale: 'en', strength: 2}},
);

module.exports = mongoose.model('CustomExercise', customExerciseSchema);
