const express = require('express');
const cors = require('cors');
const path = require('path');
const {db} = require('./db/db');
const {readdirSync} = require('fs');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// middlewares
app.use(express.json());
app.use(cors());

// Demo gifs for the exercise catalog, matched to rows by CSV id.
app.use('/exercise-gifs', express.static(path.join(__dirname, 'Seeders', 'exercises', 'assets'), {
    maxAge: '30d',
    immutable: true,
}));

// routes
readdirSync('./routes').map((route) => app.use('/api/v1/', require('./routes/' + route)));

const server = () => {
    db();
    app.listen(PORT, () => {
        console.log('listening to port:', PORT);
    });
};

server();
