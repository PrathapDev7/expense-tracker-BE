const express = require('express');
const cors = require('cors');
const { db } = require('./db/db');
const { readdirSync } = require('fs');
const cron = require('node-cron');
const axios = require('axios');  // Add axios for HTTP requests
const index = express();

require('dotenv').config();

const PORT = process.env.PORT || 3000;

//middlewares
index.use(express.json());
index.use(cors());

//routes
readdirSync('./routes').map((route) => index.use('/api/v1/', require('./routes/' + route)));

// Cron job to keep the API server active by pinging the server itself every minute
// cron.schedule('* * * * *', async () => {
//     try {
//         const serverUrl = `https://expense-tracker-be-3rvm.onrender.com/api/v1/`;  // Make sure this is an actual route
//         await axios.get(serverUrl);
//         console.log(`Pinged server at ${serverUrl} to keep it active.`);
//     } catch (error) {
//         console.error('Error pinging server:', error.message);
//     }
// });

const server = () => {
    db();
    index.listen(PORT, () => {
        console.log('listening to port:', PORT);
    });
};

server();
