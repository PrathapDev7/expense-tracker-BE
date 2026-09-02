const mongoose = require('mongoose');

// A set as actually performed. Mirrors the planned set but adds completion,
// because the summary counts what was done, not what was scheduled.
const performedSetSchema = new mongoose.Schema({
    reps: {type: Number, min: 0},
    weight: {type: Number, min: 0},
    durationSec: {type: Number, min: 0},
    distance: {type: Number, min: 0},
    completed: {type: Boolean, default: false},
    completedAt: {type: Date},
});

// The exercise is copied in, not referenced back into the plan.
//
// A session is a record of what happened. If it pointed at the plan, editing a
// routine next week would rewrite last week's history -- renaming an exercise or
// dropping a set would silently change what the summary and the progress chart
// say you did.
const sessionExerciseSchema = new mongoose.Schema({
    catalogId: {type: String, trim: true},
    customExercise: {type: mongoose.Schema.Types.ObjectId, ref: 'CustomExercise'},
    name: {type: String, required: true, trim: true},
    muscle: {type: String, trim: true},
    equipment: {type: String, trim: true},
    mode: {type: String, enum: ['weights', 'time'], default: 'weights'},
    weightUnit: {type: String, enum: ['kg', 'lb'], default: 'kg'},
    color: {type: String, trim: true},
    // Copied in with the exercise so the rest timer keeps running off the session
    // even if the plan is edited while the workout is in progress.
    restBetweenSetsSec: {type: Number, default: 0, min: 0},
    order: {type: Number, default: 0},
    sets: {type: [performedSetSchema], default: []},
});

const workoutSessionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    plan: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WorkoutPlan',
    },
    routineId: {
        type: mongoose.Schema.Types.ObjectId,
    },
    // Names are snapshotted for the same reason the exercises are: history has to
    // survive the plan being renamed or deleted.
    planName: {type: String, trim: true},
    routineName: {type: String, trim: true},
    status: {
        type: String,
        enum: ['active', 'completed', 'abandoned'],
        default: 'active',
    },
    startedAt: {
        type: Date,
        required: true,
    },
    finishedAt: {type: Date},
    // Elapsed wall clock, which is what the summary shows. Not derivable from the
    // timestamps alone once pausing exists, so it is stored rather than computed.
    durationSec: {type: Number, default: 0, min: 0},
    // Same reason as restBetweenSetsSec: the pre-start sheet can change this on
    // the way in, and the running workout should not read it back from the plan.
    restBetweenExercisesSec: {type: Number, default: 0, min: 0},
    exercises: {type: [sessionExerciseSchema], default: []},
}, {timestamps: true});

// The history list, and the "is there a workout to resume" check on app open.
workoutSessionSchema.index({user: 1, startedAt: -1});
workoutSessionSchema.index({user: 1, status: 1});
// Backs both the per-exercise progress chart and the picker's recent-exercises
// list, which are the two queries that reach inside the exercises array.
workoutSessionSchema.index({user: 1, 'exercises.name': 1, startedAt: -1});

module.exports = mongoose.model('WorkoutSession', workoutSessionSchema);
