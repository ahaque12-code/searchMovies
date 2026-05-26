const express = require("express");
const router = express.Router();

const detailGenreMap = {
    28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
    80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
    14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
    96: "Mystery", 10749: "Romance", 878: "Sci-Fi", 53: "Thriller",
    10752: "War", 37: "Western", 10759: "Action & Adventure", 10765: "Sci-Fi & Fantasy"
};


router.get("/:type/:id", async (req,res)=>{
    const { type, id } = req.params;
    const api_key = process.env.TMDB_API_KEY;
    
    function getXPrimeUrl(imdbId) {
        if (!imdbId) return null;
        
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

    try{
        const [detailsRes, providersRes] = await Promise.all([
        fetch(`https://api.themoviedb.org/3/${type}/${id}?api_key=${api_key}&language=en-US&append_to_response=external_ids`, { headers: { 'Authorization': `Bearer ${process.env.TMDB_BEARER_TOKEN}` } }),
        fetch(`https://api.themoviedb.org/3/${type}/${id}/watch/providers?api_key=${api_key}&append_to_response=external_ids`, { headers: { 'Authorization': `Bearer ${process.env.TMDB_BEARER_TOKEN}` } })
        ]);

        const data = await detailsRes.json();
        const providerData = await providersRes.json();

        const title = data.title || data.name || "Unknown";
        const dateString = data.release_date || data.first_air_date || "";
        const year = (data.release_date || data.first_air_date || "").substring(0, 4) || "0000";        
        const rating = data.vote_average ? Number(data.vote_average).toFixed(1) : "N/A";
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
        const links = [
            { name: "123 Chill", url: `https://123chill.in/${mediaType}/${searchSlug}/` },
            ...xPrimeLinks
        ];

        const isHindi = data.spoken_languages?.some(lang => lang.iso_639_1 === "hi");
        if (isHindi) {
            links.push({ name: "YoMovies", url: getHindiLink(title, year) });
        }

       const secretLinksHtml = links.map(link => 
            `<li><a href="${link.url}" target="_blank" rel="noopener noreferrer" class="secret-link">${link.name}</a></li>`
        ).join('');

        res.send(`
            <!DOCTYPE hmtl>
            <html>
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <link rel="stylesheet" href="/routes/media.css">
                    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
                    <link rel="icon" type="image/x-icon" href="/images/icon.png">
                    <title>${title} (${year})</title>
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
                                <h1 class="details-title">${title} <span class="details-year">(${year})</span></h1>
                                
                                <div class="details-meta">
                                    <span class="meta-badge">${type === 'movie' ? 'Movie' : 'TV Show'}</span>
                                    <span>• ${dateString || "N/A"}</span>
                                    <span>• ${genresText}</span>
                                    <span>• ⏱️ ${durationText}</span>
                                </div>

                                <div class="score-container">
                                    <div class="score-circle">⭐ ${rating}</div>
                                    <span class="score-label">User Score</span>
                                </div>

                                <p class="details-tagline"><em>${tagline}</em></p>
                                
                                <h3 class="overview-heading">Overview</h3>
                                <p class="details-overview">${overview}</p>
                                
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
                                    <ul class="secret-link-list">
                                        ${secretLinksHtml}</li>
                                    </ul>
                                </div>                            
                            </div>
                        </div>
                    </div>
                </body>
                <script>
                    const toggle = document.getElementById('secretToggle');
                    const secretDiv = document.getElementById('secretDiv');

                    toggle.addEventListener('change', function() {
                        if (this.checked) {
                            secretDiv.style.display = 'block';
                        } else {
                            secretDiv.style.display = 'none';
                        }
                    });
                </script>
            </html>`);


    } catch(err){
        console.log("API ERROR: ", err);
    }
})

module.exports = router;