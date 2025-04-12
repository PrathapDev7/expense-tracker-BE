const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const UserSchema = require('../models/UserModel');
const nodemailer = require('nodemailer');
const mailGen = require('mailgen');

const config = {
    service : "gmail",
    auth : {
        user : process.env.EMAIL,
        pass : process.env.PASS
    }
};
const transporter = nodemailer.createTransport(config);

const MailGenerator = new mailGen({
   theme: "default",
   product: {
       name : "Mailgen",
       link: "https://mailgen.js/"
   }
});

// Generate a random 6-digit OTP
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000);
};

// User registration controller
const registerUser = async (req, res) => {
    const { email, password, username } = req.body;

    try {
        const existingUser = await UserSchema.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'Email already registered.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new UserSchema({
            email,
            username,
            password: hashedPassword,
            verified: false
        });

        await newUser.save();

        // Send email verification
        const link = `${process.env.BASE_URL}/verify-email?email=${email}`;
        const response = {
            body: {
                name: username,
                intro: 'Welcome to Wealthify!',
                action: {
                    instructions: 'To verify your email, click the button below:',
                    button: {
                        color: '#FFD700',
                        text: 'Verify Email',
                        link
                    }
                }
            }
        };

        const mail = MailGenerator.generate(response);

        const mailOptions = {
            from: process.env.EMAIL,
            to: email,
            subject: 'Wealthify - Verify Your Email',
            html: mail
        };

        await transporter.sendMail(mailOptions);

        res.status(201).json({ message: 'Registration successful. Please check your email to verify your account.' });

    } catch (error) {
        console.error('Register Error:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
};


// User verification controller
const verifyUser = async (req, res) => {
    const {email, otp} = req.body;
    try {
        // Find the user by email
        const user = await UserSchema.findOne({email});

        if (!user) {
            return res.status(404).json({message: 'User not found.'});
        }

        // Check if the provided OTP matches the saved OTP
        if (user.otp !== otp) {
            return res.status(400).json({message: 'Invalid OTP.'});
        }

        // Mark the user as verified
        user.verified = true;
        await user.save();

        const userObj = {
            id: user._id,
            email: user.email,
            username: user.username,
        };

        const token = jwt.sign(userObj,
            process.env.JWT_TOKEN);

        res.status(200).json({message: 'User verified successfully.' ,  data : userObj , token});
    } catch (error) {
        res.status(500).json({message: 'Error verifying OTP.', error });
    }
};

const verifyEmail = async (req, res) => {
    const { email } = req.body;

    try {
        const user = await UserSchema.findOne({ email });

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        if (user.verified) {
            return res.status(200).json({ message: 'Email already verified.' });
        }

        user.verified = true;
        await user.save();

        res.status(200).json({ message: 'Email successfully verified.' });

    } catch (error) {
        console.error('Verification Error:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
};


// User login controller
const loginUser = async (req, res) => {
    const {email, password} = req.body;

    try {
        // Find the user by email
        const user = await UserSchema.findOne({email});

        if (!user) {
            return res.status(404).json({message: 'User not found.'});
        }

        // Check if the user is verified
        if (!user.verified) {
            return res.status(405).json({message: 'Your account is not verified. Please complete OTP verification.'});
        }

        // Check if the password is valid
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({message: 'Invalid password.'});
        }

        const userObj = {
            id: user._id,
            email: user.email,
            username: user.username,
        };

        const token = jwt.sign(userObj,
            process.env.JWT_TOKEN);

        res.status(200).json({message: 'Login successful.', data : userObj , token});
    } catch (error) {
        res.status(500).json({message: 'Error logging in.'});
    }
};


const resendOTP = async (req, res) => {
    const {email} = req.body;
    try {
        // Check if the email is already registered
        const existingUser = await UserSchema.findOne({email});
        if (!existingUser) {
            return res.status(400).json({message: 'User not found'});
        }

        const otp = generateOTP();

        let response = {
            body : {
                name : existingUser.username,
                intro : `Your OTP for registration is: ${otp}`
            }
        };

        let mail = MailGenerator.generate(response);

        // Set up the email data
        const mailOptions = {
            from: process.env.EMAIL,
            to: email,
            subject: 'Wealthify - OTP Verification',
            html : mail
        };

        // Send the email
        await transporter.sendMail(mailOptions);

        existingUser.otp = otp;
        await existingUser.save();

        res.status(201).json({message: 'Please check your email for OTP verification.'});
    } catch (error) {
        res.status(500).json({message: 'Error registering user.', error: error});
    }
};

const updatePassword = async (req, res) => {
    const { email, old_password, new_password } = req.body;
    try {
        // Find the user by email
        const user = await UserSchema.findOne({ email });

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // Check if the provided old password matches the current password
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
    const { email, username } = req.body;
    try {
        // Find the user by email
        const user = await UserSchema.findOne({ email });

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // Check if the provided username is already taken by another user
        const existingUserWithUsername = await UserSchema.findOne({ username });
        if (existingUserWithUsername && existingUserWithUsername._id.toString() !== user._id.toString()) {
            return res.status(400).json({ message: 'Username is already taken.' });
        }

        // Update the user's profile information
        user.username = username;
        await user.save();

        res.status(200).json({ message: 'Profile updated successfully.', data: { email: user.email, username: user.username } });
    } catch (error) {
        res.status(500).json({ message: 'Error updating profile.', error });
    }
};

module.exports = {
    registerUser,
    verifyUser,
    resendOTP,
    loginUser,
    updatePassword,
    updateProfile,
    verifyEmail
};
