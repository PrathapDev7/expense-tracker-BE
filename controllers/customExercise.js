const CustomExerciseSchema = require('../models/CustomExerciseModel');

// The unique index on (user, name) is case-insensitive, so the lookups that back
// it have to be too -- without this a query for "Push Up" would miss the stored
// "push up" and the insert would then fail on the index instead.
const CASE_INSENSITIVE = {locale: 'en', strength: 2};

exports.getCustomExercises = async (req, res) => {
    try {
        const exercises = await CustomExerciseSchema
            .find({user: req.user.id})
            .sort({name: 1})
            .collation(CASE_INSENSITIVE)
            .lean();

        res.status(200).json({data: exercises});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

exports.addCustomExercise = async (req, res) => {
    const {name, muscle, equipment} = req.body;

    try {
        if (!name || !String(name).trim()) {
            return res.status(400).json({message: 'name is required.'});
        }

        const exercise = await CustomExerciseSchema.create({
            user: req.user.id,
            name: String(name).trim(),
            muscle: muscle ? String(muscle).trim() : undefined,
            equipment: equipment ? String(equipment).trim() : undefined,
        });

        res.status(200).json({message: 'Custom exercise added', data: exercise});
    } catch (error) {
        // 11000 is the unique index rejecting a name this user already has.
        if (error && error.code === 11000) {
            return res.status(409).json({message: 'You already have an exercise with that name.'});
        }
        res.status(500).json({message: 'Server Error'});
    }
};

exports.updateCustomExercise = async (req, res) => {
    try {
        const exercise = await CustomExerciseSchema.findOne({_id: req.params.id, user: req.user.id});

        if (!exercise) {
            return res.status(404).json({message: 'Custom exercise not found'});
        }

        ['name', 'muscle', 'equipment'].forEach((key) => {
            if (req.body[key] !== undefined) exercise[key] = String(req.body[key] || '').trim();
        });

        await exercise.save();

        res.status(200).json({message: 'Custom exercise updated', data: exercise});
    } catch (error) {
        if (error && error.code === 11000) {
            return res.status(409).json({message: 'You already have an exercise with that name.'});
        }
        res.status(500).json({message: 'Server Error'});
    }
};

/**
 * Removes the custom exercise definition only.
 *
 * Routines and past sessions carry their own copy of the name, muscle and
 * equipment, so deleting the definition does not empty out a plan the user
 * already built or rewrite a workout they already did.
 */
exports.deleteCustomExercise = async (req, res) => {
    try {
        const exercise = await CustomExerciseSchema.findOneAndDelete({_id: req.params.id, user: req.user.id});

        if (!exercise) {
            return res.status(404).json({message: 'Custom exercise not found'});
        }

        res.status(200).json({message: 'Custom exercise deleted'});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};
