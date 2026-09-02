const zlib = require('zlib');

const ExerciseAnimationSchema = require('../models/ExerciseAnimationModel');

// Every endpoint here narrows by the same optional triple, so the filter is
// built once. A dropdown the user has not touched yet sends nothing, and an
// empty string is the same as absent -- neither should become {gender: ''},
// which matches no row and looks like an empty catalog.
const buildFilter = ({gender, muscle, equipment}) => {
    const filter = {};

    if (gender) filter.gender = gender;
    if (muscle) filter.muscle = muscle;
    if (equipment) filter.equipment = equipment;

    return filter;
};

// Unfiltered, the catalog is 1603 rows -- enough metadata to be worth capping
// even though the compositions themselves are excluded by the schema.
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

const resolveLimit = (raw) => {
    const requested = Number.parseInt(raw, 10);
    if (!Number.isFinite(requested) || requested <= 0) return DEFAULT_LIMIT;
    return Math.min(requested, MAX_LIMIT);
};

// .lean() hands back a BSON Binary for a Buffer path rather than a Node Buffer,
// and zlib rejects it outright. Its .buffer holds the real bytes.
const toBuffer = (value) => (Buffer.isBuffer(value) ? value : Buffer.from(value.buffer));

/**
 * Exercise metadata for the current selection, newest filter wins.
 *
 * The composition is `select: false` on the schema, so a plain find already
 * leaves the 8 KB blob out of every row -- this returns a list you can put in a
 * picker without pulling 13.5 MB along with it.
 */
exports.getExercises = async (req, res) => {
    try {
        const exercises = await ExerciseAnimationSchema
            .find(buildFilter(req.query))
            .sort({name: 1})
            .limit(resolveLimit(req.query.limit))
            .lean();

        res.status(200).json(exercises);
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

/**
 * The distinct muscle groups, narrowed by whatever else is already chosen.
 *
 * Narrowed rather than fixed because the catalog is not a full cross product:
 * asking for every muscle regardless of gender offers combinations that have no
 * exercises behind them, and the picker then leads to an empty result.
 */
exports.getExerciseMuscles = async (req, res) => {
    try {
        const muscles = await ExerciseAnimationSchema.distinct('muscle', buildFilter(req.query));

        res.status(200).json(muscles.filter(Boolean).sort());
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

/** The distinct equipment, narrowed the same way and for the same reason. */
exports.getExerciseEquipments = async (req, res) => {
    try {
        const equipments = await ExerciseAnimationSchema.distinct('equipment', buildFilter(req.query));

        res.status(200).json(equipments.filter(Boolean).sort());
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

/**
 * One Lottie composition, by catalog path.
 *
 * The id is passed as a query parameter rather than a path segment because it
 * is itself a path -- "Men/Band/ABS/Resistance Band Cocoons Exercise Men.json"
 * would otherwise be read as four route segments.
 *
 * Stored gzipped, so a client that accepts gzip gets the bytes exactly as they
 * sit in Mongo -- no decompress, no re-compress, ~8 KB on the wire instead of
 * ~100 KB. Anything else is served decompressed rather than being handed a blob
 * it cannot read.
 */
exports.getExerciseAnimation = async (req, res) => {
    try {
        const {id} = req.query;

        if (!id) {
            return res.status(400).json({message: 'id is required.'});
        }

        const animation = await ExerciseAnimationSchema
            .findById(id)
            .select('+composition')
            .lean();

        if (!animation) {
            return res.status(404).json({message: 'Animation not found.'});
        }

        const stored = toBuffer(animation.composition);

        res.type('application/json');

        if (req.acceptsEncodings('gzip')) {
            res.set('Content-Encoding', 'gzip');
            return res.send(stored);
        }

        res.send(zlib.gunzipSync(stored));
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

/* ------------------------------------------------------ the exercise picker */

const HealthProfileSchema = require('../models/HealthProfileModel');

// The health profile speaks male/female/other; the catalog speaks Men/Women.
const CATALOG_GENDER = {male: 'Men', female: 'Women'};

// User input goes into a $regex, so anything the regex engine would treat as
// syntax has to be neutered first -- otherwise a search for "Squat (" throws.
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Resolves which gender's animations this user should be shown.
 *
 * An explicit query parameter wins, then the health profile, then Men as the
 * arbitrary fallback. This only decides which of a pair of animations is
 * preferred -- it never removes an exercise from the list.
 */
const preferredGender = async (req) => {
    if (req.query.gender) return req.query.gender;

    const profile = await HealthProfileSchema
        .findOne({user: req.user.id})
        .select('healthProfile.gender')
        .lean();

    const stated = profile && profile.healthProfile && profile.healthProfile.gender;

    return CATALOG_GENDER[stated] || 'Men';
};

/**
 * The exercise picker's catalog feed.
 *
 * The stored catalog is gendered: 1,603 rows collapse to 1,077 distinct
 * (name, muscle, equipment) movements, 526 of which exist as a Men/Women pair
 * and the rest in one gender only. Filtering by gender the way the animation
 * dropdowns do would therefore hide 345 exercises from a woman and 206 from a
 * man, so this groups the pair away instead and lets gender pick which
 * animation plays -- every movement stays reachable either way.
 */
exports.getExerciseCatalog = async (req, res) => {
    try {
        const gender = await preferredGender(req);

        const match = {};
        if (req.query.muscle) match.muscle = req.query.muscle;
        if (req.query.equipment) match.equipment = req.query.equipment;

        // "Exercise name or muscle" -- one box over both fields.
        if (req.query.search && req.query.search.trim()) {
            const pattern = new RegExp(escapeRegex(req.query.search.trim()), 'i');
            match.$or = [{name: pattern}, {muscle: pattern}];
        }

        const limit = resolveLimit(req.query.limit);
        const skip = Number.parseInt(req.query.skip, 10) || 0;

        const rows = await ExerciseAnimationSchema.aggregate([
            {$match: match},
            // 0 sorts before 1, so the preferred gender's row is the one $first
            // keeps for each movement.
            {$addFields: {preference: {$cond: [{$eq: ['$gender', gender]}, 0, 1]}}},
            {$sort: {name: 1, muscle: 1, equipment: 1, preference: 1}},
            {$group: {
                _id: {name: '$name', muscle: '$muscle', equipment: '$equipment'},
                catalogId: {$first: '$_id'},
                gender: {$first: '$gender'},
                width: {$first: '$width'},
                height: {$first: '$height'},
                durationMs: {$first: '$durationMs'},
                // Both animations, so the app can swap without another round trip
                // if the user changes the gender they train with.
                variants: {$push: {gender: '$gender', catalogId: '$_id'}},
            }},
            {$sort: {'_id.name': 1}},
            {$skip: skip},
            {$limit: limit},
            {$project: {
                _id: 0,
                catalogId: 1,
                name: '$_id.name',
                muscle: '$_id.muscle',
                equipment: '$_id.equipment',
                gender: 1,
                width: 1,
                height: 1,
                durationMs: 1,
                variants: 1,
            }},
        ]);

        res.status(200).json({data: rows, gender, skip, limit});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};
