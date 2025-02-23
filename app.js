const bodyParser = require('body-parser');
const express = require('express');
const routes = require('./routes/authRoutes'); 
const app = express();
const session = require("express-session");
const flash = require('express-flash');
app.use(session({
    secret: "your_secret_key",  // Change this to a strong secret key
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));



app.use(flash());


app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));

app.use('/', routes); 



app.listen(9999, () => {
    console.log('Server initialized on http://localhost:9999');
});

