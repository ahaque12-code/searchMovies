require('dotenv').config();
const session = require("express-session");
const MongoStore = require("connect-mongo").default;
const express = require("express");
const path = require("path");
const port = process.env.PORT || 3001;
const app = express();
const mongoose = require("mongoose");
const geoip = require('geoip-lite');
const geoTz = require('geo-tz');
const { DateTime } = require('luxon')

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

const Watchlist = require("./models/Watchlist");
async function fetchWatchlistFromDB(userId) {
    try {
        return await Watchlist.find({ user: userId });
    } catch (err) {
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

const watchlistRouter = require('./routes/watchlist');
app.use('/watchlist', redirectLogin, watchlistRouter);

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
let animeCacheData = null;
let animeCacheTime = 0;
const ANIME_CACHE_MS = 1000 * 60 * 30;

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
    
    const api_key = process.env.TMDB_API_KEY;
    const page = Number(req.query.page) || 1;
    const [moviesData, seriesData, trendingData, airingData, animePopular, animeClassic] = await Promise.all([
        fetch(`https://api.themoviedb.org/3/movie/popular?api_key=${api_key}&language=en-US&page=1`).then(r => r.json()),
        fetch(`https://api.themoviedb.org/3/tv/popular?api_key=${api_key}&language=en-US&page=1`).then(r => r.json()),
        fetch(`https://api.themoviedb.org/3/trending/all/day?api_key=${api_key}&language=en-US&page=1`).then(r => r.json()),
        fetch(`https://api.themoviedb.org/3/tv/airing_today?api_key=${api_key}`).then(r => r.json()),
        fetch(`https://api.themoviedb.org/3/discover/tv?api_key=${api_key}&with_genres=16&with_original_language=ja&sort_by=popularity.desc&page=1`).then(r => r.json()),
        fetch(`https://api.themoviedb.org/3/discover/tv?api_key=${api_key}&with_genres=16&with_original_language=ja&sort_by=vote_count.desc&page=1`).then(r => r.json()),
    ]);

       
    
    const seen = new Set();
    const adultKeywords = ['hentai', 'ero ', 'ecchi', 'overflow', 'kiss x sis', 'domestic na kanojo', 'yosuga', 'indoor', 'secret journey', 'peter grill', 'interspecies reviewers', 'sweet agony', 'sweet punishment', 'personal pet', 'guard\'s personal', 'fire in his fingertips', 'secret mission - undercover agents never back down!'];    
    let animeResults = [...(animePopular.results || []), ...(animeClassic.results || [])]  
        .filter(a => {
            if (seen.has(a.id)) return false;
            seen.add(a.id);
            const titleLower = (a.name || a.original_name || '').toLowerCase();
            if (adultKeywords.some(w => titleLower.includes(w))) return false;
            if (a.adult) return false;
            return true;
        });

   
    if (animeCacheData && (Date.now() - animeCacheTime < ANIME_CACHE_MS)) {
        animeResults = animeCacheData;
    } else {
        const batchQuery = `{
            ${animeResults.map((a, i) => {
                const safe = (a.name || a.original_name || '').replace(/[^a-zA-Z0-9 ]/g, '').trim().substring(0, 50);
                return `a${i}: Media(search: "${safe}", type: ANIME) { isAdult genres }`;
            }).join('\n')}
        }`;
        try {
            const r = await fetch('https://graphql.anilist.co', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: batchQuery })
            });
            const d = await r.json();
            animeResults = animeResults.filter((a, i) => {
                const ani = d.data?.[`a${i}`];
                if (ani?.isAdult) return false;
                if (ani?.genres?.some(g => g.toLowerCase() === 'hentai')) return false;
                return true;
            });
            animeCacheData = animeResults;
            animeCacheTime = Date.now();
        } catch (err) {
            console.log('Home AniList batch failed:', err.message);
            // fall back to unfiltered-by-anilist (keyword filter already applied if you keep it)
        }
    }
    const firstBackdrop = moviesData.results?.find(m => m.backdrop_path)?.backdrop_path;
        
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
                
                ${firstBackdrop ? `<link rel="preload" as="image" href="https://image.tmdb.org/t/p/w1280${firstBackdrop}" fetchpriority="high">` : ''}
                <link rel="icon" type="image/png" href="https://searchmovie.win/images/icon.png">
                <link rel="apple-touch-icon" href="https://searchmovie.win/images/icon.png">
                <link rel="icon" type="image/x-icon" href="/images/icon.png">
                <link rel="stylesheet" href="/css/style.css">
                <link rel="preconnect" href="https://image.tmdb.org">
                <link rel="preconnect" href="https://fonts.googleapis.com">
                <link rel="preconnect" href="https://cdnjs.cloudflare.com">
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
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
                            <div class="content-bg">
                                <nav class="navbar-main">
                                    <div id="item-left">
                                        <span class="nav-title">SearchMovie</span>
                                    </div>
                                    <button class="hamburger" id="hamburger">☰</button>

                                    <div class="nav-links" id="navLinks">
                                        <span class="nav-greeting">Hello, ${displayName}!</span>
                                        <a href="/favorites" id="fav-list" class="nav-item">Favorite List</a>
                                        <div class="genre-wrapper">
                                            <button type="button" class="nav-item" id="browseBtn"><p>Browse</p></button>
                                            <div id="browseBox" class="browse-box hidden">
                                                <a href="/my-watchlist"><i class="fa-solid fa-bookmark"></i> My Watchlist</a>
                                                <a href="/airing"><i class="fa-solid fa-tv"></i> Airing Today</a>
                                                <a href="/discover?media=movie"><i class="fa-solid fa-film"></i> Movies</a>
                                                <a href="/discover?media=tv"><i class="fa-solid fa-satellite-dish"></i> TV Shows</a>
                                                <a href="/discover?genres=Action"><i class="fa-solid fa-explosion"></i> Action</a>
                                                <a href="/discover?genres=Comedy"><i class="fa-solid fa-face-laugh"></i> Comedy</a>
                                                <a href="/discover?genres=Horror"><i class="fa-solid fa-skull"></i> Horror</a>
                                                <a href="/discover?genres=Animation"><i class="fa-solid fa-wand-magic-sparkles"></i> Animation</a>
                                                <a href="/anime"><i class="fa-solid fa-dragon"></i> Anime</a>
                                                <a href="/discover?genres=Documentary"><i class="fa-solid fa-microphone"></i> Documentary</a>
                                            </div>
                                        </div>
                                        ${authAction}
                                    </div>
                                </nav>
                                <div id="backdrop-slider"></div>
                                <div class="content-overlay">
                                    <h2 id="main-header">Making searching movies easier</h2> 
                                    <form id="movieForm" action="/results" method="get">
                                        <div class="search-container" style="position: relative; display: inline-block;">
                                            <input type="text" name="q" id="movieName" placeholder="Search movies...">
                                            <button id="searchBtn"><img id="srchImg" src="images/clipart2603165.png" alt="Search"></button>
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

    // Trending Movies Section
    for (const movie of moviesData.results || []) {
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

    // End of Trending Movies Section

    // Trending Shows Section
     html+= ` <div id="popular-movie">
                        <div id="show-section" class="slider-container">
                            <h2>| Trending Shows</h2>
                            <button type="button" class="slide-btn left" onclick="scrollGrid('show-grid', -300)">❮</button>
                        <div id="show-grid" class="popular-movie-grid">`;

    for (const series of seriesData.results || []) {
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
    //End of Trending Shows Section
    
    // Trending Today Section
    html+= ` <div id="popular-movie">
                        <div id="show-section" class="slider-container">
                            <h2>| Trending Today</h2>
                            <button type="button" class="slide-btn left" onclick="scrollGrid('td-grid', -300)">❮</button>
                        <div id="td-grid" class="popular-movie-grid">`;

    for (const trendingM of trendingData.results || []) {
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
    
    // End of Trending Today Section

    // Airing Today Section
    html+= ` <div id="popular-movie">
                        <div id="show-section" class="slider-container">
                            <a href="/airing" id="air-td-link"<h2 class="airtdHead">| Airing Today ⬈</h2></a>
                            <button type="button" class="slide-btn left" onclick="scrollGrid('airtd-grid', -300)">❮</button>
                        <div id="airtd-grid" class="popular-movie-grid">`;
    

    for (const air of airingData.results || []) {
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
    // End of Airing Today Section

    html += `<div id="popular-movie">
    <div id="show-section" class="slider-container">
        <a href="/anime" id="air-td-link"><h2 class="airtdHead">| Trending Anime ⬈</h2></a>
        <button type="button" class="slide-btn left" onclick="scrollGrid('anime-grid', -300)">❮</button>
        <div id="anime-grid" class="popular-movie-grid">`;

    for (const anime of animeResults || []) {
        const title = anime.name || "Unknown";
        const posterPath = anime.poster_path ? `https://image.tmdb.org/t/p/w500${anime.poster_path}` : 'images/icon.png';
        const releaseYear = (anime.first_air_date || "").substring(0, 4) || "N/A";
        const rating = anime.vote_average ? Number(anime.vote_average).toFixed(1) : "N/A";

        html += `
            <div class="popular-movie-card" onclick="window.location.href='/media/tv/${anime.id}'">
                <div class="popular-poster-container">
                    <img class="popular-movie-img" src="${posterPath}" alt="${title} poster">
                    <div class="play-overlay"><div class="play-icon">▶</div></div>
                </div>
                <div class="movieInfo">
                    <p class="movieTitleText">${title}</p>
                    <p class="movieReleaseYear">${releaseYear}</p>
                    <div class="starrt-container">
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="star">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                            <span class="star-rating">${rating}</span>
                        </svg>
                    </div>
                </div>
            </div>`;
    }

    html += `
            <button type="button" class="slide-btn right" onclick="scrollGrid('anime-grid', 300)">❯</button>
        </div>
    </div>`;

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
    const nsfwFlag = req.query.nsfw === 'true' ? '?nsfw=true' : '';
    let html;

    if (!searchMovie) {
        const params = new URLSearchParams(req.query).toString();
        return res.redirect(`/discover?${params}`);
    }

    try{
        let movies = [];
        let totalPages = 1;

       if (searchLang) {
            const movieUrl = `https://api.themoviedb.org/3/discover/movie?api_key=${api_key}&with_original_language=${searchLang}&with_text_query=${encodeURIComponent(searchMovie)}&page=${page}&sort_by=popularity.desc&include_adult=${allowAdult}`;
            const tvUrl = `https://api.themoviedb.org/3/discover/tv?api_key=${api_key}&with_original_language=${searchLang}&with_text_query=${encodeURIComponent(searchMovie)}&page=${page}&sort_by=popularity.desc&include_adult=${allowAdult}`;

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
            const allowAdult = req.session.nsfw === true;
            const apiUrl = `https://api.themoviedb.org/3/search/multi?api_key=${api_key}&query=${encodeURIComponent(searchMovie)}&include_adult=${allowAdult}&page=${page}`;
            const apiRes = await fetch(apiUrl, { method: 'GET', headers: { accept: 'application/json' } });
            if (!apiRes.ok) return res.status(apiRes.status).send(`<h2>API Error: Status ${apiRes.status}</h2>`);

            const apiData = await apiRes.json();
            totalPages = apiData.total_pages || 1;
            movies = (apiData.results || []).filter(item => item.media_type === "movie" || item.media_type === "tv");
        }


        const [favorites, watchlist] = await Promise.all([
            fetchFavoritesFromDB(req.session.userId),
            fetchWatchlistFromDB(req.session.userId)
        ]);

        const favoriteIds = favorites.map(f => String(f.imdbId).trim());
        const watchlistIds = watchlist.map(w => String(w.imdbId).trim());

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
                <link rel="preconnect" href="https://image.tmdb.org">
                <link rel="preconnect" href="https://fonts.googleapis.com">
                <link rel="preconnect" href="https://cdnjs.cloudflare.com">
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
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
            html += ` 
            </div> <!-- close movie-grid -->
            <div style="display:flex; justify-content:center; align-items:center; height:60vh;">
                <h2 style="color:white; text-align:center;">No matches found for your filter criteria.</h2>
            </div>`;
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
                const escapedTitle = movieTitle.replace(/'/g, "\\'");
                const escapedGenres = genreText.replace(/'/g, "\\'");
                const isFav = favoriteIds.includes(String(movie.id).trim()) ? 'active' : '';
                const displayType = (movie.media_type === "tv") ? "TV Series" : "Movie";
                const isWatchlisted = watchlistIds.includes(String(movie.id).trim()) ? 'active' : '';

                html += `
                    <div class="movie-card" onclick="window.location.href='/media/${movie.media_type || normalizedType}/${movie.id}${nsfwFlag}'">
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
                        <div id="int-btns">
                            <button class="watchlist-btn ${isWatchlisted}" onclick="event.stopPropagation(); addWatchlist(this, '${escapedTitle}', '${releaseYear}', '${movie.id}', '${escapedGenres}', '${rating}', '${posterPath}', '${ageCertificate}', '${movie.media_type || normalizedType}')">
                                <span class="eye-icon"></span>
                            </button>
                            <button class="heart-btn ${isFav}" onclick="event.stopPropagation(); addFavorite(this, '${escapedTitle}', '${releaseYear}', '${movie.id}', '${escapedGenres}', '${rating}', '${posterPath}', '${ageCertificate}')">
                                <span class="heart-icon"></span>
                            </button>
                        </div>
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
                const isGuest = ${isGuest};

                async function addFavorite(btn, title, year, imdbId, genres, rating, image, certification) {
        
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
                
                async function addWatchlist(btn, title, year, imdbId, genres, rating, image, certification, mediaType) {
                    if (isGuest) {
                        alert("Please log in to use watchlist!");
                        window.location.href = "/users/login";
                        return;
                    }
                    btn.classList.toggle('active');
                    await fetch("/watchlist/add", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ title, year, imdbId, genres, rating, image, certification, mediaType})
                    });
                }

                window.addEventListener('pageshow', function(event) {
                    if (event.persisted) {
                        window.location.reload();
                    }
                });
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

        const [apiRes, favorites, watchlist] = await Promise.all([
            fetch(apiUrl, { method: 'GET', headers: { accept: 'application/json', Authorization: `Bearer ${process.env.TMDB_BEARER_TOKEN}` } }),
            fetchFavoritesFromDB(req.session.userId),
            fetchWatchlistFromDB(req.session.userId)
        ]);

        const apiData = await apiRes.json();
        const movies = apiData.results || [];
        const totalPages = Math.min(apiData.total_pages || 1, 500);
        const favoriteIds = favorites.map(f => String(f.imdbId).trim());
        const watchlistIds = watchlist.map(w => String(w.imdbId).trim());

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
                <link rel="preconnect" href="https://image.tmdb.org">
                <link rel="preconnect" href="https://fonts.googleapis.com">
                <link rel="preconnect" href="https://cdnjs.cloudflare.com">
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">

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
                html += ` 
                </div> <!-- close movie-grid -->
                <div style="display:flex; justify-content:center; align-items:center; height:60vh;">
                    <h2 style="color:white; text-align:center;">No matches found for your filter criteria.</h2>
                </div>`;
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
                    const isWatchlisted = watchlistIds.includes(movie.id.toString()) ? 'active' : '';
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
                            <div id="int-btns">
                                <button class="watchlist-btn ${isWatchlisted}" onclick="event.stopPropagation(); addWatchlist(this, '${escapedTitle}', '${releaseYear}', '${movie.id}', '${escapedGenres}', '${rating}', '${posterPath}', '${ageCertificate}', '${movie.media_type || normalizedType}')">
                                    <span class="eye-icon"></span>
                                </button>
                                <button class="heart-btn ${isFav}" onclick="event.stopPropagation(); addFavorite(this, '${escapedTitle}', '${releaseYear}', '${movie.id}', '${escapedGenres}', '${rating}', '${posterPath}', '${ageCertificate}')">
                                    <span class="heart-icon"></span>
                                </button>
                            </div>
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
            const isGuest = ${isGuest};

            async function addFavorite(btn, title, year, imdbId, genres, rating, image, certification) {
    
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
            
            async function addWatchlist(btn, title, year, imdbId, genres, rating, image, certification, mediaType) {
                if (isGuest) {
                    alert("Please log in to use watchlist!");
                    window.location.href = "/users/login";
                    return;
                }
                btn.classList.toggle('active');
                await fetch("/watchlist/add", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title, year, imdbId, genres, rating, image, certification, mediaType })
                });
            }

            window.addEventListener('pageshow', function(event) {
                if (event.persisted) {
                    window.location.reload();
                }
            });
         </script>
        </body>
        </html>`;

        res.send(html);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error reading data.");
    }
});

app.get("/airing", async (req,res)=>{
    const offsetDays = parseInt(req.query.offset) || 0;
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
    const geo = geoip.lookup(ip);
    const country = geo?.country || 'US';
    const timezone = geo?.timezone || 'America/New_York'

    const localDate = DateTime.now().setZone(timezone).plus({ days: offsetDays });
    const dateStr = localDate.toFormat('yyyy-MM-dd');
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
            <link rel="preconnect" href="https://image.tmdb.org">
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://cdnjs.cloudflare.com">
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
        </head>
        <body class="air-td-body">
            <nav class="navbar2">
                <span class="nav-title2">Shows Airing</span>
                <div class="nav-links2">
                    <a href="/" class="nav-item">Home</a>
                    <a href="/favorites" class="nav-item">Favorites</a>
                </div>
            </nav>
            <div class="main-cont-td">
                <div id="airDate">
                    <div class="airHeaders">
                        <h1 style="text-align: center; color: red;  animation: dropIn 0.4s ease-out forwards;">Airing Today</h1>
                        <h2 style="color: grey; font-size: 0.8rem; text-align:center">
                        Showing schedule for ${country}
                        </h2>
                    </div>
                    <h2><i>Check TBA section for other shows located all the way down</i></h2>
                    <div id="air-controls">
                        <button id="prev"><</button>
                        <h2 id="day-display"></h2>
                        <button id="next">></button>
                    </div>
                </div>
                <div class="airInfo">

    `
    const fetchTMDB = offsetDays === 0
    ? Promise.all([1, 2, 3].map(page =>
        fetch(`https://api.themoviedb.org/3/tv/airing_today?api_key=${process.env.TMDB_API_KEY}&language=en-US&page=${page}`).then(r => r.json())
      )).then(pages => ({ results: pages.flatMap(p => p.results || []) }))
    : Promise.resolve({ results: [] });

    const [network, web, tmdbAiring] = await Promise.all([
        fetch(`https://api.tvmaze.com/schedule?country=${country}&date=${dateStr}`).then(r => r.json()),
        fetch(`https://api.tvmaze.com/schedule/web?country=${country}&date=${dateStr}`).then(r => r.json()),
        fetchTMDB
    ]);

    const data = [...network, ...web];

    const seen = new Set();
    const ALLOWED_TYPES = ['Scripted', 'Animation', 'Reality', 'Documentary', 'Miniseries'];

    const shows = data.filter(entry => {
        const show = entry._embedded?.show ?? entry.show;
        if (!show || !ALLOWED_TYPES.includes(show.type)) return false;
        if (seen.has(show.id)) return false;
        seen.add(show.id);
        return true;
    });

    const tvmazeNames = new Set(shows.map(e => {
        const s = e._embedded?.show ?? e.show;
        return s?.name?.toLowerCase();
    }));

    const tmdbShows = await Promise.all(
        (tmdbAiring.results || [])
            .filter(s => !tvmazeNames.has(s.name?.toLowerCase()))
            .map(async s => {
                let airtime = "";
                try {
                    // Try to find it on TVmaze to get airtime
                    const mazeRes = await fetch(`https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(s.name)}&embed=nextepisode`);
                    const mazeData = await mazeRes.json();
                    airtime = mazeData?._embedded?.nextepisode?.airtime || "";
                } catch (_) {}

                return {
                    airtime,
                    _isTMDB: true,
                    show: {
                        id: `tmdb-${s.id}`,
                        name: s.name,
                        type: 'Scripted',
                        genres: (s.genre_ids || []).map(id => globalGenreMap[id]).filter(Boolean),
                        image: { medium: s.poster_path ? `https://image.tmdb.org/t/p/w185${s.poster_path}` : null },
                        network: { name: "Unknown" },
                        summary: s.overview || "",
                        _tmdbId: s.id
                    }
                };
            })
    );
    const allShows = [...shows, ...tmdbShows];

    const timeSlots = {};
    for (const entry of allShows) {
        const time = entry.airtime || "TBA";
        if (!timeSlots[time]) timeSlots[time] = [];
        timeSlots[time].push(entry);
    }

    const sortedTimes = Object.keys(timeSlots).sort();
    for (const time of sortedTimes) {
        html += `<div class="time-slot">
            <div class="time-label">${time || "TBA"}</div>
            <div class="time-slot-cards">`;

        for (const entry of timeSlots[time]) {
            const show = entry._embedded?.show ?? entry.show;
            const title = show?.name ?? "Unknown";
            const network = show?.network?.name ?? show?.webChannel?.name ?? "Unknown";
            const image = show?.image?.medium ?? '/images/icon.png';
            const genre = show?.genres?.join(", ") || "N/A";
            const summary = show?.summary?.replace(/<[^>]*>/g, "").slice(0, 80) ?? "";
            const tmdbId = show?._tmdbId;
            const href = tmdbId ? `/media/tv/${tmdbId}` : `/results?q=${encodeURIComponent(title)}`;

            html += `
            <div class="air-card" onclick="window.location.href='${href}'">
                <img src="${image}" alt="${title}">
                <div class="air-card-info">
                    <h3>${title}</h3>
                    <p><i class="fa-solid fa-satellite-dish"></i> ${network}</p>
                    <p><strong>Genre: </strong>${genre}</p>
                    <p class="air-summary"><strong>Summary:  </strong>${summary}...</p>
                </div>
            </div>`;
        }

        html += `</div></div>`;
    }

    html+=`
                </div>
            </div>
        <script>
            let weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            let offset = ${offsetDays}; ;

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
                window.location.href = '/airing?offset=' + offset;
            });

            document.getElementById('next').addEventListener('click', () => {
                offset++;
               window.location.href = '/airing?offset=' + offset;
            });

            updateDisplay();


        </script>
        </body>
    </html>`;

    res.send(html);
})

app.get("/anime", async (req, res) => {
    const isGuest = !(req.session && req.session.userId);
    const page = Number(req.query.page) || 1;
    const filter = req.query.filter || 'popular';
    const perPage = 20;
    const allowAdult = req.session.nsfw === true || req.query.nsfw === 'true';

    const sortMap = {
        popular: 'POPULARITY_DESC',
        top_rated: 'SCORE_DESC',
        airing: 'POPULARITY_DESC',
        movies: 'POPULARITY_DESC',
    };

    const isMovie = filter === 'movies';
    const isAiring = filter === 'airing';

    const anilistQuery = `
        query ($page: Int, $sort: [MediaSort])  {
            Page(page: $page, perPage: ${perPage}) {
                pageInfo { total currentPage lastPage hasNextPage }
                media(
                    type: ANIME,
                    sort: $sort,
                    ${isAiring ? 'status: RELEASING,' : ''}
                    ${isMovie ? 'format: MOVIE,' : 'format_in: [TV, TV_SHORT, ONA, OVA],'}
                    isAdult: ${allowAdult ? 'true' : 'false'}
                ) {
                    id
                    idMal
                    title { romaji english }
                    coverImage { large }
                    averageScore
                    genres
                    episodes
                    status
                    format
                    startDate { year }
                    description(asHtml: false)
                }
            }
        }
    `;

    const [aniRes, favorites, watchlist] = await Promise.all([
        fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: anilistQuery,
                variables: { page, sort: [sortMap[filter] || 'POPULARITY_DESC'] }
            })
        }),
        fetchFavoritesFromDB(req.session.userId),
        fetchWatchlistFromDB(req.session.userId)
    ]);

    const aniData = await aniRes.json();
    if (aniData.errors) console.log('AniList errors:', JSON.stringify(aniData.errors));

    const items = aniData.data?.Page?.media || [];
    const pageInfo = aniData.data?.Page?.pageInfo || {};
    const totalPages = pageInfo.lastPage || 1;

    const favoriteIds = favorites.map(f => String(f.imdbId).trim());
    const watchlistIds = watchlist.map(w => String(w.imdbId).trim());

    const filters = [
        { id: 'popular', label: '🔥 Popular' },
        { id: 'top_rated', label: '⭐ Top Rated' },
        { id: 'airing', label: '📡 Airing' },
        { id: 'movies', label: '🎬 Movies' },
    ];

    let html = `
    <!DOCTYPE html>
    <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Anime - SearchMovie</title>
            <link rel="icon" type="image/x-icon" href="/images/icon.png">
            <link rel="stylesheet" href="/css/style.css">
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
        </head>
        <body>
            <nav class="navbar2">
                <span class="nav-title2">🐉 Anime</span>
                <div class="nav-links2">
                    <a href="/" class="nav-item">Home</a>
                    <a href="/favorites" class="nav-item">Favorites</a>
                    <a href="/toggle-nsfw" class="nav-item" style="border:1px solid ${req.session.nsfw ? '#e50914' : '#555'}; border-radius:6px; padding:4px 10px; font-size:12px;">
                        🔞 NSFW Anime ${req.session.nsfw ? 'ON' : 'OFF'}
                    </a>
                </div>
            </nav>
            <div style="display:flex; gap:10px; flex-wrap:wrap; padding:77px 20px 0;">
                ${filters.map(f => `
                        <a href="/anime?filter=${f.id}${allowAdult ? '&nsfw=true' : ''}"
                        style="background:${filter === f.id ? '#e50914' : '#2a2a2a'}; color:white;
                               padding:8px 16px; border-radius:8px; text-decoration:none; font-size:14px;">
                        ${f.label}
                    </a>`).join('')}
            </div>
            <div class="movie-grid">`;

    for (const item of items) {
        const title = item.title.english || item.title.romaji || "Unknown";
        const releaseYear = item.startDate?.year || "N/A";
        const posterPath = item.coverImage?.large || '/images/icon.png';
        const rating = item.averageScore ? (item.averageScore / 10).toFixed(1) : "N/A";
        const genreText = (item.genres || []).slice(0, 3).join(", ") || "Anime";
        const escapedTitle = title.replace(/'/g, "\\'");
        const escapedGenres = genreText.replace(/'/g, "\\'");
        const nsfwParam = allowAdult ? '&nsfw=true' : '';
        const href = item.idMal
            ? `/results?q=${encodeURIComponent(item.title.romaji)}${nsfwParam}`
            : `/results?q=${encodeURIComponent(title)}${nsfwParam}`;
        const isFav = favoriteIds.includes(String(item.idMal)) ? 'active' : '';
        const isWatchlisted = watchlistIds.includes(String(item.idMal)) ? 'active' : '';
        const mediaTypeLabel = isMovie ? 'Movie' : 'TV Series';

        html += `
        <div class="movie-card" onclick="window.location.href='${href}'">
            <div class="poster-container">
                <span class="cert-badge PG">PG</span>
                <img src="${posterPath}" alt="${title}">
            </div>
            <h3>${title}</h3>
            <p>Year: ${releaseYear}</p>
            <p><strong>Genre:</strong> ${genreText}</p>
            <p><strong>Rating:</strong> ${rating}</p>
            <div class="movie-card-bottom-bar">
                <p><strong>Type:</strong> ${mediaTypeLabel}</p>
                <div id="int-btns">
                    <button class="watchlist-btn ${isWatchlisted}" onclick="event.stopPropagation(); addWatchlist(this, '${escapedTitle}', '${releaseYear}', '${item.idMal || item.id}', '${escapedGenres}', '${rating}', '${posterPath}', 'PG', 'tv')">
                        <span class="eye-icon"></span>
                    </button>
                    <button class="heart-btn ${isFav}" onclick="event.stopPropagation(); addFavorite(this, '${escapedTitle}', '${releaseYear}', '${item.idMal || item.id}', '${escapedGenres}', '${rating}', '${posterPath}', 'PG')">
                        <span class="heart-icon"></span>
                    </button>
                </div>
            </div>
        </div>`;
    }

    html += `</div>
    <div id="cntrl-btn">
        ${page > 1 ? `<a href="/anime?filter=${filter}&page=${page - 1}${allowAdult ? '&nsfw=true' : ''}" id="showLess">Previous</a>` : ''}
    <span id="txtPage">Page ${page} of ${totalPages}</span>
    ${pageInfo.hasNextPage ? `<a href="/anime?filter=${filter}&page=${page + 1}${allowAdult ? '&nsfw=true' : ''}" id="showMore">Next</a>` : ''}
    </div>
    <script>
        const isGuest = ${isGuest};
        async function addFavorite(btn, title, year, imdbId, genres, rating, image, certification) {
            if (isGuest) { alert("Please log in!"); window.location.href = "/users/login"; return; }
            btn.classList.toggle('active');
            await fetch("/favorites/add", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title, year, imdbId, genres, rating, image, certification })
            });
        }
        async function addWatchlist(btn, title, year, imdbId, genres, rating, image, certification, mediaType) {
            if (isGuest) { alert("Please log in!"); window.location.href = "/users/login"; return; }
            btn.classList.toggle('active');
            await fetch("/watchlist/add", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title, year, imdbId, genres, rating, image, certification, mediaType })
            });
        }
    </script>
    </body>
    </html>`;

    res.send(html);
});

app.get("/toggle-nsfw", (req, res) => {
    req.session.nsfw = !req.session.nsfw;
    res.redirect(req.get('referer') || '/');
});

app.get("/my-watchlist", redirectLogin, async (req, res) => {
    const watchlist = await fetchWatchlistFromDB(req.session.userId);

    let html = `
    <!DOCTYPE html>
    <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>My Watchlist</title>
            <link rel="stylesheet" href="/css/style.css">
            <link rel="icon" type="image/x-icon" href="/images/icon.png">
            <link rel="preconnect" href="https://image.tmdb.org">
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://cdnjs.cloudflare.com">
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
        </head>
        <body>
            <nav class="navbar2">
                <span class="nav-title2">My Watchlist</span>
                <div class="nav-links2">
                    <a href="/" class="nav-item">Home</a>
                    <a href="/favorites" class="nav-item">Favorites</a>
                </div>
            </nav>
            <div class="movie-grid">`;

    if (watchlist.length === 0) {
       html += `
        </div> <!-- -->
        <div style="display:flex; justify-content:center; align-items:center; height:60vh;">
            <h2 style="color:white; text-align:center;">Your watchlist is empty. Start adding shows and movies!</h2>
        </div>`;
    } else {
        for (const item of watchlist) {
            const certClass = (item.certification || "PG-13").replace(/[^a-zA-Z0-9]/g, '-');
            html += `
            <div class="movie-card" onclick="window.location.href='/media/${item.mediaType || 'movie'}/${item.imdbId}'">
                <div class="poster-container">
                    <span class="cert-badge ${certClass}">${item.certification || "PG-13"}</span>
                    <img src="${item.image}" alt="${item.title}">
                    ${item.watched ? `<span class="watched-badge">✓ Watched</span>` : ''}
                </div>
                <h3>${item.title}</h3>
                <p>Year: ${item.year || "N/A"}</p>
                <p><strong>Genre:</strong> ${item.genres || "N/A"}</p>
                <p><strong>Rating:</strong> ${item.rating || "N/A"}</p>
                <div class="movie-card-bottom-bar-watch-page">
                    <button class="watched-btn ${item.watched ? 'active' : ''}" onclick="event.stopPropagation(); markWatched(this, '${item.imdbId}')">
                        ${item.watched ? '✓ Watched' : 'Mark Watched'}
                    </button>
                    <button class="remove-btn" onclick="event.stopPropagation(); removeFromWatchlist(this, '${item.imdbId}')">✕</button>
                </div>
            </div>`;
        }
    }

    html += `</div>
        <script>
            async function markWatched(btn, imdbId) {
                const res = await fetch('/watchlist/watched/' + imdbId, { method: 'POST' });
                const data = await res.json();
                if (data.watched) {
                    btn.classList.add('active');
                    btn.textContent = '✓ Watched';
                } else {
                    btn.classList.remove('active');
                    btn.textContent = '👁 Mark Watched';
                }
            }

            async function removeFromWatchlist(btn, imdbId) {
                await fetch('/watchlist/add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ imdbId })
                });
                btn.closest('.movie-card').remove();
            }
        </script>
        </body>
    </html>`;

    res.send(html);
});


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