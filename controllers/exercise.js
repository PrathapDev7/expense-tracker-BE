const path = require('path');

const Exercise = require('../models/ExerciseModel');
const {ASSETS_DIR} = require('../Seeders/exerciseCatalog');
const {seedCatalog} = require('../services/exerciseCatalog');

// Every endpoint here narrows by the same optional triple, so the filter is
// built once. A dropdown the user has not touched yet sends nothing, and an
// empty string is the same as absent -- neither should become {target: ''},
// which matches no row and looks like an empty catalog.
const buildFilter = ({bodyPart, muscle, target, equipment}) => {
    const filter = {};

    if (bodyPart) filter.bodyPart = bodyPart;
    // `muscle` is the historic query name; the field is now `target`.
    if (target) filter.target = target;
    else if (muscle) filter.target = muscle;
    if (equipment) filter.equipment = equipment;

    return filter;
};

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

const resolveLimit = (raw) => {
    const requested = Number.parseInt(raw, 10);
    if (!Number.isFinite(requested) || requested <= 0) return DEFAULT_LIMIT;
    return Math.min(requested, MAX_LIMIT);
};

exports.getExercises = async (req, res) => {
    try {
        const exercises = await Exercise
            .find(buildFilter(req.query))
            .sort({name: 1})
            .limit(resolveLimit(req.query.limit))
            .lean();

        res.status(200).json(exercises);
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

exports.getExerciseMuscles = async (req, res) => {
    try {
        const muscles = await Exercise.distinct('target', buildFilter(req.query));

        res.status(200).json(muscles.filter(Boolean).sort());
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

exports.getExerciseEquipments = async (req, res) => {
    try {
        const equipments = await Exercise.distinct('equipment', buildFilter(req.query));

        res.status(200).json(equipments.filter(Boolean).sort());
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

exports.getExerciseBodyParts = async (req, res) => {
    try {
        const parts = await Exercise.distinct('bodyPart', buildFilter(req.query));

        res.status(200).json(parts.filter(Boolean).sort());
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

/**
 * One exercise's demo gif, by CSV id.
 *
 * The id is passed as a query parameter rather than a path segment for the
 * same reason as before: callers already pass catalog ids that way, and the
 * shape stays compatible. Served from disk, not Mongo -- the binary lives in
 * the repo under Seeders/exercises/assets and is mounted at /exercise-gifs.
 */
exports.getExerciseAnimation = async (req, res) => {
    try {
        const {id} = req.query;

        if (!id) {
            return res.status(400).json({message: 'id is required.'});
        }

        const exercise = await Exercise.findById(String(id).trim()).lean();

        if (!exercise) {
            return res.status(404).json({message: 'Exercise not found.'});
        }

        if (!exercise.hasGif) {
            return res.status(404).json({message: 'No demo gif for this exercise.'});
        }

        res.sendFile(path.join(ASSETS_DIR, `${exercise._id}.gif`));
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

exports.getExerciseCatalog = async (req, res) => {
    try {
        const match = {};
        if (req.query.bodyPart) match.bodyPart = req.query.bodyPart;
        if (req.query.equipment) match.equipment = req.query.equipment;
        if (req.query.target) match.target = req.query.target;
        else if (req.query.muscle) match.target = req.query.muscle;
        else if (req.query.primaryMuscle) match.target = req.query.primaryMuscle;

        if (req.query.search && req.query.search.trim()) {
            const pattern = new RegExp(escapeRegex(req.query.search.trim()), 'i');
            match.$or = [{name: pattern}, {target: pattern}, {bodyPart: pattern}];
        }

        const limit = resolveLimit(req.query.limit);
        const skip = Number.parseInt(req.query.skip, 10) || 0;

        const [rows, total] = await Promise.all([
            Exercise.find(match).sort({name: 1}).skip(skip).limit(limit).lean(),
            Exercise.countDocuments(match),
        ]);

        res.status(200).json({
            data: rows.map((row) => ({
                catalogId: row._id,
                name: row.name,
                muscle: row.target,
                target: row.target,
                primaryMuscle: row.target,
                bodyPart: row.bodyPart,
                equipment: row.equipment,
                secondaryMuscles: row.secondaryMuscles,
                instructions: row.instructions,
                gif: row.gif,
                hasGif: row.hasGif,
            })),
            skip,
            limit,
            total,
        });
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

exports.getExerciseCatalogMuscles = async (req, res) => {
    try {
        const rows = await Exercise.aggregate([
            {$match: {target: {$nin: [null, '']}}},
            {$group: {_id: '$target', count: {$sum: 1}}},
            {$sort: {_id: 1}},
            {$project: {_id: 0, muscle: '$_id', count: 1}},
        ]);

        res.status(200).json({data: rows});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

/**
 * Reloads the CSV catalog on demand. Boot migrates exactly once; this is the
 * door for re-running it after editing the CSV, without a restart.
 */
exports.seedExercises = async (req, res) => {
    try {
        const result = await seedCatalog({source: 'on-demand'});

        if (result.failed) {
            return res.status(500).json({message: 'Exercise seed incomplete', data: result});
        }

        res.status(200).json({message: 'Exercises seeded', data: result});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};
