const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const puppeteer = require('puppeteer');
const router = express.Router();
const { fetchFavoritesFromDB, fetchWatchlistFromDB } = require("../misc/db.js");

const detailGenreMap = {
    28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
    80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
    14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
    96: "Mystery", 10749: "Romance", 878: "Sci-Fi", 53: "Thriller",
    10752: "War", 37: "Western", 10759: "Action & Adventure", 10765: "Sci-Fi & Fantasy"
};

async function tryScrape(title, type) {
    const normalizedTitle = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const cleanTitle = normalizedTitle.toLowerCase()
        .replace(/'/g, '')
        .replace(/[^a-z0-9]+/g, '_');
    const finalSlug = cleanTitle.replace(/_+$/, '');

    let browser;
    try {
        browser = await puppeteer.launch({ 
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        
        const prefix = (type === 'tv') ? 'tv' : 'm';
        const url = `https://www.rottentomatoes.com/${prefix}/${finalSlug}`;
        console.log("Navigating to: ", url);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });

        const score = await page.evaluate(() => {
            const scoreBoard = document.querySelector('rt-score-board');
            if (scoreBoard && scoreBoard.getAttribute('critics-score')) {
                return scoreBoard.getAttribute('critics-score') + '%';
            }

            const scoreElement = document.querySelector('rt-text[slot="critics-score"]');
            if (scoreElement && scoreElement.textContent.trim()) {
                return scoreElement.textContent.trim();
            }

            return "N/A";

        });

        await browser.close();
        return score;
    } catch (err) {
        if (browser) await browser.close();
        console.error("Puppeteer scraping failed:", err.message);
        return "N/A";
    }
}

async function tryOMDB(title){
    try {
        const apiKey = process.env.OMDB_API_KEY;
        const url = `https://www.omdbapi.com/?t=${encodeURIComponent(title)}&apikey=${apiKey}`;
        const response = await axios.get(url);
        
        const rtRating = response.data.Ratings?.find(r => r.Source === "Rotten Tomatoes");
        console.log(rtRating ? rtRating.Value : "N/A");
        return rtRating ? rtRating.Value : "N/A";
    } catch (err) {
        console.error("OMDb API fallback failed:", err.message);
        return "N/A";
    }
}

async function getRottenTomatoesScore(title, type) {
    const scraperResult = await tryScrape(title, type);
    
    if (scraperResult !== "N/A") {
        console.log("Scraper Result: ", scraperResult);
        return scraperResult;
    }

    console.log(`Scraper returned N/A or failed for ${title}, trying OMDb API...`);
    return await tryOMDB(title);
}

router.get("/api/season", async (req, res) => {
    const { id, season } = req.query;
    const api_key = process.env.TMDB_API_KEY;
    try {
        const r = await fetch(`https://api.themoviedb.org/3/tv/${id}/season/${season}?api_key=${api_key}`,
            { headers: { 'Authorization': `Bearer ${process.env.TMDB_BEARER_TOKEN}` } });
        const data = await r.json();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch season" });
    }
});

router.get("/api/score", async (req, res) => {
    const { title, type } = req.query;
    try {
        const score = await getRottenTomatoesScore(title, type);
        res.json({ score });
    } catch (err) {
        res.json({ score: "N/A" });
    }
});
                    
router.get("/:type/:id", async (req,res)=>{
    const { type, id } = req.params;
    const api_key = process.env.TMDB_API_KEY;
    const isGuest = !(req.session && req.session.userId);
    const allowAdult = req.session.nsfw === true || req.query.nsfw === 'true';
    
    function getBingeBoxUrl(imdbId) {
        if (!imdbId) return [];
        
        let urlType = type;
        if(urlType === "tv"){
            urlType = "show";
        }
        const patternStandard = `https://bingebox.to//${urlType}/${id}`;
        return [
            { name: "BingeBox", url: patternStandard }
        ];
    }

    function getHindiLink(title, year) {
        const slug = title
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .trim()
            .replace(/\s+/g, '-');
        
        return `https://yomovies.courses/${slug}-${year}-Watch-online-full-movie/`;
    }

    function getAsiaFlixLink(title, year) {
        const slug = title
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .trim()
            .replace(/\s+/g, '-');

        return `https://asiaflix.net/drama/${slug}`;
    }

    function getKissKhSearchLink(title) {
       const query = encodeURIComponent(`site:kisskh.co ${title}`);
        return `https://www.google.com/search?q=${query}`;
    }

    function getMovieLinkBd(title){
        const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .trim()
        .replace(/\s+/g, '+');

        return `https://yr7prg.movielinkbd.li/search?q=${slug}`;
    }

    function getAnimeLink(title) {
        const query = encodeURIComponent(title);
        return `https://anisuge.tv/filter?keyword=${query}`;
    }

    function getAnimeLink2(title){
        const query = encodeURIComponent(title);
        return `https://anizone.to/anime?search=${query}`;
    }

    let malId = null;
    let animeGenres = [];
    let malEpisodeCount = null;

    try{
        const [detailsRes, providersRes, videoRes] = await Promise.all([
        fetch(`https://api.themoviedb.org/3/${type}/${id}?api_key=${api_key}&language=en-US&append_to_response=external_ids`, { headers: { 'Authorization': `Bearer ${process.env.TMDB_BEARER_TOKEN}` } }),
        fetch(`https://api.themoviedb.org/3/${type}/${id}/watch/providers?api_key=${api_key}&append_to_response=external_ids`, { headers: { 'Authorization': `Bearer ${process.env.TMDB_BEARER_TOKEN}` } }),
        fetch(`https://api.themoviedb.org/3/${type}/${id}/videos?api_key=${api_key}`, { headers: { 'Authorization': `Bearer ${process.env.TMDB_BEARER_TOKEN}` } })
        ]);

        const data = await detailsRes.json();
        const providerData = await providersRes.json();

        const videoData = await videoRes.json();
        const trailer = videoData.results.find(v => v.type === "Trailer" && v.site === "YouTube");

        const [favorites, watchlist] = await Promise.all([
            fetchFavoritesFromDB(req.session.userId),
            fetchWatchlistFromDB(req.session.userId)
        ]);
        const isFav = favorites.some(f => String(f.imdbId).trim() === String(id).trim()) ? 'active' : '';
        const isWatchlisted = watchlist.some(w => String(w.imdbId).trim() === String(id).trim()) ? 'active' : '';

        const title = data.title || data.name || "Unknown";
        const escapedTitle = title.replace(/'/g, "\\'");
        const dateString = data.release_date || data.first_air_date || "";
        const year = (data.release_date || data.first_air_date || "").substring(0, 4) || "0000";        
        const rating = data.vote_average ? Number(data.vote_average).toFixed(1) : "N/A";
        const rtScore = "Loading...";        
        const overview = data.overview || "No overview available.";
        const tagline = data.tagline ? `"${data.tagline}"` : "";
        const lang = data.original_language;

        const posterPath = data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : '/images/icon.png';
        const backdropPath = data.backdrop_path ? `https://image.tmdb.org/t/p/original${data.backdrop_path}` : '';

        let durationText = "N/A";
        if (type === "movie" && data.runtime) {
            const hours = Math.floor(data.runtime / 60);
            const minutes = data.runtime % 60;
            durationText = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
        } else if (type === "tv" && data.number_of_seasons) {
            durationText = `${data.number_of_seasons} Season${data.number_of_seasons > 1 ? 's' : ''}`;
        }

        const providers = providerData.results?.US?.flatrate || [];
        let watchHtml = providers.length > 0 
            ? providers.map(p => `<img src="https://image.tmdb.org/t/p/w92${p.logo_path}" alt="${p.provider_name}" title="${p.provider_name}" class="provider-logo">`).join('')
            : "<p>Not available to stream in your region.</p>";
       

        if (!detailsRes.ok) {
            return res.status(detailsRes.status).send("<h2>Failed to fetch details from TMDB.</h2>");
        }

        const searchSlug = title.toLowerCase().replace(/\s+/g, '-').replace(/(^-|-$)/g, '');
        const mediaType = type === 'tv' ? 'tvshows' : 'movies';

        const imdbId = data.external_ids?.imdb_id;
        const bingeboxLink = getBingeBoxUrl(imdbId);
        let links = [
            { name: "123 Chill", url: `https://123chill.in/${mediaType}/${searchSlug}/` },
            {name: "CoreFlix", url: `https://www.coreflix.tv/${type}/${id}`},
            {name: "Lunara", url: `https://lunara.watch/${type}/${id}`},
            {name: "CineBy", url: `https://www.cineby.at/${type}/${id}?`},
            ...bingeboxLink
        ];

        const isHindi = data.spoken_languages?.some(lang => lang.iso_639_1 === "hi");
        if (isHindi) {
            links.splice(0,1);
            links.splice(1,1);
            links.push({ name: "YoMovies", url: getHindiLink(title, year) });
        }

        const isKorean = ((data.origin_country?.includes("KR") || data.original_language === "ko") || (data.origin_country?.includes("CN") || data.original_language === "zh-Hant") ||  
        (data.origin_country?.includes("CN") || data.original_language === "zh"));

        if (isKorean) {
            links.push({ 
                name: "AsiaFlix", 
                url: getAsiaFlixLink(title, year) 
            });
            links.push({ 
                name: "⭐️ KissKH (Search)", 
                url: getKissKhSearchLink(title) 
            });
        }

        const isBengali = data.spoken_languages?.some(lang => lang.iso_639_1 === "bn");
        if (isBengali) {
            links.push({ 
                name: "⭐️ MovieLink BD", 
                url: getMovieLinkBd(title) 
            });
        }

        const isAnime = data.genres?.some(g => g.name === "Animation") && data.original_language === "ja";

        if (isAnime) {
            links = [];

             links.push({
                name: "⭐️ AniZone",
                url: getAnimeLink2(title)
            })

             links.push({ 
                name: "🥈 AniSuge", 
                url: getAnimeLink(title) 
            });

            links.push({
                name: "Cineby",
                url: `https://www.cineby.sc/${type}/${id}`
            });

            links.push({
                name: "Anime Websites list",
                url: `https://yarrlist.net/anime-list`
            })
        }

       if (isAnime) {
            try {
                const query = `
                    query ($search: String) {
                        Media(search: $search, type: ANIME) {
                            id
                            idMal
                            episodes
                            genres
                            isAdult
                            title {
                                romaji
                                english
                            }
                        }
                    }
                `;
                const malRes = await fetch('https://graphql.anilist.co', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query, variables: { search: title } })
                });
                const malData = await malRes.json();
                const media = malData.data?.Media;
                if (!allowAdult && media && (media.isAdult || media.genres.some(g => g.toLowerCase() === 'hentai'))) {
                    console.log(`Blocking adult content: ${title}`);
                    return res.status(404).send(`
                        <!DOCTYPE html>
                        <html>
                            <head>
                                <meta charset="utf-8">
                                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                                <link rel="stylesheet" href="/css/media.css">
                                <link rel="icon" type="image/x-icon" href="/images/icon.png">
                            </head>
                            <body class="restrict-body">
                                <div class="restrict-container">
                                    <h2 style="color: white; margin-top: 20px;">Content restricted — turn on the NSFW button on the anime page to view it.</h2>
                                    <a href="/anime"><button id="animePageBtn">Go To Anime Page</button></a>
                                </div>
                            </body>
                        </html>
                        `); 
                }
                malId = media?.idMal || null;
                animeGenres = media?.genres || [];
                malEpisodeCount = media?.episodes || null;
                console.log(`MAL ID for ${title}:`, malId);
            } catch {
                malId = null;
            }
        }

        let genresText = "Unknown";

        const rawGenres = data.genres || [];
        const rawGenreIds = data.genre_ids || [];

        if (rawGenres.length > 0) {
            let genreNames = rawGenres.map(g => g.name);
            
            if (isAnime) {
                genreNames = genreNames.filter(name => name.toLowerCase() !== "animation");
            }
            genresText = genreNames.join(", ");
        } else if (rawGenreIds.length > 0) {
            let genreNames = rawGenreIds.map(id => detailGenreMap[id]).filter(Boolean);
            
            if (isAnime) {
                genreNames = genreNames.filter(name => name.toLowerCase() !== "animation");
            }
            genresText = genreNames.join(", ");
        }


       const secretLinksHtml = links.map(link => 
            `<li><a href="${link.url}" target="_blank" rel="noopener noreferrer" class="secret-link">${link.name}</a></li>`
        ).join('');

        let ageCertificate = "PG-13"; // Default
        const rRatedGenres = [27, 80, 53]; 
        const familyGenres = [16, 10751];

        const isMatureGenre = data.genres && data.genres.some(g => rRatedGenres.includes(g.id));
        const isFamilyGenre = data.genres && data.genres.some(g => familyGenres.includes(g.id));

        if (isMatureGenre) {
            ageCertificate = "R";
        } else if (isFamilyGenre) {
            ageCertificate = "PG";
        } else if (data.genres && data.genres.some(g => g.name === "Romance")) {
            ageCertificate = "PG-13";
        }

        const certClass = ageCertificate.replace(/[^a-zA-Z0-9]/g, '-');
        console.log("Final Genres Text:", genresText);
        res.send(`
            <!DOCTYPE hmtl>
            <html>
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <link rel="stylesheet" href="/css/media.css">
                    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
                    <link rel="icon" type="image/x-icon" href="/images/icon.png">
                    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
                    <title>${title} (${year}) - SearchMovie</title>
                    <style>
                        .details-hero {
                            position: relative;
                            width: 100%;
                            min-height: calc(100vh - 70px);
                            background: linear-gradient(rgba(0, 0, 0, 0.85), rgb(24 20 20 / 85%)), url('${backdropPath}');
                            background-size: cover;
                            background-position: center;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            padding: 40px 20px;
                            color: white;
                            box-sizing: border-box;
                        }
                    </style>
                </head>
                <body>
                    <nav class="navbar">
                        <a href="/" id="titleLink">
                            <span class="nav-title">SearchMovie</span>
                        </a>
                        <div class="nav-links">
                            <button onclick="window.history.back()" class="nav-item" style="background:none; border:none; cursor:pointer;">
                                ⬅ Back
                            </button>
                            <a href="/" class="nav-item">Home</a>
                            <a href="/favorites" class="nav-item">Favorites</a>
                        </div>
                    </nav>

                    <div class="details-hero">
                        <div class="details-container">
                            <div class="details-left">
                                <img src="${posterPath}" alt="${title} Poster" class="details-poster">
                            </div>
                            
                            <div class="details-right">
                               <div style="display: flex; align-items: center; gap: 15px;">
                                    <h1 class="details-title">${title} <span class="details-year">(${year})</span></h1>
                                    <div id="int-btns">
                                        <button class="watchlist-btn ${isWatchlisted}" onclick="addWatchlist(this, '${escapedTitle}', '${year}', '${id}', '${genresText.replace(/'/g, "\\'")}', '${rating}', '${posterPath}', 'PG')">
                                            <span class="eye-icon"></span>
                                        </button>
                                        <button class="heart-btn ${isFav}" onclick="addFavorite(this, '${escapedTitle}', '${year}', '${id}', '${genresText.replace(/'/g, "\\'")}', '${rating}', '${posterPath}', 'PG')">
                                            <span class="heart-icon"></span>
                                        </button>
                                    </div>
                                </div>
                                
                                <div class="details-meta">
                                    <span class="cert-badge ${certClass}">${ageCertificate}</span>
                                    <span class="meta-badge">${type === 'movie' ? 'Movie' : 'TV Show'}</span>
                                    <span>• ${dateString || "N/A"}</span>
                                    ${isAnime ? "" : `<span>• ${genresText}</span>`}
                                    ${isAnime ? `<div class="anime-tags">•
                                        ${animeGenres.map(g => `<span class="badge" style="font-size: 1rem;">${g}</span>`).join(", ")}
                                    </div>` : ""}
                                    <span>• ${durationText}</span>
                                </div>

                                <div class="score-container">
                                    <div class="score-circle"><img src="/images/star.png" id="star-icon">${rating}</div>
                                    <span class="score-label">User Score</span>
                                    <span class="score-label"><svg height="50px" width="30px" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 65.636 65.636" xml:space="preserve" fill="#000000"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <g> <g> <path style="fill:#008218;" d="M33.487,26.488c0,0,2.424-16.17-12.936-20.617C20.553,5.871,18.127,21.636,33.487,26.488z"></path> </g> <g> <path style="fill:#008218;" d="M32.797,26.488c0,0-2.425-16.17,12.936-20.617C45.731,5.871,48.158,21.636,32.797,26.488z"></path> </g> <g> <path style="fill:#008218;" d="M33.307,24.332c0,0-10.406-12.61,0.47-24.332C33.777,0,43.976,12.264,33.307,24.332z"></path> </g> <g> <path style="fill:#FF4A44;" d="M62.433,38.623c0,14.919-13.26,27.013-29.616,27.013c-16.358,0-29.615-12.094-29.615-27.013 c0-11.921,7.154-21.461,19.236-23.671c5.822-1.064,10.379,3.492,10.379,3.492s4.197-4.353,9.762-3.58 C54.296,16.491,62.433,25.568,62.433,38.623z"></path> </g> </g> </g></svg>
                                     RT:</span>
                                    <span class="score-circle" id="rt-score-display">${rtScore}</span>
                                </div>

                                <p class="details-tagline"><em>${tagline}</em></p>
                                
                                <h3 class="overview-heading">Overview</h3>
                                <p class="details-overview">${overview}</p>

                                ${trailer 
                                    ? `<button class="trailer-btn" onclick="openTrailer('${trailer.key}')">▶ Watch Trailer</button>` 
                                    : `<p>No trailer available.</p>`
                                }

                                <button class="trailer-btn" onclick="openPlayer()">▶ Watch</button>
                                
                                <div id="trailerModal" class="modal">
                                    <div class="modal-content">
                                        <span class="close" onclick="closeTrailer()">&times;</span>
                                        <div id="player"></div>
                                    </div>
                                </div>


                                <div id="playerModal" class="modal">
                                    <div class="modal-content" id="player-content">
                                        <div id="player-title-box">
                                            <h3 id="player-title">Now Playing</h3>
                                            <span class="close" onclick="closePlayer()" id="closeBtn">&times;</span>
                                        </div>

                                        <div style="position:relative;">
                                            <div id="vidlink-player"></div>
                                            <button id="skip-btn" onclick="skipIntro()"
                                                style="display:none; position:absolute; bottom:60px; right:16px;
                                                    background:rgba(0,0,0,0.8); color:white; border:2px solid white;
                                                    padding:8px 16px; border-radius:6px; cursor:pointer; font-size:13px; z-index:10;">
                                                ⏭ Skip Intro
                                            </button>
                                        </div>

                                        <div id="season-episode-picker" style="display:none;">
                                            <div id="season-episode-box">
                                                <select id="season-select" onchange="handleSeasonChange(this.value)">
                                                </select>
                                                <span style="color:#aaa; font-size:13px;" id="episode-count"></span>
                                            </div>
                                            <div id="episode-grid"></div>
                                        </div>
                                    </div>
                                </div>

                                
                                <h3 class="overview-heading">Where to Watch</h3>
                                <div class="watch-providers">
                                    ${watchHtml}
                                </div>

                                <label class="switch">
                                    <input class="toggle" type="checkbox" id="secretToggle"/>
                                    <span class="slider"></span>
                                    <span class="card-side"></span>
                                </label>

                                <div class="secret-div" id="secretDiv" style="display: none;">
                                    <h3 class="overview-heading2">🤫 Revealed! You found the secret.</h3>
                                    <p>Here's some secret links</p>
                                    <p>(Ad Blocker is recommended or use a browser that has one like: Brave)
                                    <div id="links-container">
                                        <ul class="secret-link-list">
                                            ${secretLinksHtml}</li>
                                        </ul>
                                    </div>
                                </div>                            
                            </div>
                        </div>
                    </div>
                </body>
                <script>
                   const toggle = document.getElementById('secretToggle');
                   const secretDiv = document.getElementById('secretDiv');

                    toggle.addEventListener('change', function() {
                        secretDiv.style.display = this.checked ? 'block' : 'none';
                    });

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

                        
                        console.log("Favorite status updated: " + isActive);
                    }

                    async function addWatchlist(btn, title, year, imdbId, genres, rating, image, certification) {
                        const isGuest = ${isGuest};
                        if (isGuest) {
                            alert("Please log in to use watchlist!");
                            window.location.href = "/users/login";
                            return;
                        }
                        btn.classList.toggle('active');
                        await fetch("/watchlist/add", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ title, year, imdbId, genres, rating, image, certification })
                        });
                    }

                    function openTrailer(key) {
                        const modal = document.getElementById('trailerModal');
                        const player = document.getElementById('player');
                        player.innerHTML = '<iframe width="100%" height="400" src="https://www.youtube.com/embed/' + key + '" frameborder="0" allowfullscreen></iframe>';                        
                        modal.style.display = "flex";
                    }

                    function closeTrailer() {
                        document.getElementById('trailerModal').style.display = "none";
                        document.getElementById('player').innerHTML = ""; // Stops the video
                    }

                    window.addEventListener('DOMContentLoaded', () => {
                        const title = '${escapedTitle}';
                        const type = '${type}';
                        
                        fetch('/media/api/score?title=' + encodeURIComponent(title) + '&type=' + type)
                            .then(response => response.json())
                            .then(data => {
                                document.getElementById('rt-score-display').innerText = data.score;
                            })
                            .catch(() => {
                                document.getElementById('rt-score-display').innerText = "N/A";
                            });
                    });

                    window.addEventListener('pageshow', function(event) {
                        if (event.persisted || performance.getEntriesByType('navigation')[0]?.type === 'back_forward') {
                            window.location.reload();
                        }
                    });

                    let currentShowId = '${id}';
                    let currentType = '${type}';
                    let currentSource = 'vidlink';
                    let currentSubDub = 'sub';
                    let currentSeason = null;
                    let usingTmdbFallback = false;
                    let currentEpisode = null;
                    const currentTitle = '${escapedTitle}';
                    const currentImdbId = '${imdbId || ''}';
                    const malId = ${malId || 'null'};
                    const isAnime = ${isAnime ? 'true' : 'false'};
                    const malEpisodeCount = ${malEpisodeCount || 'null'};
                    const seasonsData = ${JSON.stringify((data.seasons || []).filter(s => s.season_number > 0))};
                    const tmdbTotalEpisodes = seasonsData.reduce((sum, s) => sum + (s.episode_count || 0), 0);
                    const isFranchiseSplit = malEpisodeCount && tmdbTotalEpisodes > malEpisodeCount * 1.5;
                    const useMalPlayer = isAnime && malId && !isFranchiseSplit;




                    function openPlayer() {
                        currentSource = 'vidlink';
                        currentSubDub = 'sub';
                        document.getElementById('playerModal').style.display = 'flex';
                        if (currentType === 'movie') {
                            document.getElementById('player-title').innerText = currentTitle;
                            document.getElementById('season-episode-picker').style.display = 'none';
                            renderIframe(getMovieSrc(currentSource));
                        } else {
                            document.getElementById('season-episode-picker').style.display = 'block';
                            document.getElementById('vidlink-player').innerHTML =
                                renderSwitcher() +
                                \`<div style="height:180px; display:flex; align-items:center; justify-content:center; color:#777; background:#111; border-radius:8px; font-size:14px;">
                                    Select an episode below to start watching
                                </div>\`;
                            loadSeasons();
                        }
                    }

                   function getMovieSrc(source) {
                        if (source === 'vidsrcembed') return \`https://vidsrc-embed.ru/embed/movie/\${currentImdbId}\`;
                        if (source === 'videasy') return \`https://player.videasy.net/movie/\${currentShowId}\`;
                        if (source === 'multiembed') return \`https://multiembed.mov/?video_id=\${currentShowId}&tmdb=1\`;

                        return \`https://vidlink.pro/movie/\${currentShowId}\`;
                    }

                   function getEpisodeSrc(source, season, episode) {
                        if (useMalPlayer) {
                            return \`https://megaplay.buzz/stream/mal/\${malId}/\${episode}/\${currentSubDub}\`;
                        }

                        if (source === 'vidsrcembed') return \`https://vidsrc-embed.ru/embed/tv/\${currentImdbId}/\${season}-\${episode}\`;
                        if (source === 'videasy') return \`https://player.videasy.net/tv/\${currentShowId}/\${season}/\${episode}\`;
                        if (source === 'multiembed') return \`https://multiembed.mov/?video_id=\${currentShowId}&tmdb=1&s=\${season}&e=\${episode}\`;
                        return \`https://vidlink.pro/tv/\${currentShowId}/\${season}/\${episode}\`;
                    }

                    function renderSwitcher() {
                        if (useMalPlayer) {
                            return \`
                                <div id="server-box">
                                    <p style="color:#aaa; font-size:12px; margin:0 0 8px; text-transform:uppercase; letter-spacing:1px;">
                                        <i class="fa-solid fa-language" style="margin-right:6px; color:#e50914;"></i>Audio
                                    </p>
                                    \${['sub', 'dub'].map(t => \`
                                        <button class="serverBtn" onclick="switchSource('\${t}')"
                                            style="background:\${currentSubDub === t ? '#e50914' : '#2a2a2a'};">
                                            \${t === 'sub' ? 'Sub' : 'Dub'}
                                        </button>\`).join('')}
                                </div>\`;
                        }
                        const sources = [
                            { id: 'vidlink', label: 'Server 1' },
                            { id: 'videasy', label: 'Server 2' },
                            ...(currentImdbId ? [{ id: 'vidsrcembed', label: 'Sever 3' }] : []),
                            { id: 'multiembed', label: 'Server 4' },
                        ];
                        return \`
                        <div id="server-box">
                                \${sources.map(s => \`
                                    <button class="serverBtn" onclick="switchSource('\${s.id}')" 
                                    style="background:\${currentSource === s.id ? '#e50914' : '#2a2a2a'};">
                                    <i class="fa-solid fa-server" style="margin-right:6px;"></i>\${s.label}
                                    </button>\`).join('')}
                            </div>\`;
                    }

                    function renderIframe(src) {
                        document.getElementById('vidlink-player').innerHTML =
                            renderSwitcher() +
                            \`<iframe width="100%" height="450" src="\${src}" frameborder="0" allowfullscreen referrerpolicy="origin"></iframe>\`;
                    }

                   function switchSource(source) {
                        if (useMalPlayer) {
                            currentSubDub = source;
                            if (currentEpisode) {
                                renderIframe(getEpisodeSrc(null, null, currentEpisode));
                            } else {
                                document.getElementById('vidlink-player').innerHTML =
                                    renderSwitcher() +
                                    \`<div style="height:180px; display:flex; align-items:center; justify-content:center; color:#777; background:#111; border-radius:8px; font-size:14px;">
                                        Select an episode below to start watching
                                    </div>\`;
                            }
                            return;
                        }

                        currentSource = source;

                        if (currentType === 'movie') {
                            renderIframe(getMovieSrc(source));
                        } else if (currentSeason && currentEpisode) {
                            document.getElementById('player-title').innerText =
                                \`\${currentTitle} — S\${String(currentSeason).padStart(2,'0')}E\${String(currentEpisode).padStart(2,'0')}\`;
                            renderIframe(getTmdbEpisodeSrc(source, currentSeason, currentEpisode));
                        } else {
                            document.getElementById('vidlink-player').innerHTML =
                                renderSwitcher() +
                                \`<div style="height:180px; display:flex; align-items:center; justify-content:center; color:#777; background:#111; border-radius:8px; font-size:14px;">
                                    Select an episode below to start watching
                                </div>\`;
                        }
                    }

                    async function loadSeasons() {
                        const seasons = ${JSON.stringify((data.seasons || []).filter(s => s.season_number > 0))};
                        const select = document.getElementById('season-select');
                        select.innerHTML = seasons.map(s => {
                            const defaultName = 'Season ' + s.season_number;
                            const label = (s.name && s.name !== defaultName) ? s.name : defaultName;
                            return \`<option value="\${s.season_number}">\${label} (\${s.episode_count} eps)</option>\`;
                        }).join('');
                        if (seasons.length > 0) handleSeasonChange(seasons[0].season_number);
                    }
                        
                    async function handleSeasonChange(seasonNum) {
                        document.getElementById('episode-count').innerText = '';
                        document.getElementById('episode-grid').innerHTML =
                            \`<div style="color:#aaa; grid-column:1/-1; text-align:center; padding:30px;">Loading...</div>\`;
                        const res = await fetch(\`/media/api/season?id=\${currentShowId}&season=\${seasonNum}\`);
                        const data = await res.json();
                        renderEpisodes(data.episodes || [], seasonNum);
                    }

                    function renderEpisodes(episodes, seasonNum) {
                        document.getElementById('episode-count').innerText = \`\${episodes.length} episodes\`;
                        document.getElementById('episode-grid').innerHTML = episodes.map(ep => {
                            const thumb = ep.still_path
                                ? \`https://image.tmdb.org/t/p/w300\${ep.still_path}\`
                                : '/images/icon.png';
                            const name = ep.name || \`Episode \${ep.episode_number}\`;
                            const overview = ep.overview
                                ? ep.overview.substring(0, 75) + (ep.overview.length > 75 ? '...' : '')
                                : 'No description.';
                            const rating = ep.vote_average ? Number(ep.vote_average).toFixed(1) : 'N/A';
                            const airDate = ep.air_date ? ep.air_date.substring(0, 7) : '';

                            return \`
                                <div class="episode-card" onclick="playEpisode(\${seasonNum}, \${ep.episode_number})">
                                    <div style="position:relative;">
                                        <img src="\${thumb}" alt="\${name}" class="episode-thumb">
                                        <div class="episode-overlay">
                                            <span style="font-size:26px;">▶</span>
                                        </div>
                                        <span class="episode-badge left">E\${ep.episode_number}</span>
                                        <span class="episode-badge right">⭐ \${rating}</span>
                                    </div>
                                    <div class="episode-info">
                                        <p class="episode-title">\${name}</p>
                                        \${airDate ? \`<p class="episode-date">\${airDate}</p>\` : ''}
                                        <p class="episode-overview">\${overview}</p>
                                    </div>
                                </div>\`;
                        }).join('');
                    }

                    function playEpisode(season, episode) {
                        currentSeason = season;
                        currentEpisode = episode;

                        if (useMalPlayer) {
                            const prevSeasons = seasonsData.filter(s => s.season_number < season);
                            const prevEpisodeCount = prevSeasons.reduce((sum, s) => sum + (s.episode_count || 0), 0);
                            const absoluteEpisode = prevEpisodeCount + episode;

                            fetchSkipTimes(absoluteEpisode);
                            document.getElementById('player-title').innerText =
                                currentTitle + ' — S' + String(season).padStart(2,'0') + 'E' + String(episode).padStart(2,'0');
                            renderIframe(getEpisodeSrc(currentSource, season, absoluteEpisode));
                        } else {
                            const skipBtn = document.getElementById('skip-btn');
                            if (skipBtn) skipBtn.style.display = 'none';
                            document.getElementById('player-title').innerText =
                                currentTitle + ' — S' + String(season).padStart(2,'0') + 'E' + String(episode).padStart(2,'0');
                            renderIframe(getTmdbEpisodeSrc(currentSource, season, episode));
                        }

                        document.getElementById('player-content').scrollTop = 0;
                    }

                    function closePlayer() {
                        document.getElementById('playerModal').style.display = 'none';
                        document.getElementById('vidlink-player').innerHTML = '';
                        currentSeason = null;
                        currentEpisode = null;
                    }

                    function getTmdbEpisodeSrc(source, season, episode) {
                        if (source === 'vidsrcembed') return \`https://vidsrc-embed.ru/embed/tv/\${currentImdbId}/\${season}-\${episode}\`;
                        if (source === 'videasy') return \`https://player.videasy.net/tv/\${currentShowId}/\${season}/\${episode}\`;
                        if (source === 'multiembed') return \`https://multiembed.mov/?video_id=\${currentShowId}&tmdb=1&s=\${season}&e=\${episode}\`;
                        return \`https://vidlink.pro/tv/\${currentShowId}/\${season}/\${episode}\`;
                    }

                    async function fetchSkipTimes(episodeNum) {
                        const skipBtn = document.getElementById('skip-btn');
                        if (skipBtn) skipBtn.style.display = 'none';
                        try {
                            const res = await fetch(\`https://api.aniskip.com/v2/skip-times/\${malId}/\${episodeNum}?types[]=op&types[]=ed&episodeLength=0\`);
                            const data = await res.json();
                            if (data.found) {
                                const op = data.results?.find(r => r.skipType === 'op');
                                if (op) {
                                    const btn = document.getElementById('skip-btn');
                                    if (btn) {
                                        btn.style.display = 'block';
                                        btn.dataset.start = op.interval.startTime;
                                        btn.dataset.end = op.interval.endTime;
                                        btn.innerText = '⏭ Skip Intro';
                                    }
                                }
                            }
                        } catch {
                            const b = document.getElementById('skip-btn');
                            if (b) b.style.display = 'none';
                        }
                    }

                    function skipIntro() {
                        const btn = document.getElementById('skip-btn');
                        btn.innerText = '✓ Seek to ' + Math.floor(btn.dataset.end) + 's';
                        setTimeout(() => btn.style.display = 'none', 3000);
                    }

        </script>
         </html>`);


    } catch(err){
        console.log("API ERROR: ", err);
    }
})


module.exports = router;