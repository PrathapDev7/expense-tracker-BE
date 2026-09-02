const mongoose = require('mongoose');
const WorkoutSessionSchema = require('../models/WorkoutSessionModel');
const WorkoutPlanSchema = require('../models/WorkoutPlanModel');

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

const resolveLimit = (raw) => {
    const requested = Number.parseInt(raw, 10);
    if (!Number.isFinite(requested) || requested <= 0) return DEFAULT_LIMIT;
    return Math.min(requested, MAX_LIMIT);
};

/**
 * Turns a planned routine into the session's own copy of it.
 *
 * Copied rather than referenced on purpose: a session is a record of what
 * happened, and if it pointed at the routine then editing the plan next week
 * would silently rewrite last week's workout.
 */
const snapshotRoutine = (routine) => routine.exercises.map((exercise, index) => ({
    catalogId: exercise.catalogId,
    customExercise: exercise.customExercise,
    name: exercise.name,
    muscle: exercise.muscle,
    primaryMuscle: exercise.primaryMuscle,
    equipment: exercise.equipment,
    mode: exercise.mode,
    weightUnit: exercise.weightUnit,
    color: exercise.color,
    restBetweenSetsSec: exercise.restBetweenSetsSec,
    order: index,
    // The planned numbers become the pre-filled targets; `completed` stays false
    // until the user ticks the set off during the workout.
    sets: exercise.sets.map((set) => ({
        reps: set.reps,
        weight: set.weight,
        durationSec: set.durationSec,
        distance: set.distance,
        completed: false,
    })),
}));

/* ------------------------------------------------------------ lifecycle -- */

/**
 * Starts a workout from a routine.
 *
 * A user can only be doing one workout at a time, so anything still marked
 * active is abandoned rather than left to pile up -- an app killed mid-workout
 * would otherwise leave a live session behind forever.
 */
exports.startWorkoutSession = async (req, res) => {
    const {planId, routineId, restBetweenExercisesSec} = req.body;

    try {
        if (!planId || !routineId) {
            return res.status(400).json({message: 'planId and routineId are required.'});
        }

        const plan = await WorkoutPlanSchema.findOne({_id: planId, user: req.user.id});
        if (!plan) {
            return res.status(404).json({message: 'Workout plan not found'});
        }

        const routine = plan.routines.id(routineId);
        if (!routine) {
            return res.status(404).json({message: 'Routine not found'});
        }

        if (!routine.exercises.length) {
            return res.status(400).json({message: 'This routine has no exercises yet.'});
        }

        // The pre-start sheet can change the rest gap on the way in.
        if (restBetweenExercisesSec !== undefined) {
            routine.restBetweenExercisesSec = restBetweenExercisesSec;
            await plan.save();
        }

        await WorkoutSessionSchema.updateMany(
            {user: req.user.id, status: 'active'},
            {$set: {status: 'abandoned'}},
        );

        const session = await WorkoutSessionSchema.create({
            user: req.user.id,
            plan: plan._id,
            routineId: routine._id,
            planName: plan.name,
            routineName: routine.name,
            status: 'active',
            startedAt: new Date(),
            restBetweenExercisesSec: routine.restBetweenExercisesSec,
            exercises: snapshotRoutine(routine),
        });

        res.status(200).json({message: 'Workout started', data: session});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

/** Lets the app resume a workout after a restart. */
exports.getActiveWorkoutSession = async (req, res) => {
    try {
        const session = await WorkoutSessionSchema
            .findOne({user: req.user.id, status: 'active'})
            .sort({startedAt: -1})
            .lean();

        res.status(200).json({data: session || null});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

/**
 * Records one set being ticked off, or edited, mid-workout.
 *
 * Targeted rather than a whole-session PUT because this fires on every tick and
 * every keystroke in the set table: sending the full document back each time
 * would let a slow reply overwrite a set the user had already moved past.
 */
exports.updateWorkoutSessionSet = async (req, res) => {
    try {
        const session = await WorkoutSessionSchema.findOne({
            _id: req.params.id,
            user: req.user.id,
        });

        if (!session) {
            return res.status(404).json({message: 'Workout session not found'});
        }

        const exercise = session.exercises.id(req.params.exerciseId);
        if (!exercise) {
            return res.status(404).json({message: 'Exercise not found'});
        }

        const set = exercise.sets.id(req.params.setId);
        if (!set) {
            return res.status(404).json({message: 'Set not found'});
        }

        ['reps', 'weight', 'durationSec', 'distance'].forEach((key) => {
            if (req.body[key] !== undefined) set[key] = req.body[key];
        });

        if (req.body.completed !== undefined) {
            set.completed = req.body.completed;
            // Stamped server-side so the rest timer and the summary agree with
            // each other even if the phone's clock is off.
            set.completedAt = req.body.completed ? new Date() : undefined;
        }

        await session.save();

        res.status(200).json({message: 'Set updated', data: set});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

/** Adds a set to an exercise mid-workout ("Add set"). */
exports.addWorkoutSessionSet = async (req, res) => {
    try {
        const session = await WorkoutSessionSchema.findOne({_id: req.params.id, user: req.user.id});

        if (!session) {
            return res.status(404).json({message: 'Workout session not found'});
        }

        const exercise = session.exercises.id(req.params.exerciseId);
        if (!exercise) {
            return res.status(404).json({message: 'Exercise not found'});
        }

        const previous = exercise.sets[exercise.sets.length - 1];

        exercise.sets.push({
            // A new set defaults to whatever the last one asked for, which is
            // what the user is almost always about to type anyway.
            reps: req.body.reps !== undefined ? req.body.reps : (previous && previous.reps),
            weight: req.body.weight !== undefined ? req.body.weight : (previous && previous.weight),
            durationSec: req.body.durationSec !== undefined ? req.body.durationSec : (previous && previous.durationSec),
            distance: req.body.distance !== undefined ? req.body.distance : (previous && previous.distance),
            completed: false,
        });

        await session.save();

        res.status(200).json({
            message: 'Set added',
            data: exercise.sets[exercise.sets.length - 1],
        });
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

exports.deleteWorkoutSessionSet = async (req, res) => {
    try {
        const session = await WorkoutSessionSchema.findOne({_id: req.params.id, user: req.user.id});

        if (!session) {
            return res.status(404).json({message: 'Workout session not found'});
        }

        const exercise = session.exercises.id(req.params.exerciseId);
        if (!exercise) {
            return res.status(404).json({message: 'Exercise not found'});
        }

        if (!exercise.sets.id(req.params.setId)) {
            return res.status(404).json({message: 'Set not found'});
        }

        exercise.sets.pull(req.params.setId);
        await session.save();

        res.status(200).json({message: 'Set deleted'});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

/**
 * Ends the workout and returns the summary screen's numbers.
 *
 * Duration comes from the client when it sends one, because the on-screen timer
 * is what the user watched; the elapsed wall clock is only the fallback.
 */
exports.finishWorkoutSession = async (req, res) => {
    const {durationSec, status} = req.body;

    try {
        const session = await WorkoutSessionSchema.findOne({_id: req.params.id, user: req.user.id});

        if (!session) {
            return res.status(404).json({message: 'Workout session not found'});
        }

        const finishedAt = new Date();

        session.status = status === 'abandoned' ? 'abandoned' : 'completed';
        session.finishedAt = finishedAt;
        session.durationSec = Number.isFinite(Number(durationSec))
            ? Number(durationSec)
            : Math.max(0, Math.round((finishedAt - session.startedAt) / 1000));

        await session.save();

        res.status(200).json({
            message: 'Workout finished',
            data: session,
            summary: buildSummary(session),
        });
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

/**
 * The "Nice workout!" screen: total time, and the completed-set count per
 * muscle that the pie chart is drawn from.
 *
 * Only completed sets count -- a set the user skipped is not work they did.
 */
const buildSummary = (session) => {
    const byMuscle = {};
    let completedSets = 0;
    let volume = 0;

    session.exercises.forEach((exercise) => {
        const done = exercise.sets.filter((set) => set.completed);
        if (!done.length) return;

        // The fine muscle first: the coarse one collapses biceps, triceps and
        // forearms into a single "ARMS" slice, which is a chart that cannot tell
        // you what you trained.
        const muscle = exercise.primaryMuscle || exercise.muscle || 'Other';
        byMuscle[muscle] = (byMuscle[muscle] || 0) + done.length;
        completedSets += done.length;

        done.forEach((set) => {
            if (set.weight && set.reps) volume += set.weight * set.reps;
        });
    });

    return {
        durationSec: session.durationSec,
        exerciseCount: session.exercises.filter((e) => e.sets.some((s) => s.completed)).length,
        completedSets,
        volume,
        muscles: Object.entries(byMuscle)
            .map(([muscle, count]) => ({muscle, count}))
            .sort((a, b) => b.count - a.count),
    };
};

exports.getWorkoutSession = async (req, res) => {
    try {
        const session = await WorkoutSessionSchema.findOne({_id: req.params.id, user: req.user.id});

        if (!session) {
            return res.status(404).json({message: 'Workout session not found'});
        }

        res.status(200).json({data: session, summary: buildSummary(session)});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

exports.deleteWorkoutSession = async (req, res) => {
    try {
        const session = await WorkoutSessionSchema.findOneAndDelete({_id: req.params.id, user: req.user.id});

        if (!session) {
            return res.status(404).json({message: 'Workout session not found'});
        }

        res.status(200).json({message: 'Workout session deleted'});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

/* -------------------------------------------------------------- history -- */

/**
 * The workout history list.
 *
 * Aggregated rather than returned whole: the list shows a date, a name and a
 * couple of totals, and every session carries every set the user logged.
 */
exports.getWorkoutSessions = async (req, res) => {
    try {
        const filter = {user: req.user.id, status: {$ne: 'active'}};

        if (req.query.from || req.query.to) {
            filter.startedAt = {};
            if (req.query.from) filter.startedAt.$gte = new Date(req.query.from);
            if (req.query.to) filter.startedAt.$lte = new Date(req.query.to);
        }

        const sessions = await WorkoutSessionSchema
            .find(filter)
            .select('planName routineName status startedAt finishedAt durationSec exercises.name exercises.muscle exercises.primaryMuscle exercises.sets.completed')
            .sort({startedAt: -1})
            .limit(resolveLimit(req.query.limit))
            .skip(Number.parseInt(req.query.skip, 10) || 0)
            .lean();

        const data = sessions.map((session) => ({
            _id: session._id,
            planName: session.planName,
            routineName: session.routineName,
            status: session.status,
            startedAt: session.startedAt,
            finishedAt: session.finishedAt,
            durationSec: session.durationSec,
            exerciseCount: session.exercises.length,
            completedSets: session.exercises.reduce(
                (total, exercise) => total + exercise.sets.filter((set) => set.completed).length,
                0,
            ),
        }));

        res.status(200).json({data});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

/**
 * The per-exercise chart behind the icon on each exercise card.
 *
 * Keyed by name rather than by catalog id because the same movement can come
 * from the catalog on one day and from a custom entry on another, and the user
 * thinks of it as one exercise either way.
 */
exports.getExerciseHistory = async (req, res) => {
    const {name} = req.query;

    try {
        if (!name || !String(name).trim()) {
            return res.status(400).json({message: 'name is required.'});
        }

        const sessions = await WorkoutSessionSchema
            .find({
                user: req.user.id,
                status: 'completed',
                'exercises.name': String(name).trim(),
            })
            .select('startedAt exercises')
            .sort({startedAt: -1})
            .limit(resolveLimit(req.query.limit))
            .lean();

        const data = sessions.map((session) => {
            const done = session.exercises
                .filter((exercise) => exercise.name === String(name).trim())
                .flatMap((exercise) => exercise.sets.filter((set) => set.completed));

            return {
                sessionId: session._id,
                date: session.startedAt,
                sets: done.length,
                totalReps: done.reduce((total, set) => total + (set.reps || 0), 0),
                // The chart's y-axis: heaviest set that day, and the total load
                // moved. Both are meaningless for a time-based exercise, which
                // is why the reps and duration totals sit alongside them.
                bestWeight: done.reduce((best, set) => Math.max(best, set.weight || 0), 0),
                volume: done.reduce((total, set) => total + ((set.weight || 0) * (set.reps || 0)), 0),
                totalDurationSec: done.reduce((total, set) => total + (set.durationSec || 0), 0),
            };
        }).reverse();

        res.status(200).json({data});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

/**
 * The picker's "Previous exercises" section.
 *
 * Distinct movements the user has actually done, most recent first, so the
 * exercises they keep coming back to are one tap away instead of buried in a
 * 1,600-row catalog.
 */
exports.getPreviousExercises = async (req, res) => {
    try {
        const rows = await WorkoutSessionSchema.aggregate([
            {$match: {user: new mongoose.Types.ObjectId(req.user.id), status: 'completed'}},
            {$sort: {startedAt: -1}},
            {$limit: 200},
            {$unwind: '$exercises'},
            {$group: {
                _id: '$exercises.name',
                catalogId: {$first: '$exercises.catalogId'},
                customExercise: {$first: '$exercises.customExercise'},
                muscle: {$first: '$exercises.muscle'},
                equipment: {$first: '$exercises.equipment'},
                lastPerformedAt: {$max: '$startedAt'},
                timesPerformed: {$sum: 1},
            }},
            {$sort: {lastPerformedAt: -1}},
            {$limit: resolveLimit(req.query.limit)},
            {$project: {
                _id: 0,
                name: '$_id',
                catalogId: 1,
                customExercise: 1,
                muscle: 1,
                primaryMuscle: 1,
                equipment: 1,
                lastPerformedAt: 1,
                timesPerformed: 1,
            }},
        ]);

        res.status(200).json({data: rows});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};
