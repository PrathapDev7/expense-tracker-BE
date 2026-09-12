const mongoose = require('mongoose');

const exerciseSchema = new mongoose.Schema({
    // The CSV id, e.g. '0001' -- unique across the catalog, stable across
    // reseeds, and the gif filename without its extension. Using it as _id
    // makes the uniqueness guard the one index Mongo always has, so a seed
    // that races another instance still cannot write a duplicate.
    _id: {
        type: String,
        trim: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    bodyPart: {
        type: String,
        required: true,
        trim: true,
    },
    equipment: {
        type: String,
        required: true,
        trim: true,
    },
    target: {
        type: String,
        required: true,
        trim: true,
    },
    secondaryMuscles: {
        type: [String],
        default: [],
    },
    instructions: {
        type: [String],
        default: [],
    },
    // Public URL path of the demo gif, e.g. '/exercise-gifs/0001.gif', served
    // statically by the API. Null when the catalog has no asset for this id.
    gif: {
        type: String,
        trim: true,
        default: null,
    },
    hasGif: {
        type: Boolean,
        default: false,
    },
}, {timestamps: true});

exerciseSchema.index({name: 1});
exerciseSchema.index({bodyPart: 1, equipment: 1, target: 1});
exerciseSchema.index({target: 1});

module.exports = mongoose.model('Exercise', exerciseSchema);
