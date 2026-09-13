const NotificationSchema = require('../models/NotificationModel');
const UserPreferenceSchema = require('../models/UserPreferenceModel');

let admin = null;
try {
    admin = require('firebase-admin');
    if (!admin.apps.length && process.env.FIREBASE_SERVICE_ACCOUNT) {
        admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
        });
    }
} catch (e) {
    admin = null;
}

const sendPush = async (userId, {title, body, data = {}}) => {
    try {
        const prefs = await UserPreferenceSchema.findOne({user: userId}).lean();
        const tokens = (prefs && prefs.pushTokens) || [];
        if (!tokens.length || !admin || !admin.apps.length) return false;
        const message = {
            notification: {title, body},
            data: Object.fromEntries(
                Object.entries(data).map(([k, v]) => [k, String(v)])
            ),
            tokens,
        };
        await admin.messaging().sendEachForMulticast(message);
        return true;
    } catch (e) {
        console.error('[notifications] push failed:', e.message);
        return false;
    }
};

const createNotification = async (userId, {type, title, body, data = {}}) => {
    try {
        const notif = await NotificationSchema.create({user: userId, type, title, body, data});
        await sendPush(userId, {title, body, data: {...data, notificationId: String(notif._id)}});
        return notif;
    } catch (e) {
        console.error('[notifications] create failed:', e.message);
        return null;
    }
};

module.exports = {createNotification, sendPush};
