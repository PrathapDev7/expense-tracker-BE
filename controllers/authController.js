const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/UserModel');

// User registration controller
const registerUser = async (req, res) => {
    const { mobile_number, password, username } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10); // Hash the password
        const newUser = new User({ username , mobile_number, password: hashedPassword });
        await newUser.save();

        const userObj = {
            id: newUser._id,
            username: newUser.username,
            mobile_number: newUser.mobile_number,
        };

        // Create and sign the JWT token
        const token = jwt.sign(userObj,
            process.env.JWT_TOKEN);

        res.status(201).json({ message: 'User registered successfully.',  data : userObj , token  });
    } catch (error) {
        res.status(500).send('Error registering user.');
    }
};

// User login controller
const loginUser = async (req, res) => {
    const { mobile_number, password } = req.body;

    try {
        const user = await User.findOne({ mobile_number });

        if (!user) {
            res.status(404).json({message: 'User not found.'});
            return;
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            res.status(401).send('Invalid password.');
            return;
        }

        const userObj = {
            id: user._id,
            mobile_number: user.mobile_number,
            username: user.username,
        };

        // Create and sign the JWT token
        const token = jwt.sign(userObj, process.env.JWT_TOKEN);

        res.status(200).json({ message: 'Login successful.', data : userObj , token });
    } catch (error) {
        res.status(500).json({message: error.toString()});
    }
};

module.exports = {
    registerUser,
    loginUser,
};
