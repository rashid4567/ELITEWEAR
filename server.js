const express = require('express');
const app = express();
require('dotenv').config(); 
const path = require('path');
const PORT = process.env.PORT || 5000;
const nocache = require('nocache');
const connectDB = require('./config/dbs');
const userRouter = require('./routers/userRoute')

connectDB();


app.use(nocache());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json())
app.use(express.urlencoded({extended: true}))
app.use('/',userRouter)

app.set('view engine', 'ejs');
app.set('views',[path.join(__dirname, 'views/user'),path.join(__dirname,'views/admin')]);


app.get('/', (req, res) => {
    res.send('Hello');
});


app.listen(PORT, () => {
    console.log(` Server is running at http://localhost:${PORT}`);
});

module.exports = app;
