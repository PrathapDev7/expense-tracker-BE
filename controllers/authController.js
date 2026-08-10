const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const UserSchema = require('../models/UserModel');
const WalletSchema = require('../models/WalletModel');

const registerUser = async (req, res) => {
    const { mobile, password, username } = req.body;

    try {
        if (!mobile || !password || !username) {
            return res.status(400).json({ message: 'All fields are required.' });
        }

        const existingUser = await UserSchema.findOne({ mobile });
        if (existingUser) {
            return res.status(400).json({ message: 'Mobile number already registered.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new UserSchema({
            mobile,
            username,
            password: hashedPassword,
        });

        await newUser.save();

        // Every user starts with a default wallet so income/expense (which now
        // require a wallet) always have somewhere to go. It is the user's
        // primary until they add and mark another wallet as primary.
        await WalletSchema.create({
            user: newUser._id,
            name: 'Wealthify Wallet',
            kind: 'wallet',
            openingBalance: 0,
            isPrimary: true,
        });

        const userObj = {
            id: newUser._id,
            mobile: newUser.mobile,
            username: newUser.username,
        };

        const token = jwt.sign(userObj, process.env.JWT_TOKEN);

        res.status(200).json({ message: 'Account created successfully.', data: userObj, token });

    } catch (error) {
        console.error('Register Error:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
};


const loginUser = async (req, res) => {
    const { mobile, password } = req.body;

    try {
        const user = await UserSchema.findOne({ mobile });

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({ message: 'Invalid password.' });
        }

        const userObj = {
            id: user._id,
            mobile: user.mobile,
            username: user.username,
        };

        const token = jwt.sign(userObj, process.env.JWT_TOKEN);

        res.status(200).json({ message: 'Login successful.', data: userObj, token });
    } catch (error) {
        res.status(500).json({ message: 'Error logging in.' });
    }
};


const updatePassword = async (req, res) => {
    const { old_password, new_password } = req.body;
    try {
        const user = await UserSchema.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const isPasswordValid = await bcrypt.compare(old_password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({ message: 'Invalid old password.' });
        }

        user.password = await bcrypt.hash(new_password, 10);
        await user.save();

        res.status(200).json({ message: 'Password updated successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Error updating password.', error });
    }
};

const updateProfile = async (req, res) => {
    const { username } = req.body;
    try {
        const user = await UserSchema.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const existingUserWithUsername = await UserSchema.findOne({ username });
        if (existingUserWithUsername && existingUserWithUsername._id.toString() !== user._id.toString()) {
            return res.status(400).json({ message: 'Username is already taken.' });
        }

        user.username = username;
        await user.save();

        res.status(200).json({ message: 'Profile updated successfully.', data: { mobile: user.mobile, username: user.username } });
    } catch (error) {
        res.status(500).json({ message: 'Error updating profile.', error });
    }
};

module.exports = {
    registerUser,
    loginUser,
    updatePassword,
    updateProfile,
};
