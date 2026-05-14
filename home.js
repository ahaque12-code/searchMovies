const express = require("express");
const path = require("path");
require('dotenv').config();
const port = process.env.PORT || 3001;
const app = express();

const mongoose = require("mongoose");
mongoose.connect(process.env.MONGO_CONNECTION_STRING,{dbName: "CMSC335DB"}).then(console.log("Connected To MongoDB")).catch((err) => {
console.log("MongoDB error: ", err);
})

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
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
                     <input type = "text" name = "q" id = "movieName" placeholder = "Search movies, shows..." ><br><br>
                     <h3>Not sure what to search? Just fill up these and get recommendations!</h3>
                     <input type = "number" id = "movieRating" max = 10 min = 0 step = 0.1 placeholder = "Minimum Rating" >
                     <div class="genre-wrapper">
                        <button type="button" id="genreBtn">Select Genre</button>
                        <div id="genreBox" class="genre-box hidden">
                            <label><input type="checkbox" value="Action"> Action</label>
                            <label><input type="checkbox" value="Comedy"> Comedy</label>
                            <label><input type="checkbox" value="Drama"> Drama</label>
                            <label><input type="checkbox" value="Horror"> Horror</label>
                            <label><input type="checkbox" value="Romance"> Romance</label>
                            <label><input type="checkbox" value="Sci-Fi"> Sci-Fi</label>
                            <label><input type="checkbox" value="Thriller"> Thriller</label>
                            <label><input type="checkbox" value="Animation"> Animation</label>
                            <label><input type="checkbox" value="Crime"> Crime</label>
                            <label><input type="checkbox" value="Adventure"> Adventure</label>
                        </div>
                        <input type="hidden" name="genres" id="selectedGenres">
                    </div>
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
    const rows = Number(req.query.rows) || 8;
    let html;
    if (!searchMovie) {
        return res.send(`<h2>Please go back and enter a movie title to search.</h2>`);
    }

    try{
        const apiUrl = `https://${api_host}/api/imdb/search?originalTitle=${encodeURIComponent(searchMovie)}&rows=${rows}&sortOrder=ASC&sortField=id`;
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
        const movies = apiData.results || apiData;

        console.log(movies);
        html = `
        <!DOCTYPE> 
        <html>
            <head>
                <link rel="stylesheet" href="/style.css">
                <title>Results</title>
            </head>
            <body>
                <nav class="navbar2">
                    <span class="nav-title2">Search Results</span>
                    <div class="nav-links2">
                        <a id="elemNav" href="/">Back</a>
                        <a href="/favorites">Favorites</a>
                    </div>
                </nav>

                <div class="movie-grid">
        `;

        movies.forEach(movie =>{
            const genreText = movie.genres ? movie.genres.join(", ") : "Unknown";
            const rating = movie.averageRating || movie.rating || "N/A";
            html += `
            <div class="movie-card"
                ondblclick="addFavorite('${movie.originalTitle}', '${movie.startYear}', '${movie.id}', '${genreText}', '${rating}', '${movie.primaryImage || ""}')">
                <img src="${movie.primaryImage || ''}" alt="movie poster">
                <h3>${movie.originalTitle}</h3>
                <p>Year: ${movie.startYear || "N/A"}</p>
                <p><strong>Genre:</strong> ${genreText}</p>
                <p><strong>Rating:</strong> ${rating}</p>
            </div>
            `
        });
        
        html += `
            </div>

             <div style="text-align:center; margin: 30px;">
                <a href="/results?q=${encodeURIComponent(searchMovie)}&rows=${rows + 8}">
                    <button id= "showMore">Show More Results</button>
                </a>
            </div>

            <script>
                async function addFavorite(title, year, imdbId, genres, rating, image) {
                await fetch("/favorites/add", {
                    method: "POST",
                    headers: {
                    "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ title, year, imdbId, genres, rating, image })
                });

                alert(title + " added to favorites!");
                }
            </script>
            </body>
            </html>
        `;
    }catch(err){
        console.log("API ERROR: " + err);
        res.status(500).send("Error reading data.");
    }

    


    res.send(html);
}
)
const favoritesRouter = require("./routes/favorites");
app.use("/favorites", favoritesRouter);


app.listen(port, (err) => {
    if(err) {
        console.log("Server failed: " + err);
    } else {
        console.log(`http://localhost:${port}`);
    }
});

