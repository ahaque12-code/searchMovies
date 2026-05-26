const session = require('express-session');
const MongoStore = require('connect-mongo').default;
const express = require("express");
const path = require("path");
require('dotenv').config();
const port = process.env.PORT || 3001;
const app = express();
const mongoose = require("mongoose");

mongoose.connect(process.env.MONGO_CONNECTION_STRING,{dbName: "CMSC335DB"}).then(console.log("Connected To MongoDB")).catch((err) => {
    console.log("MongoDB error: ", err);
});

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const redirectLogin = (req, res, next) => {
    if (!req.session || !req.session.userId) {
        return res.redirect("/users/login");
    }
    next();
};

app.use(session({
    secret: 'hehehaha',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ 
        mongoUrl: process.env.MONGO_CONNECTION_STRING,
        dbName: "CMSC335DB" 
    }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

const usersRouter = require("./routes/users");
app.use("/users", usersRouter);
app.use(express.static(__dirname));
app.use(redirectLogin);

const globalGenreMap = {
    28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
    80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
    14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
    96: "Mystery", 10749: "Romance", 878: "Sci-Fi", 53: "Thriller",
    10752: "War", 37: "Western", 10759: "Action & Adventure", 10765: "Sci-Fi & Fantasy"
};

app.get('/', (req,res) => {
    const username = req.session ? req.session.username : "";
    let navLinksHtml = `
        <span class="nav-greeting">Hello, ${username}!</span>
        <a href="/favorites" class="nav-item">Favorite List</a>
        <form action="/users/logout" method="post" style="display: inline;">
            <button type="submit" id="logout-link-btn">Sign Out</button>
        </form>
    `;

    res.send(`<!DOCTYPE html>
        <html>
            <head>
                <meta charset = "utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link rel = "stylesheet" href= "style.css">
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
                <link rel="icon" type="image/x-icon" href="images/icon.png">
                <title>SearchMovie</title>
                <script src = "genreFunc.js" defer></script>
            </head>
            <body>
                <nav class = "navbar">
                    <a href = "/" id = "titleLink">
                    <span class="nav-title">SearchMovie</span>
                    </a>
                    <div class="nav-links">
                        ${navLinksHtml}
                    </div>
                </nav>

                <div id = "movieBody">
                    <h2>Making searching movies easier</h2> 
                    <form id = "movieForm" action = "/results" method = "get">
                     <input type = "text" name = "q" id = "movieName" placeholder = "" ><br><br>
                     <h3>Not sure what to search? Just fill up these and get recommendations!</h3>
                     <input type = "number" name="rating" id = "movieRating" max = 10 min = 0 step = 0.1 placeholder = "Minimum Rating" >
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
                     <input type = "text" name = "year" id = "yearRelease" placeholder = "Year">
                     <div id="typeSelector">
                        <label><input type="radio" name="type" value="movie" checked> Movie</label>
                        <label><input type="radio" name="type" value="tv"> TV Show</label> </div>
                     <br><br>
                     <input type = "submit" id = "submit" value = "Search">
                    </form>
                </div>
            </body>
        </html>
        `);
});

app.get("/results", async (req,res) => {
    const searchMovie = req.query.q ? req.query.q.trim(): "";
    const api_key = process.env.TMDB_API_KEY;
    const page = Number(req.query.page) || 1;
    let html;

    if (!searchMovie) {
        const params = new URLSearchParams(req.query).toString();
        return res.redirect(`/discover?${params}`);
    }

    try{
        const apiUrl = `https://api.themoviedb.org/3/search/multi?api_key=${api_key}&query=${encodeURIComponent(searchMovie)}&include_adult=false&language=en-US&page=${page}`;
        const apiRes = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                accept: 'application/json',
                Authorization: `Bearer ${process.env.TMDB_BEARER_TOKEN}`
            }
        });

        if (!apiRes.ok) {
            console.log(`TMDB Error Status Code: ${apiRes.status}`);
            return res.status(apiRes.status).send(`<h2>API Error: Server returned status code ${apiRes.status}. Check your keys.</h2>`);
        }
    
        const apiData = await apiRes.json();
        const allMovies = apiData.results || [];
        const movies = allMovies.filter(item => item.media_type === "movie" || item.media_type === "tv");
        const totalPages = apiData.total_pages || 1;

        html = `
        <!DOCTYPE html> 
        <html>
            <head>
                <meta charset = "utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link rel="stylesheet" href="/style.css">
                <link rel="icon" type="image/x-icon" href="images/icon.png">
                <title>Results</title>
            </head>
            <body>
                <nav class="navbar2">
                    <span class="nav-title2">Search Results</span>
                    <div class="nav-links2"> <a id="elemNav" href="/" class="nav-item">Home</a>
                        <a href="/favorites" class="nav-item">Favorites</a>
                    </div>
                </nav>
                <h2 id = "msg" >Double click on the card to add to your favorite list!</h2>

                <div class="movie-grid">
        `;

        movies.forEach(movie =>{
            const movieTitle = movie.media_type === "movie" ? (movie.title || "Unknown Movie") : (movie.name || "Unknown Show");
            const dateString = movie.media_type === "movie" ? (movie.release_date || "") : (movie.first_air_date || "");
            const releaseYear = dateString ? dateString.substring(0, 4) : "N/A";
            const rating = (movie.vote_average && !isNaN(movie.vote_average)) ? Number(movie.vote_average).toFixed(1) : "N/A";
            const posterPath = movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : 'images/icon.png';
            
            let genreText = "Unknown";
            if (movie.genre_ids && movie.genre_ids.length > 0) {
                const names = movie.genre_ids.map(id => globalGenreMap[id]).filter(Boolean);
                if (names.length > 0) {
                    genreText = names.join(", ");
                }
            }

            let ageCertificate = "PG";
            if (movie.adult) {
                ageCertificate = "R / 18+";
            } else if (movie.genre_ids && movie.genre_ids.includes(27)) { 
                ageCertificate = "PG-13";
            } else if (movie.genre_ids && (movie.genre_ids.includes(16) || movie.genre_ids.includes(10751))) {
                ageCertificate = "G";
            }

            const escapedTitle = movieTitle.replace(/'/g, "\\'");
            const escapedGenres = genreText.replace(/'/g, "\\'");
            
            html += `
            <div class="movie-card"
                ondblclick="addFavorite('${escapedTitle}', '${releaseYear}', '${movie.id}', '${escapedGenres}', '${rating}', '${posterPath}', '${ageCertificate}')">
                <div class="poster-container"> <span class="cert-badge ${ageCertificate.replace(/[^a-zA-Z0-9]/g, '-')}">${ageCertificate}</span>
                    <img src="${posterPath}" alt="movie poster">
                </div>
                <h3>${movieTitle}</h3>
                <p>Year: ${releaseYear || "N/A"}</p>
                <p><strong>Genre:</strong> ${genreText}</p>
                <p><strong>Rating:</strong> ${rating}</p>
            </div>
            `;
        });
        
        html += `
            </div>

             <div id = "cntrl-btn">
                ${page > 1 ? `
                    <button id="showLess" onclick="window.location.href='/results?q=${encodeURIComponent(searchMovie)}&page=${page - 1}'">Prev Page</button>
                ` : ''
                }
                <span id="txtPage">Page ${page} of ${totalPages}</span>
                ${page < totalPages ? `
                    <button id="showMore" onclick="window.location.href='/results?q=${encodeURIComponent(searchMovie)}&page=${page + 1}'">Next Page</button>
                ` : ''
                }
            </div>

            <script>
                async function addFavorite(title, year, imdbId, genres, rating, image, certification) {
                    await fetch("/favorites/add", {
                        method: "POST",
                        headers: {
                        "Content-Type": "application/json"
                        },
                        body: JSON.stringify({ title, year, imdbId, genres, rating, image, certification})
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
});

app.get("/discover", async(req, res) => {
    const api_key = process.env.TMDB_API_KEY;
    const ratingSearch = req.query.rating ? req.query.rating.trim() : "";
    const yearSearch = req.query.year ? req.query.year.trim() : "";
    const typeSearch = req.query.type || "movie";
    const normalizedType = (typeSearch === "tvSeries" || typeSearch === "tv") ? "tv" : "movie";
    const page = Number(req.query.page) || 1;

    const genreSearch = req.query.genres ? req.query.genres.split(",").map(g => g.trim()) : [];
    const textToGenreId = normalizedType === "tv" ? {
    "Action": 10759, "Adventure": 10759, "Animation": 16, "Comedy": 35,
    "Crime": 80, "Documentary": 99, "Drama": 18, "Family": 10751,
    "Fantasy": 10765, "History": 36, "Horror": 27, "Music": 10402,
    "Mystery": 96, "Romance": 10749, "Sci-Fi": 10765, "Thriller": 53,
    "War": 10768, "Western": 37 } : {
    "Action": 28, "Adventure": 12, "Animation": 16, "Comedy": 35,
    "Crime": 80, "Documentary": 99, "Drama": 18, "Family": 10751,
    "Fantasy": 14, "History": 36, "Horror": 27, "Music": 10402,
    "Mystery": 96, "Romance": 10749, "Sci-Fi": 878, "Thriller": 53,
    "War": 10752, "Western": 37 };

    try{
        let apiUrl = `https://api.themoviedb.org/3/discover/${normalizedType}?api_key=${api_key}&page=${page}&include_adult=false&sort_by=popularity.desc&language=en-US`;

        if(ratingSearch){
            apiUrl += `&vote_average.gte=${parseFloat(ratingSearch)}`;
        }
        if (yearSearch) {
            apiUrl += normalizedType === "movie" ? `&primary_release_year=${yearSearch}` : `&first_air_date_year=${yearSearch}`;
        }
        if (genreSearch.length > 0 && genreSearch[0] !== "") {
            const structuralIds = genreSearch.map(name => textToGenreId[name]).filter(Boolean);
            if (structuralIds.length > 0) {
                apiUrl += `&with_genres=${structuralIds.join(",")}`;
            }
        }

        const apiRes = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                accept: 'application/json',
                Authorization: `Bearer ${process.env.TMDB_BEARER_TOKEN}`
            }
        });

        if (!apiRes.ok) {
            console.log(`TMDB Discover Error Status: ${apiRes.status}`);
            return res.status(apiRes.status).send(`<h2>API Error: Discover endpoint returned status code ${apiRes.status}.</h2>`);
        }

        const apiData = await apiRes.json();
        const movies = apiData.results || [];
        const totalPages = apiData.total_pages || 1;

        let html =`
        <!DOCTYPE html>
        <html>
            <head>
                <meta charset = "utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link rel = "stylesheet" href= "style.css">
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
                <link rel="icon" type="image/x-icon" href="images/icon.png">
                <title>SearchMovie</title>
            </head>
            <body>
                <nav class="navbar2">
                    <span class="nav-title2">Discover Recommendations</span>
                    <div class="nav-links2"> <a href="/" class="nav-item">Home</a>
                        <a href="/favorites" class="nav-item">Favorites</a>
                    </div>
                </nav>
                <h2 id="msg">Double click on the card to add to your favorite list!</h2>
                <div class="movie-grid">
        `;

        if (movies.length === 0) {
            html += `<h2 style="color:white; text-align: center; margin-top: 50px;">No matches found for your filter criteria.</h2>`;
        }

        movies.forEach(movie =>{
            const movieTitle = movie.title || movie.name || "Unknown";
            const dateString = movie.release_date || movie.first_air_date || "";
            const releaseYear = dateString ? dateString.substring(0, 4) : "N/A";
            const rating = (movie.vote_average && !isNaN(movie.vote_average)) ? Number(movie.vote_average).toFixed(1) : "N/A";
            const posterPath = movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : 'images/icon.png';

            let genreText = "Unknown";
            if (movie.genre_ids && movie.genre_ids.length > 0) {
                const names = movie.genre_ids.map(id => globalGenreMap[id]).filter(Boolean);
                if (names.length > 0) genreText = names.join(", ");
            }
            
            let ageCertificate = "PG";
            if (movie.adult) {
                ageCertificate = "R / 18+";
            } else if (movie.genre_ids && movie.genre_ids.includes(27)) { 
                ageCertificate = "PG-13";
            } else if (movie.genre_ids && (movie.genre_ids.includes(16) || movie.genre_ids.includes(10751))) {
                ageCertificate = "G";
            }

            const escapedTitle = movieTitle.replace(/'/g, "\\'");
            const escapedGenres = genreText.replace(/'/g, "\\'");

            html += `
            <div class="movie-card" ondblclick="addFavorite('${escapedTitle}', '${releaseYear}', '${movie.id}', '${escapedGenres}', '${rating}', '${posterPath}', '${ageCertificate}')">
                <div class="poster-container">
                    <span class="cert-badge ${ageCertificate.replace(/[^a-zA-Z0-9]/g, '-')}">${ageCertificate}</span>
                    <img src="${posterPath}" alt="movie poster">
                </div>
                <h3>${movieTitle}</h3>
                <p>Year: ${releaseYear}</p>
                <p><strong>Genre:</strong> ${genreText}</p>
                <p><strong>Rating:</strong> ${rating}</p>
                <p><strong>Type:</strong> ${normalizedType === 'movie' ? 'Movie' : 'TV Show'}</p>
            </div>
            `;
        })

        html += `
        </div>
        <div id = "cntrl-btn">
             ${page > 1 ? `
                <button id="showLess" onclick="window.location.href='/discover?type=${typeSearch}&genres=${encodeURIComponent(req.query.genres || "")}&rating=${encodeURIComponent(ratingSearch)}&year=${encodeURIComponent(yearSearch)}&page=${page - 1}'">Prev Page</button>
             ` : ''
             }
             <span id="txtPage">Page ${page} of ${totalPages}</span>
             ${page < totalPages ? `
                <button id="showMore" onclick="window.location.href='/discover?type=${typeSearch}&genres=${encodeURIComponent(req.query.genres || "")}&rating=${encodeURIComponent(ratingSearch)}&year=${encodeURIComponent(yearSearch)}&page=${page + 1}'">Next Page</button>
             ` : ''
             }
        </div>
        <script>
            async function addFavorite(title, year, imdbId, genres, rating, image, certification) {
                await fetch("/favorites/add", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title, year, imdbId, genres, rating, image, certification })
                });
                alert(title + " added to favorites!");
            }
        </script>
        </body>
        </html>
        `;
        
        res.send(html);

    } catch(err){
        console.log("API ERROR: " + err);
        res.status(500).send("Error reading data.");
    }
});

const favoritesRouter = require("./routes/favorites");
app.use("/favorites", favoritesRouter);

app.listen(port, (err) => {
    if(err) {
        console.log("Server failed: " + err);
    } else {
        console.log(`http://localhost:${port}`);
    }
});