const express = require("express");
const router = express.Router();
const User = require("../models/User");

router.get("/login", (req,res) => {
    res.send(`<!DOCTYPE html>
        <html>
            <head>
                <meta charset = "utf-8">
                <link rel = "stylesheet" href= "/login.css">
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
                <link rel="icon" type="image/x-icon" href="images/icon.png">
                <title>SearchMovie</title>
            </head>
            <body class="loginBody">
                <nav class = "navbar">
                    <img src="/images/icon-removebg.png" alt="Log" class="logoImg2">  
                    <a href = "/login" id = "titleLink">
                    <span class="nav-title">SearchMovie</span>
                    </a>
                </nav>
                <div class="auth-wrapper">
                    <div id = "loginContainer">
                        <div id = "loginHeader">
                            <img src="/images/icon-removebg.png" alt="Log" class="logoImg">
                            <h1>SearchMovies</h1><br><br><br>
                        </div>
                        <h2>Sign in</h2>
                        <form action = "/users/login" id="loginForm" method = "post">
                            <input type="text" id="userName" placeholder=Email or Username" required><br><br>
                            <input type="text" id="password" placeholder="Password" required><br><br>
                            <input type="submit" id="submit" value="Sign In">
                        </form>
                        <p style="margin-top: 24px;">Don't have an account? Create one <a href="/users/register" style="color: #dfd327;">here</a></p>
                    </div>
                </div>
            </body>
        </html>`);
})


router.get("/register", (req, res) => {
    res.send(`<!DOCTYPE html>
        <html>
            <head>
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
                             <input type="text" id="userName" placeholder=Email or Username" required><br><br>
                            <input type="text" id="password" placeholder="Password" required><br><br>
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

module.exports = router;