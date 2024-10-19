const express = require('express');
const cors = require('cors');
const { db } = require('./db/db');
const { readdirSync } = require('fs');
const cron = require('node-cron');  // Add node-cron
const axios = require('axios');  // For HTTP requests
const index = express();
const {baseAction} = require('./controllers/Common');

require('dotenv').config();

const PORT = process.env.PORT || 3000;

//middlewares
index.use(express.json());
index.use(cors());

//routes
readdirSync('./routes').map((route) => index.use('/api/v1/', require('./routes/' + route)));

// Ping the server from 6 AM to 12 AM every minute
cron.schedule('* 6-24 * * *', async () => {
    try {
        const serverUrl = `https://expense-tracker-be-3rvm.onrender.com/api/v1/`;  // Make sure this route exists
        await axios.get(serverUrl);
        console.log(`Pinged server at ${serverUrl} to keep it active.`);
    } catch (error) {
        console.error('Error pinging server:', error.message);
    }
});

const server = () => {
    db();
    index.listen(PORT, () => {
        console.log('listening to port:', PORT);
    });
};

server();
