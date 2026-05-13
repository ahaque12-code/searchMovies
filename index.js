const express = require("express");
const path = require("path");
require('dotenv').config();
const port = process.env.PORT || 3001;
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
                    <h3>You can either search for a specific movie</h3> 
                    <h3>or just put ratings, genre, year to browse collections</h3>
                    <form id = "movieForm" action = "/results" method = "get">
                     <input type = "text" name = "q" id = "movieName" placeholder = "Search movies, shows..." ><br><br>
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

app.get("/results", async (req,res) => {
    const searchMovie = req.query.q;
    const api_key = process.env.RAPID_API_KEY;
    const api_host = process.env.RAPID_API_HOST;

    if (!searchMovie) {
        return res.send(`<h2>Please go back and enter a movie title to search.</h2>`);
    }

    try{
        const apiUrl = `https://${api_host}/api/imdb/search?originalTitle=${encodeURIComponent(searchMovie)}&rows=25&sortOrder=ASC&sortField=id`;
        const apiRes = await fetch(apiUrl, {
            method: "GET", 
            headers: {
                "Content-Type": "application/json",
                "X-RapidAPI-Key" : api_key,
                "X-RapidAPI-Host" : api_host
            }
        });
        
        if (!apiRes.ok) {
            const textError = await apiRes.text();
            console.log(`RapidAPI Error Status Code: ${apiRes.status}`);
            return res.status(apiRes.status).send(`<h2>API Error: Server returned status code ${apiRes.status}. Check your keys.</h2>`);
        }
    
        const apiData = await apiRes.json();
        console.log("Response: ", apiData);
    }catch(err){
        console.log("API ERROR: " + err);
        res.status(500).send("Error reading data.");
    }

    res.send("Check your server terminal console to verify mixed movie/series results.");
}
)

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
    }
)
app.listen(port, (err) => {
    if(err) {
        console.log("Server failed: " + err);
    } else {
        console.log(`http://localhost:${port}`);
    }
});

