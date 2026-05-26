const express = require("express");
const router = express.Router();
const User = require("../models/User");

router.get("/login", (req,res) => {
    if (req.session && req.session.userId) {
        return res.send(`
        <!DOCTYPE html>
        <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link rel="stylesheet" href="/style.css">
                <link rel="icon" type="image/x-icon" href="/images/icon.png">
                <title>Already Logged In</title>
            </head>
            <body>
                <nav class="navbar2">
                    <span class="nav-title2">Account Control</span>
                    <div class="nav-item2">
                        <a id="elemNav" href="/">Home</a>
                        <a href="/favorites">Favorites</a>
                    </div>
                </nav>

                <div style="text-align: center; margin-top: 100px;">
                    <h2 style="color: white; font-size: 2rem;">You are already logged in!</h2>
                    <p style="color: rgba(255,255,255,0.7); margin-bottom: 30px;">No need to log in again. You can head back home or terminate your session below.</p>
                    
                    <form action="/users/logout" method="POST" style="display: inline-block;">
                        <button type="submit" id="deleteBtn" style="padding: 12px 24px; font-size: 16px; cursor: pointer;">
                            Sign Out
                        </button>
                    </form>
                </div>
            </body>
        </html>
        `);
    } 

    res.send(`<!DOCTYPE html>
        <html>
            <head>
                <meta charset = "utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link rel = "stylesheet" href= "/login.css">
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
                <link rel="icon" type="image/x-icon" href="/images/icon.png">
                <title>SearchMovie</title>
            </head>
            <body class="loginBody">
                <nav class = "navbar">
                    <div class="nav-left">
                        <img src="/images/icon-removebg.png" alt="Log" class="logoImg2">  
                        <a href="/users/login" id="titleLink">
                            <span class="nav-title">SearchMovie</span>
                        </a>
                    </div>
                    <div class="nav-right">
                        <a class="nav-item">About Dev</a>
                        <a class="nav-item">Features</a>
                        <a class="nav-tiem">Tools Used</a>

                    </div>
                </nav>
                <div class="auth-wrapper">
                    <div id = "loginContainer">
                        <div id = "loginHeader">
                            <img src="/images/icon-removebg.png" alt="Log" class="logoImg">
                            <h1>SearchMovies</h1><br><br><br>
                        </div>
                        <h2>Sign in</h2>
                        <form action = "/users/login" id="loginForm" method = "post">
                            <input type="text" id="userName" name="username" placeholder="Email or Username" required><br><br>
                            <input type="password" id="password" name="password" placeholder="Password" required><br><br>
                            <input type="submit" id="submit" value="Sign In">
                        </form>
                        <p style="margin-top: 24px;">Don't have an account? Create one <a href="/users/register" style="color: #dfd327;">here</a></p>
                    </div>
                </div>
            </body>
        </html>`);
})

router.post("/login", async (req,res) =>{
    const {username, password} = req.body;
    try{
        const user = await User.findOne({username});
        if (user && await user.comparePassword(password)) {
            req.session.userId = user._id;
            req.session.username = user.username;
            return req.session.save((err) => {
                if (err) console.log("Session sync error: ", err);
                res.redirect("/"); 
            });
        }else {
            res.send(`<!DOCTYPE html>
                 <html>
                    <head>
                        <meta charset = "utf-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <link rel = "stylesheet" href= "/login.css">
                        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
                        <link rel="icon" type="image/x-icon" href="/images/icon.png">
                        <title>SearchMovie</title>
                    </head>
                    <body class="errorBody">
                        <div id="message">
                            <h1>Oooopssss....</h1>
                            <img src="/images/sad-doggoo.png" alt="sad-doggooo" class="sadDoggo">
                            <p>The username or password doesn't exist. <a href='/users/login'> Please try again</a><p>
                        </div>
                    </body>
                 </html>`);
        }
    } catch(err){
        // console.error("DETAILED LOGIN ERROR:", err);
        res.status(500).send("Login Error");
    }
})

router.get("/register", (req, res) => {
    res.send(`<!DOCTYPE html>
        <html>
            <head>
                <meta charset = "utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link rel="stylesheet" href="/login.css">
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
                <title>Create Account - SearchMovie</title>
            </head>
            <body class="loginBody">
                <div class="auth-wrapper">
                    <div id="loginContainer">
                        <div id="loginHeader">
                            <img src="/images/icon-removebg.png" alt="Logo" class="logoImg">
                            <h1>SearchMovies</h1>
                        </div>
                        <h2>Create Account</h2>
                        <form action="/users/register" method="post" id="loginForm">
                            <input type="text" id="userName" name="username" placeholder="Email or Username" required><br><br>
                            <input type="password" id="password" name="password" placeholder="Password" required><br><br>
                            <input type="submit" id="submit" value="Sign Up">
                        </form>
                        <p style="color: white; margin-top: 15px;">
                            Already have an account? <a href="/users/login" style="color: #dfd327;">Login</a>
                        </p>
                    </div>
                </div>
            </body>
        </html>`);
});

router.post("/register", async (req,res) =>{
    const {username, password} = req.body;
    try{
        const existingUser = await User.findOne({ username });
        if (existingUser) return res.send("Username taken. <a href='/users/register'>Try again</a>");

        const newUser = new User({ username, password });
        await newUser.save();
        res.redirect("/users/login");
    } catch (err) {
        // console.error("DETAILED REGISTER ERROR:", err);
        res.status(500).send("Error creating account.");
    }
})

router.post("/logout", (req, res) => {
    if (req.session) {
        req.session.destroy((err) => {
            if (err) {
                console.log("Error destroying session: ", err);
                return res.status(500).send("Error signing out.");
            }
            res.clearCookie('connect.sid'); 
            
            res.redirect("/");
        });
    } else {
        res.redirect("/");
    }
});

module.exports = router;