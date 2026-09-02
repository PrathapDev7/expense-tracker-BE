const mongoose = require('mongoose');

const exerciseAnimationSchema = new mongoose.Schema({
    // The catalog path is the natural key — exercise names are not unique (534 of
    // the 1603 entries share a name with another one). Using it as _id also makes
    // the uniqueness guard the one index Mongo always has and never has to build,
    // so a seed that starts before syncIndexes() has finished still cannot write a
    // duplicate. That is what makes a concurrent boot-time seed safe here.
    _id: {
        type: String,
        trim: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    gender: {
        type: String,
        required: true,
        enum: ['Men', 'Women'],
    },
    equipment: {
        type: String,
        required: true,
        trim: true,
    },
    muscle: {
        type: String,
        required: true,
        trim: true,
    },
    file: {
        type: String,
        trim: true,
    },
    // Lifted out of the composition so a list screen can size its box without
    // downloading the payload. Canvas size is not constant across the catalog —
    // 1100x1100, 1300x1100, 1100x1300 and 1300x1300 all occur — and assuming one
    // of them letterboxes every animation that is shaped differently.
    width: {
        type: Number,
        required: true,
    },
    height: {
        type: Number,
        required: true,
    },
    // Frame rate is 24 for all but five compositions, which run at 120. Anything
    // deriving a duration from raw frame numbers needs the real value.
    frameRate: {
        type: Number,
        required: true,
    },
    inPoint: {
        type: Number,
        required: true,
    },
    outPoint: {
        type: Number,
        required: true,
    },
    // Precomputed because durations span 1.0s to 14.6s: a fixed controller
    // duration would speed up or crawl depending on which exercise is showing.
    durationMs: {
        type: Number,
        required: true,
    },
    // The Bodymovin document, gzipped. Opaque to Mongo on purpose: stored as a
    // nested document the catalog is 137 MB of BSON, because Lottie is millions
    // of two-character keys and 8-byte doubles — the worst case for BSON and the
    // best case for gzip. Compressed it is 13.5 MB, and the API can stream it
    // straight to the client under Content-Encoding: gzip without ever parsing it.
    // Nothing queries inside a composition, so there is nothing to give up.
    composition: {
        type: Buffer,
        required: true,
        // Default-excluded so a forgotten projection cannot dump the catalog into
        // a list response. Callers that want it must ask by name.
        select: false,
    },
    // Of the uncompressed composition, so a re-seed can tell "already stored" from
    // "stored differently". This dataset has already been silently corrupted once
    // in this repo, so a row count alone is not evidence the catalog is intact.
    sha256: {
        type: String,
        required: true,
    },

    /* --------------------------------------------------- derived, not shipped */

    // The catalog's own `muscle` is one of ten coarse values -- ARMS covers every
    // curl, pushdown and wrist curl alike -- which is enough to filter a dropdown
    // and not enough to label an exercise or draw a chart worth reading. These
    // three are derived from the exercise name by services/exerciseTaxonomy and
    // written by services/exerciseMetadata. `muscle` stays exactly as it was
    // because the animation endpoints filter on it.
    //
    // Not required: they are absent on a freshly seeded row until the metadata
    // pass runs, and a row without them is still a usable animation.
    primaryMuscle: {
        type: String,
        trim: true,
    },
    secondaryMuscles: {
        type: [String],
        default: [],
    },
    // Numbered steps for the exercise sheet and the notes field, in order.
    instructions: {
        type: [String],
        default: [],
    },
    // The hash of the rule file that produced the three fields above. This is
    // what makes the metadata pass idempotent and self-updating: editing the
    // rules changes the hash, and every row still carrying the old one is
    // rewritten on the next boot. Rows added to the catalog later have no
    // version at all, so they are picked up by the same query.
    metadataVersion: {
        type: String,
    },
}, {timestamps: true, minimize: false});

// Every list query filters on some combination of these three, and all three are
// optional, so one compound index in the order the UI narrows them covers all of
// it. It also lets the filter endpoint's distinct() calls scan the index.
exerciseAnimationSchema.index({gender: 1, equipment: 1, muscle: 1});
exerciseAnimationSchema.index({name: 1});

// The picker filters on the fine muscle now, and every boot asks how many rows
// are still on an old rule version.
exerciseAnimationSchema.index({primaryMuscle: 1});
exerciseAnimationSchema.index({metadataVersion: 1});

module.exports = mongoose.model('ExerciseAnimation', exerciseAnimationSchema);
