const express = require("express");
const path = require("path");
const port = 3001;
const app = express();

app.use(express.static(__dirname));

app.get('/', (req,res) => {
    res.send(`<!DOCTYPE html>
        <html>
            <head>
                <meta charset = "utf-8">
                <link rel = "stylesheet" href= "style.css">
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
                <title>Final Project</title>
                <script src = "func.js" defer></script>
            </head>
            <body>
                <nav class = "navbar">
                    <span class="nav-title">SearchMovie</span>
                    <div class="nav-links">
                     <a href="/favorites" class="nav-item">Favorite List</a>
                    </div>
                </nav>

                <div id = "movieBody">
                    <h2>Making searching movies easier</h2> 
                    <form id = "movieForm" action = "/results" method = "get">
                     <input type = "text" id = "movieName" placeholder = "Search movies, shows..." >
                     <input type = "number" id = "movieRating" max = 10 min = 0 placeholder = "Ratings (0-10)" >
                     <input type = "button" id = "movieGenre" value = "Genre">
                     <input type = "text" id = "yearRelease" placeholder = "Year"><br><br>
                     <input type = "submit"  value = "Search">
                    </form>
                </div>
            </body>
        </html>
        `)
    }
)

app.get("/results",(req,res) => {
    res.send(`<!DOCTYPE html>
        <html>
            <head>
                <meta charset = "utf-8">
                <link rel = "stylesheet" href= "style.css">
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
                <title>Info</title>
                <script src="func.js" defer></script>
            </head>
            <body>
                <div id = info>
                    <h1>Search Result</h1>
                    <p>Going to write smth</p>
                </div>
            </body>
        </html>
        `)
    } )

app.get("/favorites", (req,res) => {
    res.send(`<!DOCTYPE html>
        <html>
            <head>
                <meta charset = "utf-8">
                <link rel = "stylesheet" href= "style.css">
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
                <title>Info</title>
                <script src="func.js" defer></script>
            </head>
            <body>
                <div id = "page">
                    <h1>Favorite List</h1>
                    <p>Going to write smth</p>
                </div>
            </body>
        </html>
        `);
})
app.listen(port, (err) => {
    if(err) {
        console.log("Server failed: " + err);
    } else {
        console.log(`http://localhost:${port}`);
    }
});

