const NotificationSchema = require('../models/NotificationModel');
const UserPreferenceSchema = require('../models/UserPreferenceModel');

exports.getNotifications = async (req, res) => {
    try {
        const notifs = await NotificationSchema.find({user: req.user.id})
            .sort({createdAt: -1})
            .limit(100);
        const unread = await NotificationSchema.countDocuments({user: req.user.id, read: false});
        res.status(200).json({data: notifs, unread});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

exports.readNotification = async (req, res) => {
    const {id} = req.params;
    try {
        if (id === 'all') {
            await NotificationSchema.updateMany(
                {user: req.user.id, read: false},
                {$set: {read: true}}
            );
            return res.status(200).json({message: 'All notifications marked read'});
        }
        const notif = await NotificationSchema.findOneAndUpdate(
            {_id: id, user: req.user.id},
            {$set: {read: true}},
            {new: true}
        );
        if (!notif) {
            return res.status(404).json({message: 'Notification not found'});
        }
        res.status(200).json({message: 'Notification marked read', data: notif});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};

exports.registerPushToken = async (req, res) => {
    const {token} = req.body;
    try {
        if (!token) {
            return res.status(400).json({message: 'Push token is required.'});
        }
        const prefs = await UserPreferenceSchema.findOneAndUpdate(
            {user: req.user.id},
            {$addToSet: {pushTokens: token}},
            {new: true, upsert: true}
        );
        res.status(200).json({message: 'Push token registered', data: prefs});
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};
