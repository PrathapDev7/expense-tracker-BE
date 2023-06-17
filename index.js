const express = require('express')
const cors = require('cors');
const { db } = require('./db/db');
const {readdirSync} = require('fs')
const index = express()

require('dotenv').config()

const PORT = process.env.PORT || 3000

//middlewares
index.use(express.json())
index.use(cors())

//routes
readdirSync('./routes').map((route) => index.use('/', require('./routes/' + route)))

const server = () => {
    db()
    index.listen(PORT, () => {
        console.log('listening to port:', PORT)
    })
}

server()