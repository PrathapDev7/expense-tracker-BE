const express = require('express');
const cors = require('cors');
const { db } = require('./db/db');
const { readdirSync } = require('fs');
const cron = require('node-cron');  // Add node-cron
const index = express();
const {baseAction} = require('./controllers/Common');

require('dotenv').config();

const PORT = process.env.PORT || 3000;

//middlewares
index.use(express.json());
index.use(cors());

//routes
readdirSync('./routes').map((route) => index.use('/api/v1/', require('./routes/' + route)));

// Add the cron job to run every 1 minute
cron.schedule('* * * * *', () => {
    console.log('Updating server...');
    return baseAction();
});

const server = () => {
    db();
    index.listen(PORT, () => {
        console.log('listening to port:', PORT);
    });
};

server();
