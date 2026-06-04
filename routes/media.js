const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const router = express.Router();
const { fetchFavoritesFromDB } = require("../misc/db.js");

const detailGenreMap = {
    28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
    80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
    14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
    96: "Mystery", 10749: "Romance", 878: "Sci-Fi", 53: "Thriller",
    10752: "War", 37: "Western", 10759: "Action & Adventure", 10765: "Sci-Fi & Fantasy"
};

async function getRottenTomatoesScore(title, type) {
    try {
        const prefix = (type === 'tv') ? 'tv' : 'm';
        const formattedTitle = encodeURIComponent(title.toLowerCase().replace(/[^a-z0-9]+/g, '_'));
        const url = `https://www.rottentomatoes.com/${prefix}/${formattedTitle}`;

        const { data } = await axios.get(url, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
            }
        });

        const $ = cheerio.load(data);
        
        const jsonLd = $('script[type="application/ld+json"]').html();
        if (jsonLd) {
            const parsed = JSON.parse(jsonLd);
            if (parsed.aggregateRating && parsed.aggregateRating.ratingValue) {
                return `${parsed.aggregateRating.ratingValue}%`;
            }
        }
        
        return "N/A";
    } catch (err) {
        console.error("Scraping failed for:", title, err.message);
        return "N/A";
    }
}
                    
router.get("/:type/:id", async (req,res)=>{
    const { type, id } = req.params;
    const api_key = process.env.TMDB_API_KEY;
    
    function getXPrimeUrl(imdbId) {
        if (!imdbId) return [];
        
        const cleanId = imdbId.startsWith('tt') ? imdbId : `tt${imdbId}`;
        
        const patternWithT = `https://xprime.su/title/t${imdbId.replace('tt', '')}`;
        
        const patternStandard = `https://xprime.su/title/${id}`;

        return [
            { name: "X Prime (Type A)", url: patternWithT },
            { name: "X Prime (Type B)", url: patternStandard }
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

        const favorites = await fetchFavoritesFromDB(req.session.userId);
        const isFav = favorites.some(f => String(f.imdbId).trim() === String(id).trim()) ? 'active' : '';

        const title = data.title || data.name || "Unknown";
        const escapedTitle = title.replace(/'/g, "\\'");
        const dateString = data.release_date || data.first_air_date || "";
        const year = (data.release_date || data.first_air_date || "").substring(0, 4) || "0000";        
        const rating = data.vote_average ? Number(data.vote_average).toFixed(1) : "N/A";
        const rtScore = await getRottenTomatoesScore(data.title || data.name, type);
        const overview = data.overview || "No overview available.";
        const tagline = data.tagline ? `"${data.tagline}"` : "";
        const lang = data.original_language;

        const posterPath = data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : '/images/icon.png';
        const backdropPath = data.backdrop_path ? `https://image.tmdb.org/t/p/original${data.backdrop_path}` : '';

        let genresText = "Unknown";
        if (data.genres && data.genres.length > 0) {
            genresText = data.genres.map(g => g.name).join(", ");
        } else if (data.genre_ids && data.genre_ids.length > 0) {
            genresText = data.genre_ids.map(id => detailGenreMap[id]).filter(Boolean).join(", ");
        }

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
        const xPrimeLinks = getXPrimeUrl(imdbId);
        let links = [
            { name: "123 Chill", url: `https://123chill.in/${mediaType}/${searchSlug}/` },
            {name: "Cineby", url: `https://www.cineby.sc/${type}/${id}`},
            ...xPrimeLinks
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

        res.send(`
            <!DOCTYPE hmtl>
            <html>
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <link rel="stylesheet" href="/css/media.css">
                    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
                    <link rel="icon" type="image/x-icon" href="/images/icon.png">
                    <title>${title} (${year}) - SearchMovie</title>
                    <style>
                        .details-hero {
                            position: relative;
                            width: 100%;
                            min-height: calc(100vh - 70px);
                            background: linear-gradient(rgba(0, 0, 0, 0.85), rgba(0, 0, 0, 0.85)), url('${backdropPath}');
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
                                    <button class="heart-btn ${isFav}" onclick="addFavorite(this, '${escapedTitle}', '${year}', '${id}', '${genresText.replace(/'/g, "\\'")}', '${rating}', '${posterPath}', 'PG')">
                                        <span class="heart-icon"></span>
                                    </button>
                                </div>
                                
                                <div class="details-meta">
                                    <span class="cert-badge ${certClass}">${ageCertificate}</span>
                                    <span class="meta-badge">${type === 'movie' ? 'Movie' : 'TV Show'}</span>
                                    <span>• ${dateString || "N/A"}</span>
                                    <span>• ${genresText}</span>
                                    <span>• ${durationText}</span>
                                </div>

                                <div class="score-container">
                                    <div class="score-circle">⭐ ${rating}</div>
                                    <span class="score-label">User Score</span>
                                    <span class="score-label">🍅 RT:</span>
                                    <span class="score-circle"> ${rtScore}</span>
                                </div>

                                <p class="details-tagline"><em>${tagline}</em></p>
                                
                                <h3 class="overview-heading">Overview</h3>
                                <p class="details-overview">${overview}</p>

                                ${trailer 
                                    ? `<button class="trailer-btn" onclick="openTrailer('${trailer.key}')">▶ Watch Trailer</button>` 
                                    : `<p>No trailer available.</p>`
                                }

                                <div id="trailerModal" class="modal">
                                    <div class="modal-content">
                                        <span class="close" onclick="closeTrailer()">&times;</span>
                                        <div id="player"></div>
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
                        const isActive = btn.classList.toggle('active');
                        
                        await fetch("/favorites/add", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ title, year, imdbId, genres, rating, image, certification })
                        });
                        
                        console.log("Favorite status updated: " + isActive);
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
                </script>
            </html>`);


    } catch(err){
        console.log("API ERROR: ", err);
    }
})

module.exports = router;