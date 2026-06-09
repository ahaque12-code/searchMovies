require('dotenv').config();
const session = require("express-session");
const MongoStore = require("connect-mongo").default;
const express = require("express");
const path = require("path");
const port = process.env.PORT || 3001;
const app = express();
const mongoose = require("mongoose");

mongoose.connect(process.env.MONGO_CONNECTION_STRING,{dbName: "CMSC335DB"}).then(() => console.log("Connected To MongoDB")).catch((err) => {
    console.log("MongoDB error: ", err);
});

const Favorite = require("./models/Favorite"); 

async function fetchFavoritesFromDB(userId) {
    try {
        return await Favorite.find({ user: userId });
    } catch (err) {
        console.error("Database Fetch Error:", err);
        return [];
    }
}

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
app.use("/users",  usersRouter);

app.use(express.static(__dirname));

const globalGenreMap = {
    // Movies
    28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
    80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
    14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
    96: "Mystery", 10749: "Romance", 878: "Sci-Fi", 53: "Thriller",
    10752: "War", 37: "Western",
    
    // TV Specific
    10759: "Action & Adventure", 
    10765: "Sci-Fi & Fantasy",
    10762: "Kids",
    10763: "News",
    10764: "Reality",
    10766: "Soap",
    10767: "Talk",
    10768: "War & Politics"
};

app.get('/', async (req,res) => {
    const isGuest = !(req.session && req.session.userId);
    const username = isGuest ? "Guest" : req.session.username;
    let displayName = (username !== "Guest" && username.includes('@')) 
        ? username.split('@')[0] 
        : username;
    displayName = displayName.charAt(0).toUpperCase() + displayName.substring(1);
    
    const authAction = isGuest 
        ? `<a href="/users/login" class="nav-item" id="login-link">Log In</a>`
        : `<form action="/users/logout" method="post" style="display: inline;">
             <button type="submit" id="logout-link-btn">Sign Out</button>
           </form>`;

    let html = ` 
    <!DOCTYPE html>
        <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>SearchMovie | Discover & Track Movies</title>
                <meta name="description" content="Search, discover, and track your favorite movies and TV shows. Find reviews and streaming providers with SearchMovie.">
                
                <meta property="og:title" content="SearchMovie - Movie & TV Discovery">
                <meta property="og:description" content="Discover, search, and track your favorite movies and TV shows with real-time Rotten Tomatoes scores.">
                <meta property="og:image" content="https://searchmovie.win/images/icon.png">
                <meta property="og:url" content="https://searchmovie.win">
                <meta property="og:type" content="website">

                <meta name="twitter:card" content="summary_large_image">
                <meta name="twitter:title" content="SearchMovie - Movie & TV Discovery">
                <meta name="twitter:description" content="Discover, search, and track your favorite movies and TV shows.">
                <meta name="twitter:image" content="https://searchmovie.win/images/icon.png">

                <link rel="icon" type="image/png" href="https://searchmovie.win/images/icon.png">
                <link rel="apple-touch-icon" href="https://searchmovie.win/images/icon.png">
                <link rel="icon" type="image/x-icon" href="/images/icon.png">
                <link rel="stylesheet" href="/css/style.css">
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
                <script type="application/ld+json">
                    {
                    "@context": "https://schema.org",
                    "@type": "WebSite",
                    "name": "SearchMovie",
                    "url": "https://searchmovie.win/"
                    }
                </script>
                <script src="misc/genreFunc.js" defer></script>
            </head>
            <body>
            <div class="app-container">
                    <main class="main-content">
                        <div id="movieBody">
                            <nav class="navbar">
                                <span class="nav-title">SearchMovie</span>
                                <button class="hamburger" id="hamburger">☰</button>

                                <div class="nav-links" id="navLinks">
                                    <span class="nav-greeting">Hello, ${displayName}!</span>
                                    <a href="/favorites" class="nav-item">Favorite List</a>
                                    ${authAction}
                                </div>
                            </nav>
                            <div class="content-bg">
                                <div id="backdrop-slider"></div>
                                <div class="content-overlay">
                                    <h2>Making searching movies easier</h2> 
                                    <form id="movieForm" action="/results" method="get">
                                        <div class="search-container" style="position: relative; display: inline-block;">
                                            <input type="text" name="q" id="movieName" placeholder="Search movies...">
                                            <button id="searchBtn"><img id="srchImg" src="images/search-symbol-wbg.png" alt="Search"></button>
                                            <div id="suggestionsBox"></div>
                                        </div>

                                        <br><br>
                                        
                                        <div class = "rec-box">
                                            <h3>Not sure what to search? Just fill up these and get recommendations!</h3>

                                            <div class="rec-container">
                                                <input type="number" name="rating" id="movieRating" max="10" min="0" step="0.1" placeholder="Minimum Rating">
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
                                                <input type="text" name="year" id="yearRelease" placeholder="Year">
                                                <select name="media" id="mediaSelect">
                                                    <option value="multi">Type</option>
                                                    <option value="movie">Movie</option>
                                                    <option value="tv">TV</option>
                                                </select>
                                                <select name="language" id="langSelect">
                                                    <option value="">All Languages</option>
                                                    <option value="en">English</option>
                                                    <option value="hi">Hindi</option>
                                                    <option value="kn">Kannada</option>
                                                    <option value="es">Spanish</option>
                                                    <option value="fr">French</option>
                                                    <option value="bn">Bangla</option>
                                                </select>
                                                <br><br>
                                            </div>
                                            <input type="submit" id="submit" value="Search">
                                        </div>
                                    </form>
                                </div>
                            </div>
                            <br><br>
                        </div>
                        <br><br>
                        <div id="popular-movie">
                            <div id="movie-section" class="slider-container">
                                <h2>| Trending Movies</h2>
                                <button type="button" class="slide-btn left" onclick="scrollGrid('movie-grid', -300)">❮</button>
                            <div id="movie-grid" class="popular-movie-grid">

    `;

    try {
        const api_key = process.env.TMDB_API_KEY;
        const page = Number(req.query.page) || 1;
        const apiUrl = `https://api.themoviedb.org/3/movie/popular?api_key=${api_key}&language=en-US&page=${page}`;
        const apiRes = await fetch(apiUrl, { method: 'GET', headers: { accept: 'application/json' } });
        
        if (!apiRes.ok) {
            return res.status(apiRes.status).send(`<h2>API Error: Status ${apiRes.status}</h2>`);
        }
        
        const apiData = await apiRes.json();
        const popularMovies = apiData.results;

        for (const movie of popularMovies) {
            const movieTitle = movie.title;
            const posterPath = movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : 'images/icon.png';
            const dateString = movie.release_date || ""
            const releaseYear = dateString ? dateString.substring(0, 4) : "N/A";
            const rating = movie.vote_average ? Number(movie.vote_average).toFixed(1) : "N/A";


            html += `
                    <div class="popular-movie-card" onclick="window.location.href='/media/movie/${movie.id}'">
                        <div class="popular-poster-container"> 
                            <img class="popular-movie-img" src="${posterPath}" alt="${movieTitle} poster">
                            <div class="play-overlay">
                                <div class="play-icon">▶</div>
                            </div>
                        </div>
                        <div class="movieInfo">
                            <p class="movieTitleText">${movieTitle}</p>
                            <p class="movieReleaseYear">${releaseYear}</p>
                            <div class="starrt-container">
                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="star">
                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                                    <span class="star-rating">${rating}</span>
                                </svg>
                            </div>
                        </div>
                    </div>
            `;
        }
        html += `
                    <button type="button" class="slide-btn right" onclick="scrollGrid('movie-grid', 300)">❯</button>
                </div>
            </div>`;

    } catch (err) {
        console.log("API ERROR FOR POPULAR MOVIES: ", err);
    }  


    try {
        const api_key = process.env.TMDB_API_KEY;
        const page = Number(req.query.page) || 1;
        const apiUrl = `https://api.themoviedb.org/3/tv/popular?api_key=${api_key}&language=en-US&page=${page}`;
        const apiRes = await fetch(apiUrl, { method: 'GET', headers: { accept: 'application/json' } });
        
        if (!apiRes.ok) {
            return res.status(apiRes.status).send(`<h2>API Error: Status ${apiRes.status}</h2>`);
        }

        html+= ` <div id="popular-movie">
                            <div id="show-section" class="slider-container">
                                <h2>| Trending Shows</h2>
                                <button type="button" class="slide-btn left" onclick="scrollGrid('show-grid', -300)">❮</button>
                            <div id="show-grid" class="popular-movie-grid">`;
        
        const apiData = await apiRes.json();
        const popularSeries = apiData.results;

        for (const series of popularSeries) {
            const seriesTitle = series.name;
            const posterPath = series.poster_path ? `https://image.tmdb.org/t/p/w500${series.poster_path}` : 'images/icon.png';
            const dateString = series.first_air_date || ""
            const releaseYear = dateString ? dateString.substring(0, 4) : "N/A";
            const rating = series.vote_average ? Number(series.vote_average).toFixed(1) : "N/A";


            html += `
                    <div class="popular-movie-card" onclick="window.location.href='/media/tv/${series.id}'">
                        <div class="popular-poster-container"> 
                            <img class="popular-movie-img" src="${posterPath}" alt="${seriesTitle} poster">
                            <div class="play-overlay">
                                <div class="play-icon">▶</div>
                            </div>
                        </div>
                        <div class="movieInfo">
                            <p class="movieTitleText">${seriesTitle}</p>
                            <p class="movieReleaseYear">${releaseYear}</p>
                            <div class="starrt-container">
                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="star">
                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                                    <span class="star-rating">${rating}</span>
                                </svg>
                            </div>
                        </div>
                    </div>
            `;
        }


        html+= `
                    <button type="button" class="slide-btn right" onclick="scrollGrid('show-grid', 300)">❯</button>
                </div>
            </div>`

    } catch (err) {
        console.log("API ERROR FOR POPULAR MOVIES: ", err);
    }  

    try {
        const api_key = process.env.TMDB_API_KEY;
        const page = Number(req.query.page) || 1;
        const apiUrl = `https://api.themoviedb.org/3/trending/all/day?api_key=${api_key}&language=en-US&page=${page}`;
        const apiRes = await fetch(apiUrl, { method: 'GET', headers: { accept: 'application/json' } });
        
        if (!apiRes.ok) {
            return res.status(apiRes.status).send(`<h2>API Error: Status ${apiRes.status}</h2>`);
        }

        html+= ` <div id="popular-movie">
                            <div id="show-section" class="slider-container">
                                <h2>| Trending Today</h2>
                                <button type="button" class="slide-btn left" onclick="scrollGrid('td-grid', -300)">❮</button>
                            <div id="td-grid" class="popular-movie-grid">`;
        
        const apiData = await apiRes.json();
        const ttToday = apiData.results;

        for (const trendingM of ttToday) {
            const mediaTypeTD = trendingM.media_type;
            const seriesTitle = mediaTypeTD == "movie" ? trendingM.title : trendingM.name;
            const posterPath = trendingM.poster_path ? `https://image.tmdb.org/t/p/w500${trendingM.poster_path}` : 'images/icon.png';
            const dateString = mediaTypeTD == "movie" ? trendingM.release_date : trendingM.first_air_date;
            const releaseYear = dateString ? dateString.substring(0, 4) : "N/A";
            const rating = trendingM.vote_average ? Number(trendingM.vote_average).toFixed(1) : "N/A";


            html += `
                    <div class="popular-movie-card" onclick="window.location.href='/media/${mediaTypeTD}/${trendingM.id}'">
                        <div class="popular-poster-container"> 
                            <img class="popular-movie-img" src="${posterPath}" alt="${seriesTitle} poster">
                            <div class="play-overlay">
                                <div class="play-icon">▶</div>
                            </div>
                        </div>
                        <div class="movieInfo">
                            <p class="movieTitleText">${seriesTitle}</p>
                            <p class="movieReleaseYear">${releaseYear}</p>
                            <p class="mediaTypeInfo">${mediaTypeTD == "movie" ? "Movie" : "TV"}</p>
                            <div class="starrt-container">
                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="star">
                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                                    <span class="star-rating">${rating}</span>
                                </svg>
                            </div>
                        </div>
                    </div>
            `;
        }

        html+= `
                    <button type="button" class="slide-btn right" onclick="scrollGrid('td-grid', 300)">❯</button>
                </div>
            </div>`

    } catch (err) {
        console.log("API ERROR FOR POPULAR MOVIES: ", err);
    }  

     try {
        const api_key = process.env.TMDB_API_KEY;
        const page = Number(req.query.page) || 1;
        const apiUrl = `https://api.themoviedb.org/3/tv/airing_today?api_key=${api_key}`;
        const apiRes = await fetch(apiUrl, { method: 'GET', headers: { accept: 'application/json' } });
        
        if (!apiRes.ok) {
            return res.status(apiRes.status).send(`<h2>API Error: Status ${apiRes.status}</h2>`);
        }

        html+= ` <div id="popular-movie">
                            <div id="show-section" class="slider-container">
                                <h2 class="airtdHead">| Airing Today</h2>
                                <button type="button" class="slide-btn left" onclick="scrollGrid('airtd-grid', -300)">❮</button>
                            <div id="airtd-grid" class="popular-movie-grid">`;
        
        const apiData = await apiRes.json();
        const airingTd = apiData.results;

        for (const air of airingTd) {
            const mediaTypeTD = air.media_type;
            const seriesTitle = air.name;
            const posterPath = air.poster_path ? `https://image.tmdb.org/t/p/w500${air.poster_path}` : 'images/icon.png';
            const dateString = air.first_air_date;
            const releaseYear = dateString ? dateString.substring(0, 4) : "N/A";
            const rating = air.vote_average ? Number(air.vote_average).toFixed(1) : "N/A";


            html += `
                    <div class="popular-movie-card" onclick="window.location.href='/media/tv/${air.id}'">
                        <div class="popular-poster-container"> 
                            <img class="popular-movie-img" src="${posterPath}" alt="${seriesTitle} poster">
                            <div class="play-overlay">
                                <div class="play-icon">▶</div>
                            </div>
                        </div>
                        <div class="movieInfo">
                            <p class="movieTitleText">${seriesTitle}</p>
                            <p class="movieReleaseYear">${releaseYear}</p>
                            <div class="starrt-container">
                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="star">
                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                                    <span class="star-rating">${rating}</span>
                                </svg>
                            </div>
                        </div>
                    </div>
            `;
        }

        html+= `
                    <button type="button" class="slide-btn right" onclick="scrollGrid('airtd-grid', 300)">❯</button>
                </div>
            </div>`

    } catch (err) {
        console.log("API ERROR FOR POPULAR MOVIES: ", err);
    }  



   html+= `
            </div>
         </main>
        </div>
        <script>
            async function initBackdropSlider() {
                try {
                    const res = await fetch('/api/backdrops');
                    const movies = await res.json();
                    const slider = document.getElementById('backdrop-slider');

                    movies.forEach(function(movie, i) {
                        const slide = document.createElement('div');
                        slide.className = 'slide' + (i === 0 ? ' active' : '');
                        slide.style.backgroundImage = 'url(https://image.tmdb.org/t/p/w1280' + movie.backdrop + ')';
                        slide.innerHTML = '<span class="slide-title">' + movie.title + '</span>';
                        slider.appendChild(slide);
                    });

                    let current = 0;
                    setInterval(function() {
                        const slides = slider.querySelectorAll('.slide');
                        slides[current].classList.remove('active');
                        current = (current + 1) % slides.length;
                        slides[current].classList.add('active');
                    }, 5000);
                } catch(err) {
                    console.error('Backdrop slider error:', err);
                }
            }
            initBackdropSlider();
        </script>
     </body>
    </html>`;


return res.send(html);
});

const favoritesRouter = require("./routes/favorites");
app.use("/favorites",redirectLogin, favoritesRouter);

const mediaRouter = require("./routes/media");
app.use("/media", mediaRouter);


app.get("/results", async (req,res) => {
    const isGuest = !(req.session && req.session.userId);
    const searchMovie = req.query.q ? req.query.q.trim(): "";
    const api_key = process.env.TMDB_API_KEY;
    const page = Number(req.query.page) || 1;
    const searchLang = req.query.language || "";
    let html;

    if (!searchMovie) {
        const params = new URLSearchParams(req.query).toString();
        return res.redirect(`/discover?${params}`);
    }

    try{
        let movies = [];
        let totalPages = 1;

       if (searchLang) {
            const movieUrl = `https://api.themoviedb.org/3/discover/movie?api_key=${api_key}&with_original_language=${searchLang}&with_text_query=${encodeURIComponent(searchMovie)}&page=${page}&sort_by=popularity.desc`;
            const tvUrl = `https://api.themoviedb.org/3/discover/tv?api_key=${api_key}&with_original_language=${searchLang}&with_text_query=${encodeURIComponent(searchMovie)}&page=${page}&sort_by=popularity.desc`;

            const [movieRes, tvRes] = await Promise.all([
                fetch(movieUrl, { method: 'GET', headers: { accept: 'application/json' } }),
                fetch(tvUrl, { method: 'GET', headers: { accept: 'application/json' } })
            ]);

            const [movieData, tvData] = await Promise.all([movieRes.json(), tvRes.json()]);

            totalPages = Math.max(movieData.total_pages || 1, tvData.total_pages || 1);
            movies = [
                ...(movieData.results || []).map(m => ({ ...m, media_type: 'movie' })),
                ...(tvData.results || []).map(m => ({ ...m, media_type: 'tv' }))
            ];
        }
        else {
            const apiUrl = `https://api.themoviedb.org/3/search/multi?api_key=${api_key}&query=${encodeURIComponent(searchMovie)}&include_adult=false&page=${page}`;
            const apiRes = await fetch(apiUrl, { method: 'GET', headers: { accept: 'application/json' } });
            if (!apiRes.ok) return res.status(apiRes.status).send(`<h2>API Error: Status ${apiRes.status}</h2>`);

            const apiData = await apiRes.json();
            totalPages = apiData.total_pages || 1;
            movies = (apiData.results || []).filter(item => item.media_type === "movie" || item.media_type === "tv");
        }

        console.log(movies);

        const favorites = await fetchFavoritesFromDB(req.session.userId);
        const favoriteIds = favorites.map(f => String(f.imdbId).trim());

        html = `
        <!DOCTYPE html> 
        <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Result</title>
                <meta name="description" content="Search, discover, and track your favorite movies and TV shows. Find reviews and streaming providers with SearchMovie.">
                
                <meta property="og:title" content="SearchMovie - Movie & TV Discovery">
                <meta property="og:description" content="Discover, search, and track your favorite movies and TV shows with real-time Rotten Tomatoes scores.">
                <meta property="og:image" content="https://searchmovie.win/images/icon.png">
                <meta property="og:url" content="https://searchmovie.win">
                <meta property="og:type" content="website">

                <meta name="twitter:card" content="summary_large_image">
                <meta name="twitter:title" content="SearchMovie - Movie & TV Discovery">
                <meta name="twitter:description" content="Discover, search, and track your favorite movies and TV shows.">
                <meta name="twitter:image" content="https://searchmovie.win/images/icon.png">

                <link rel="icon" type="image/png" href="https://searchmovie.win/images/icon.png">
                <link rel="apple-touch-icon" href="https://searchmovie.win/images/icon.png">
                <link rel = "stylesheet" href= "/css/style.css">
                <link rel="icon" type="image/x-icon" href="/images/icon.png">
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
            </head>
            <body>
                <nav class="navbar2">
                    <span class="nav-title2">Search Results</span>
                    <div class="nav-links2"> 
                    <a id="elemNav" href="/" class="nav-item">Home</a>
                    <a href="/favorites" class="nav-item">Favorites</a>
                    <form id="searchForm" action="/results" method = "get">
                        <input type="text" name="q" id="movieName" placeholder="Search">
                        <button id="searchBtn"><img id="srchImg2" src="images/search-symbol-wbg.png" alt="Search"></button>
                    </form>
                    </div>
                </nav>
                <div class="movie-grid">
        `;

        if (movies.length === 0) {
            html += `<h2 style="color:white; text-align: center; width: 100%;">No results found for "${searchMovie}".</h2>`;
        } else {
            for (const movie of movies) {
                const movieTitle = movie.media_type === "movie" ? (movie.title || "Unknown Movie") : (movie.name || "Unknown Show");
                const dateString = movie.media_type === "movie" ? (movie.release_date || "") : (movie.first_air_date || "");
                const releaseYear = dateString ? dateString.substring(0, 4) : "N/A";
                const rating = (movie.vote_average && !isNaN(movie.vote_average)) ? Number(movie.vote_average).toFixed(1) : "N/A";
                const posterPath = movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : 'images/icon.png';
                let type = movie.media_type;
                if(type === "movie"){
                    type = "Movie";
                } else if (type === "tv"){
                    type = "TV"
                }
                let genreText = "Unknown";
                if (movie.genre_ids && movie.genre_ids.length > 0) {
                    const names = movie.genre_ids.map(id => globalGenreMap[id]).filter(Boolean);
                    if (names.length > 0) genreText = names.join(", ");
                }
                let ageCertificate = "PG-13"; // Default

                const rRatedGenres = [27, 80, 53]; // Horror, Crime, Thriller
                const isMatureGenre = movie.genre_ids && movie.genre_ids.some(id => rRatedGenres.includes(id));

                const familyGenres = [16, 10751]; // Animation, Family
                const isFamilyGenre = movie.genre_ids && movie.genre_ids.some(id => familyGenres.includes(id));

                if (isMatureGenre) {
                    ageCertificate = "R";
                } else if (isFamilyGenre) {
                    ageCertificate = "PG"; // Animation/Family movies are usually G or PG
                } else if (movie.genre_ids && movie.genre_ids.includes(10749)) { // Romance
                    ageCertificate = "PG-13";
                }
                const certClass = ageCertificate.replace(/[^a-zA-Z0-9]/g, '-');
                const escapedTitle = encodeURIComponent(movieTitle.replace(/'/g, "\\'"));
                const escapedGenres = genreText.replace(/'/g, "\\'");
                const isFav = favoriteIds.includes(String(movie.id).trim()) ? 'active' : '';
                const displayType = (movie.media_type === "tv") ? "TV Series" : "Movie";

                html += `
                <div class="movie-card" onclick="window.location.href='/media/${movie.media_type || normalizedType}/${movie.id}'">
                    <div class="poster-container"> 
                        <span class="cert-badge ${certClass}">${ageCertificate}</span>
                        <img src="${posterPath}" alt="movie poster">
                    </div>
                    
                    <h3>${movieTitle}</h3>
                    <p>Year: ${releaseYear || "N/A"}</p>
                    <p><strong>Genre:</strong> ${genreText}</p>
                    <p><strong>Rating:</strong> ${rating}</p>
                    
                    <div class="movie-card-bottom-bar">
                        <p><strong>Type:</strong> ${displayType}</p>
                        <button class="heart-btn ${isFav}" onclick="event.stopPropagation(); addFavorite(this, '${escapedTitle}', '${releaseYear}', '${movie.id}', '${escapedGenres}', '${rating}', '${posterPath}', '${ageCertificate}')">
                            <span class="heart-icon"></span>
                        </button>
                    </div>
                </div>
                `;
            }
        }

        
        
        html += `
            </div>
            <div id="cntrl-btn">
                ${page > 1 ? `<a href="/results?q=${encodeURIComponent(searchMovie)}&page=${page - 1}" id="showLess">Previous</a>` : ''}
                <span id="txtPage">Page ${page} of ${totalPages}</span>
                ${page < totalPages ? `<a href="/results?q=${encodeURIComponent(searchMovie)}&page=${page + 1}" id="showMore">Next</a>` : ''}
            </div>
            <script>
                async function addFavorite(btn, title, year, imdbId, genres, rating, image, certification) {
                    const isGuest = ${isGuest};
        
                    if (isGuest) {
                        alert("Please log in to add favorites!");
                        window.location.href = "/users/login";
                        return;
                    }

                    const isActive = btn.classList.toggle('active');
                    
                    // Send all data that the schema expects
                    await fetch("/favorites/add", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ 
                            title, year, imdbId, genres, rating, image, certification 
                        })
                    });

                    if (isActive) {
                        console.log(title + " toggled (added/removed) in favorites!");
                    }
                }
            </script>
            </body>
            </html>
        `;

        return res.send(html);
    } catch(err){
        return res.status(500).send("Error reading data.");
    }
});

app.get('/api/search-suggestions', async (req, res) => {
    const query = req.query.q;
    const api_key = process.env.TMDB_API_KEY;
    const url = `https://api.themoviedb.org/3/search/multi?api_key=${api_key}&query=${encodeURIComponent(query)}&page=1`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        const suggestions = (data.results || [])
            .filter(m => (m.title || m.name) && m.poster_path) 
            .sort((a, b) => b.popularity - a.popularity)       
            .slice(0, 5)                                       
            .map(m => ({ 
                title: m.title || m.name, 
                id: m.id,
                media_type: m.media_type ,
                poster_path: m.poster_path
            }));
            
        res.json(suggestions);
    } catch (err) {
        res.json([]);
    }
});

app.get("/discover", async(req, res) => {
    const isGuest = !(req.session && req.session.userId);
    const api_key = process.env.TMDB_API_KEY;
    const ratingSearch = req.query.rating ? req.query.rating.trim() : "";
    const yearSearch = req.query.year ? req.query.year.trim() : "";
    const typeSearch = req.query.media || "movie";
    const normalizedType = (typeSearch === "tvSeries" || typeSearch === "tv") ? "tv" : "movie";
    const page = Number(req.query.page) || 1;
    const genreSearch = req.query.genres ? req.query.genres.split(",").map(g => g.trim()) : [];
    const langFilter = req.query.language || "en";

    const textToGenreId = normalizedType === "tv" ? {
    "Action": 10759,  "Adventure": 10759,  "Animation": 16, 
    "Comedy": 35, "Crime": 80, "Documentary": 99, "Drama": 18, 
    "Family": 10751, "Fantasy": 10765, "Horror": 10765, // Map Horror to Sci-Fi/Fantasy for TV results
    "Mystery": 9648, // Mystery TV ID is 9648
     "Romance": 10749,  "Sci-Fi": 10765, 
    "Thriller": 10759, // Thrillers are often under Action/Adventure in TV
    "War": 10768, "Western": 37 } :
     {
        "Action": 28, "Adventure": 12, "Animation": 16, "Comedy": 35,
        "Crime": 80, "Documentary": 99, "Drama": 18, "Family": 10751,
        "Fantasy": 14, "History": 36, "Horror": 27, "Music": 10402,
        "Mystery": 96, "Romance": 10749, "Sci-Fi": 878, "Thriller": 53,
        "War": 10752, "Western": 37
    };

    try {
        let apiUrl = `https://api.themoviedb.org/3/discover/${normalizedType}?api_key=${api_key}&page=${page}&include_adult=false&sort_by=popularity.desc&with_original_language=${encodeURIComponent(langFilter)}`;

        if (ratingSearch) apiUrl += `&vote_average.gte=${parseFloat(ratingSearch)}`;
        if (yearSearch) apiUrl += normalizedType === "movie" ? `&primary_release_date.gte=${yearSearch}-01-01&primary_release_date.lte=${yearSearch}-12-31` : `&first_air_date_year=${yearSearch}`;
        if (genreSearch.length > 0 && genreSearch[0] !== "") {
            const structuralIds = genreSearch.map(name => textToGenreId[name]).filter(Boolean);
            if (structuralIds.length > 0) apiUrl += `&with_genres=${structuralIds.join(",")}`;
        }

        const [apiRes, favorites] = await Promise.all([
            fetch(apiUrl, { method: 'GET', headers: { accept: 'application/json', Authorization: `Bearer ${process.env.TMDB_BEARER_TOKEN}` } }),
            fetchFavoritesFromDB(req.session.userId)
        ]);

        const apiData = await apiRes.json();
        const movies = apiData.results || [];
        const totalPages = Math.min(apiData.total_pages || 1, 500);
        const favoriteIds = favorites.map(f => String(f.imdbId).trim());

        let html = `
        <!DOCTYPE html>
        <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Discover Results</title>
                <meta name="description" content="Search, discover, and track your favorite movies and TV shows. Find reviews and streaming providers with SearchMovie.">
                
                <meta property="og:title" content="SearchMovie - Movie & TV Discovery">
                <meta property="og:description" content="Discover, search, and track your favorite movies and TV shows with real-time Rotten Tomatoes scores.">
                <meta property="og:image" content="https://searchmovie.win/images/icon.png">
                <meta property="og:url" content="https://searchmovie.win">
                <meta property="og:type" content="website">

                <meta name="twitter:card" content="summary_large_image">
                <meta name="twitter:title" content="SearchMovie - Movie & TV Discovery">
                <meta name="twitter:description" content="Discover, search, and track your favorite movies and TV shows.">
                <meta name="twitter:image" content="https://searchmovie.win/images/icon.png">
                
                <link rel="icon" type="image/png" href="https://searchmovie.win/images/icon.png">
                <link rel="apple-touch-icon" href="https://searchmovie.win/images/icon.png">
                <link rel="icon" type="image/x-icon" href="/images/icon.png">
                <link rel = "stylesheet" href= "/css/style.css">
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
            </head>
            <body>
                <nav class="navbar2">
                    <span class="nav-title2">Discovery Results</span>
                    <div class="nav-links2">
                        <a href="/" class="nav-item">Home</a>
                        <a href="/favorites" class="nav-item">Favorites</a>
                    </div>
                </nav>
                <div class="movie-grid">`;

            if (movies.length === 0) {
                html += `<h2 style="color:white; text-align: center; width: 100%;">No matches found for your filter criteria.</h2>`;
            } else{
                for (const movie of movies) {
                    const movieTitle = movie.title || movie.name || "Unknown";
                    const releaseYear = (movie.release_date || movie.first_air_date || "").substring(0, 4) || "N/A";
                    const posterPath = movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : 'images/icon.png';
                    const rating = (movie.vote_average && !isNaN(movie.vote_average)) ? Number(movie.vote_average).toFixed(1) : "N/A";
                    const genreText = movie.genre_ids ? movie.genre_ids.map(id => globalGenreMap[id]).filter(Boolean).join(", ") : "Unknown";
                    let ageCertificate = "PG-13"; // Default

                    const rRatedGenres = [27, 80, 53]; // Horror, Crime, Thriller
                    const isMatureGenre = movie.genre_ids && movie.genre_ids.some(id => rRatedGenres.includes(id));

                    const familyGenres = [16, 10751]; // Animation, Family
                    const isFamilyGenre = movie.genre_ids && movie.genre_ids.some(id => familyGenres.includes(id));

                    if (isMatureGenre) {
                        ageCertificate = "R";
                    } else if (isFamilyGenre) {
                        ageCertificate = "PG"; // Animation/Family movies are usually G or PG
                    } else if (movie.genre_ids && movie.genre_ids.includes(10749)) { // Romance
                        ageCertificate = "PG-13";
                    }
                    const escapedTitle = movieTitle.replace(/'/g, "\\'");
                    const escapedGenres = genreText.replace(/'/g, "\\'");
                    const isFav = favoriteIds.includes(movie.id.toString()) ? 'active' : '';
                    const displayType = (normalizedType === 'tv') ? "TV Series" : "Movie";
                    
                    const certClass = ageCertificate.replace(/[^a-zA-Z0-9]/g, '-');
                    html += `
                    <div class="movie-card" onclick="window.location.href='/media/${movie.media_type || normalizedType}/${movie.id}'">
                        <div class="poster-container"> 
                            <span class="cert-badge ${certClass}">${ageCertificate}</span>
                            <img src="${posterPath}" alt="movie poster">
                        </div>
                        
                        <h3>${movieTitle}</h3>
                        <p>Year: ${releaseYear || "N/A"}</p>
                        <p><strong>Genre:</strong> ${genreText}</p>
                        <p><strong>Rating:</strong> ${rating}</p>
                
                        <div class="movie-card-bottom-bar">
                            <p><strong>Type:</strong> ${displayType}</p>
                            <button class="heart-btn ${isFav}" onclick="event.stopPropagation(); addFavorite(this, '${escapedTitle}', '${releaseYear}', '${movie.id}', '${escapedGenres}', '${rating}', '${posterPath}', '${ageCertificate}')">
                                <span class="heart-icon"></span>
                            </button>
                        </div>
                    </div>
                    `;
                }
            }


        html += `</div>
        <div id="cntrl-btn">
            ${page > 1 ? `<button id="showLess" onclick="window.location.href='/discover?type=${typeSearch}&genres=${encodeURIComponent(req.query.genres || "")}&rating=${encodeURIComponent(ratingSearch)}&year=${encodeURIComponent(yearSearch)}&page=${page - 1}'">Prev Page</button>` : ''}
            <span id="txtPage">Page ${page} of ${totalPages}</span>
            ${page < totalPages ? `<button id="showMore" onclick="window.location.href='/discover?type=${typeSearch}&genres=${encodeURIComponent(req.query.genres || "")}&rating=${encodeURIComponent(ratingSearch)}&year=${encodeURIComponent(yearSearch)}&page=${page + 1}'">Next Page</button>` : ''}
        </div>
        <script>
            async function addFavorite(btn, title, year, imdbId, genres, rating, image, certification) {
                 const isGuest = ${isGuest};
        
                if (isGuest) {
                    alert("Please log in to add favorites!");
                    window.location.href = "/users/login";
                    return;
                }

                const isActive = btn.classList.toggle('active');
                await fetch("/favorites/add", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title, year, imdbId, genres, rating, image, certification })
                });
            }
        </script>
        </body></html>`;

        res.send(html);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error reading data.");
    }
});

app.get("/air_today", async (req,res)=>{
    let html = `
    <!DOCTYPE html>
    <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Airing Today</title>
            <meta name="description" content="What's airing today">
            
            <meta property="og:title" content="SearchMovie - Airing Today">
            <meta property="og:description" content="Find out whats airing today">
            <meta property="og:image" content="https://searchmovie.win/images/icon.png">
            <meta property="og:url" content="https://searchmovie.win">
            <meta property="og:type" content="website">

            <meta name="twitter:card" content="summary_large_image">
            <meta name="twitter:title" content="SearchMovie - Movie & TV Discovery">
            <meta name="twitter:description" content="Discover, search, and track your favorite movies and TV shows.">
            <meta name="twitter:image" content="https://searchmovie.win/images/icon.png">
            
            <link rel="icon" type="image/png" href="https://searchmovie.win/images/icon.png">
            <link rel="apple-touch-icon" href="https://searchmovie.win/images/icon.png">
            <link rel="icon" type="image/x-icon" href="/images/icon.png">
            <link rel = "stylesheet" href= "/css/style.css">
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
        </head>
        <body class="air-td-body">
            <nav class="navbar2">
                <span class="nav-title2">Discovery Results</span>
                <div class="nav-links2">
                    <a href="/" class="nav-item">Home</a>
                    <a href="/favorites" class="nav-item">Favorites</a>
                </div>
            </nav>
            <div class="main-cont-td">
                <div id="airDate">
                    <h1 style="text-align: center; color: red;  animation: dropIn 0.4s ease-out forwards;">Airing Today</h1>
                    <div id="air-controls">
                        <button id="prev"><</button>
                        <h2 id="day-display"></h2>
                        <button id="next">></button>
                    </div>
                </div>
                <div class="airInfo">

    `

    const [network, web] = await Promise.all([
        fetch(`https://api.tvmaze.com/schedule?country=US&date=2026-06-07`).then(r => r.json()),
        fetch(`https://api.tvmaze.com/schedule/web?country=US&date=2026-06-07`).then(r => r.json()),
    ]);

    const data = [...network, ...web];
    const shows = data.filter(entry => {
        const show = entry._embedded?.show != null ? entry._embedded.show : entry.show;
        return show?.type === 'Scripted' || show?.type === 'Animation';
    });
    console.log('total:', data.length, 'filtered:', shows.length);
    console.log(shows);
    html+=`
                </div>
            </div>
        <script>
            let weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            let offset = 0;

            function updateDisplay() {
                const d = new Date();
                d.setDate(d.getDate() + offset);
                const label = offset === 0 
                ? 'Today' 
                : weekdays[d.getDay()] + ' ' + d.getDate();
                document.getElementById('day-display').textContent = label;
            }

            document.getElementById('prev').addEventListener('click', () => {
                offset--;
                updateDisplay();
            });

            document.getElementById('next').addEventListener('click', () => {
                offset++;
                updateDisplay();
            });

            updateDisplay();

        </script>
        </body>
    </html>`;

    res.send(html);
})

app.get('/api/backdrops', async (req, res) => {
    const api_key = process.env.TMDB_API_KEY;
    const apiRes = await fetch(`https://api.themoviedb.org/3/movie/popular?api_key=${api_key}&language=en-US&page=1`);
    const data = await apiRes.json();
    const backdrops = data.results
        .filter(m => m.backdrop_path)
        .slice(0, 10)
        .map(m => ({ title: m.title, backdrop: m.backdrop_path }));

    res.json(backdrops);
});

app.listen(port, (err) => {
    if(err) {
        console.log("Server failed: " + err);
    } else {
        console.log(`http://localhost:${port}`);
    }
});