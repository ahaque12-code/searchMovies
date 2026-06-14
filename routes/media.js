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

async function tryOMDB(title) {
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


async function buildSeasonChain(startId) {
    const Q = `query ($id: Int) {
        Media(id: $id, type: ANIME) {
            id format type
            title { romaji english }
            coverImage { medium }
            startDate { year }
            relations { edges { relationType node { id type format } } }
        }
    }`;
    async function fetchNode(id) {
        try {
            const r = await fetch('https://graphql.anilist.co', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: Q, variables: { id } })
            });
            const d = await r.json();
            return d.data?.Media || null;
        } catch { return null; }
    }
    const isTv = n => n && n.type === 'ANIME' && ['TV', 'TV_SHORT'].includes(n.format);
    const edgeId = (node, rel) =>
        (node?.relations?.edges || []).find(e =>
            e.relationType === rel && isTv(e.node) && e.node?.id)?.node?.id || null;

    const start = await fetchNode(startId);
    if (!start) return [];

    const back = [];
    let seen = new Set([startId]);
    let cur = start;
    for (let i = 0; i < 12; i++) {
        const prevId = edgeId(cur, 'PREQUEL');
        if (!prevId || seen.has(prevId)) break;
        seen.add(prevId);
        const node = await fetchNode(prevId);
        if (!node) break;
        back.unshift(node);
        cur = node;
    }
    const fwd = [];
    cur = start;
    for (let i = 0; i < 12; i++) {
        const nextId = edgeId(cur, 'SEQUEL');
        if (!nextId || seen.has(nextId)) break;
        seen.add(nextId);
        const node = await fetchNode(nextId);
        if (!node) break;
        fwd.push(node);
        cur = node;
    }
    const ordered = [...back, start, ...fwd];
    return ordered.map((n, idx) => ({
        id: n.id,
        seasonLabel: 'Season ' + (idx + 1),
        title: n.title?.english || n.title?.romaji || ('Season ' + (idx + 1)),
        cover: n.coverImage?.medium || '/images/icon.png',
        year: n.startDate?.year || '',
        current: n.id === startId
    }));
}

router.get("/api/anime-episodes-tmdb", async (req, res) => {
    const { id, seasons, match } = req.query; // seasons = comma list, e.g. "1,2,3"
    const api_key = process.env.TMDB_API_KEY;
    const seasonNums = (seasons || "").split(",").filter(Boolean);
    const matchCount = match ? Number(match) : 0;
    try {
        // Fetch each requested season's episodes separately.
        const perSeason = [];
        for (const s of seasonNums) {
            const r = await fetch(`https://api.themoviedb.org/3/tv/${id}/season/${s}?api_key=${api_key}`,
                { headers: { 'Authorization': `Bearer ${process.env.TMDB_BEARER_TOKEN}` } });
            const d = await r.json();
            const eps = (d.episodes || []).map(ep => ({
                still: ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : null,
                name: ep.name || null,
                overview: ep.overview || ''
            }));
            perSeason.push({ season: Number(s), count: eps.length, eps });
        }

        let all;
        if (perSeason.length === 1) {
            all = perSeason[0].eps;
        } else if (matchCount > 0) {
            let best = perSeason[0], bestDiff = Infinity;
            for (const ps of perSeason) {
                const diff = Math.abs(ps.count - matchCount);
                if (diff < bestDiff) { bestDiff = diff; best = ps; }
            }
            all = (best && bestDiff <= 3) ? best.eps : perSeason.flatMap(ps => ps.eps);
        } else {
            all = perSeason.flatMap(ps => ps.eps);
        }

        res.json({ episodes: all }); // index 0 = episode 1
    } catch {
        res.json({ episodes: [] });
    }
});

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

router.get("/:type/:id", async (req, res) => {
    const { type, id } = req.params;
    const api_key = process.env.TMDB_API_KEY;
    const isGuest = !(req.session && req.session.userId);
    const allowAdult = req.session.nsfw === true || req.query.nsfw === 'true';

    function getBingeBoxUrl(imdbId) {
        if (!imdbId) return [];

        let urlType = type;
        if (urlType === "tv") {
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

    function getMovieLinkBd(title) {
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

    function getAnimeLink2(title) {
        const query = encodeURIComponent(title);
        return `https://anizone.to/anime?search=${query}`;
    }

    let anilistId = null;
    let animeGenres = [];
    let anilistEpisodeCount = null;
    let streamingEpisodes = [];
    let animeSeasonNum = null; // TMDB season number parsed from the AniList title (for thumbnails)
    let bestTmdbSeason = null; // TMDB season matched by air date (more reliable than the number)
    // AniList display overrides — used only when arriving via ?aniId (a specific season),
    // so the page shows that season's title/cover/overview instead of the lumped TMDB show's.
    let aniDisplayTitle = null;
    let aniDisplayCover = null;
    let aniDisplayOverview = null;
    let aniDisplayYear = null;
    let relatedSeasons = []; // prequel/sequel TV entries from AniList relations (for season navigation)

    try {
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
        const aniIdParam = req.query.aniId ? Number(req.query.aniId) : null;

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
            { name: "CoreFlix", url: `https://www.coreflix.tv/${type}/${id}` },
            { name: "Lunara", url: `https://lunara.watch/${type}/${id}` },
            { name: "CineBy", url: `https://www.cineby.at/${type}/${id}?` },
            ...bingeboxLink
        ];

        const isHindi = data.spoken_languages?.some(lang => lang.iso_639_1 === "hi");
        if (isHindi) {
            links.splice(0, 1);
            links.splice(1, 1);
            links.push({ name: "YoMovies", url: getHindiLink(title, year) });
        }

        const isKorean = ((data.origin_country?.includes("KR") || data.original_language === "ko") || (data.origin_country?.includes("CN") || data.original_language === "zh-Hant") ||
            (data.origin_country?.includes("CN") || data.original_language === "zh"));

        if (isKorean) {
            links.push({ name: "AsiaFlix", url: getAsiaFlixLink(title, year) });
            links.push({ name: "⭐️ KissKH (Search)", url: getKissKhSearchLink(title) });
        }

        const isBengali = data.spoken_languages?.some(lang => lang.iso_639_1 === "bn");
        if (isBengali) {
            links.push({ name: "⭐️ MovieLink BD", url: getMovieLinkBd(title) });
        }

        const isAnime = data.genres?.some(g => g.name === "Animation") && data.original_language === "ja";

        if (isAnime) {
            links = [];
            links.push({ name: "⭐️ AniZone", url: getAnimeLink2(title) });
            links.push({ name: "🥈 AniSuge", url: getAnimeLink(title) });
            links.push({ name: "Cineby", url: `https://www.cineby.sc/${type}/${id}` });
            links.push({ name: "Anime Websites list", url: `https://yarrlist.net/anime-list` });
        }

        
        if (isAnime) {
            try {
                const EP_FIELDS = `id episodes genres isAdult nextAiringEpisode { episode } streamingEpisodes { title thumbnail } title { romaji english } coverImage { large } bannerImage description(asHtml: false) startDate { year month day } relations { edges { relationType node { id type format title { romaji english } coverImage { medium } startDate { year } } } }`;
                let media = null;

                if (aniIdParam) {
                    const r = await fetch('https://graphql.anilist.co', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            query: `query ($id: Int) { Media(id: $id, type: ANIME) { ${EP_FIELDS} } }`,
                            variables: { id: aniIdParam }
                        })
                    });
                    const j = await r.json();
                    media = j.data?.Media || null;
                }

                if (!media) {
                    const tmdbYear = (data.first_air_date || "").substring(0, 4);
                    const query = `
                        query ($search: String, $year: Int) {
                            Page(perPage: 1) {
                                media(search: $search, type: ANIME, seasonYear: $year) { ${EP_FIELDS} }
                            }
                        }
                    `;
                    const malRes = await fetch('https://graphql.anilist.co', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ query, variables: { search: title, year: tmdbYear ? Number(tmdbYear) : null } })
                    });
                    const malData = await malRes.json();
                    media = malData.data?.Page?.media?.[0] || null;
                }

                if (!media) {
                    const fb = await fetch('https://graphql.anilist.co', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            query: `query ($search: String) { Media(search: $search, type: ANIME) { ${EP_FIELDS} } }`,
                            variables: { search: title }
                        })
                    });
                    const fbData = await fb.json();
                    media = fbData.data?.Media || null;
                }

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

                anilistId = media?.id || null;
                animeGenres = media?.genres || [];
               
                anilistEpisodeCount = media?.episodes
                    || (media?.nextAiringEpisode ? media.nextAiringEpisode.episode - 1 : null);
                streamingEpisodes = media?.streamingEpisodes || [];
                
                const aniTitle = media?.title?.english || media?.title?.romaji || '';
                let sm = aniTitle.match(/season\s*(\d+)/i) || aniTitle.match(/(\d+)(?:st|nd|rd|th)\s*season/i);
                animeSeasonNum = sm ? Number(sm[1]) : null;

                
                bestTmdbSeason = animeSeasonNum;
                if (media?.startDate?.year) {
                    const aniDate = new Date(
                        media.startDate.year,
                        (media.startDate.month || 1) - 1,
                        media.startDate.day || 1
                    ).getTime();
                    let best = null, bestDiff = Infinity;
                    for (const s of (data.seasons || [])) {
                        if (s.season_number < 1 || !s.air_date) continue;
                        const diff = Math.abs(new Date(s.air_date).getTime() - aniDate);
                        if (diff < bestDiff) { bestDiff = diff; best = s.season_number; }
                    }
                    if (best !== null && bestDiff <= 120 * 86400 * 1000) bestTmdbSeason = best;
                }

                
                if (aniIdParam && media) {
                    aniDisplayTitle = media.title?.english || media.title?.romaji || null;
                    aniDisplayCover = media.coverImage?.large || null;
                    aniDisplayYear = media.startDate?.year || null;
                    aniDisplayOverview = media.description
                        ? media.description.replace(/<[^>]*>/g, '').replace(/\n+/g, ' ').trim()
                        : null;
                }

               
                if (aniIdParam && media?.id) {
                    relatedSeasons = await buildSeasonChain(media.id);
                }
                console.log(`AniList ID for ${title}:`, anilistId, '| episodes:', anilistEpisodeCount, '| thumbs:', streamingEpisodes.length, '| seasonsInChain:', relatedSeasons.length);
            } catch {
                anilistId = null;
            }
        }

        let genresText = "Unknown";

        const rawGenres = data.genres || [];
        const rawGenreIds = data.genre_ids || [];

        if (rawGenres.length > 0) {
            let genreNames = rawGenres.map(g => g.name);
            if (isAnime) genreNames = genreNames.filter(name => name.toLowerCase() !== "animation");
            genresText = genreNames.join(", ");
        } else if (rawGenreIds.length > 0) {
            let genreNames = rawGenreIds.map(id => detailGenreMap[id]).filter(Boolean);
            if (isAnime) genreNames = genreNames.filter(name => name.toLowerCase() !== "animation");
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

        const displayTitle = aniDisplayTitle || title;
        const displayEscapedTitle = displayTitle.replace(/'/g, "\\'");
        const displayYear = aniDisplayYear || year;
        const displayPoster = aniDisplayCover || posterPath;
        const displayOverview = aniDisplayOverview || overview;

       
        const nsfwQS = (req.query.nsfw === 'true' || req.session.nsfw) ? '&nsfw=true' : '';
        const relatedSeasonsHtml = (isAnime && relatedSeasons.length > 1) ? `
            <h3 class="overview-heading">Seasons</h3>
            <div class="related-seasons" style="display:flex; gap:14px; overflow-x:auto; padding:6px 12px 14px;">
                ${relatedSeasons.map(rs => `
                    <a href="/media/tv/${id}?aniId=${rs.id}${nsfwQS}"
                       style="flex:0 0 auto; width:120px; text-decoration:none; color:white;
                              ${rs.current ? 'outline:2px solid #e50914; outline-offset:2px; border-radius:8px;' : ''}">
                        <img src="${rs.cover}" alt="${rs.title}" style="width:120px; height:170px; object-fit:cover; border-radius:8px; display:block;">
                        <p style="font-size:11px; color:#e50914; margin:6px 0 2px; text-transform:uppercase; letter-spacing:0.5px;">
                            ${rs.seasonLabel}${rs.current ? ' • Now' : ''}
                        </p>
                        <p style="font-size:13px; margin:0; line-height:1.3;">${rs.title}</p>
                        ${rs.year ? `<p style="font-size:11px; color:#aaa; margin:2px 0 0;">${rs.year}</p>` : ''}
                    </a>`).join('')}
            </div>` : '';
        console.log("Final Genres Text:", genresText);

        res.send(`
            <!DOCTYPE html>
            <html>
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <link rel="stylesheet" href="/css/media.css">
                    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
                    <link rel="icon" type="image/x-icon" href="/images/icon.png">
                    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
                    <title>${displayTitle} (${displayYear}) - SearchMovie</title>
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
                                <img src="${displayPoster}" alt="${displayTitle} Poster" class="details-poster">
                            </div>

                            <div class="details-right">
                                <div style="display: flex; align-items: center; gap: 15px;">
                                    <h1 class="details-title">${displayTitle} <span class="details-year">(${displayYear})</span></h1>
                                    <div id="int-btns">
                                        <button class="watchlist-btn ${isWatchlisted}" onclick="addWatchlist(this, '${displayEscapedTitle}', '${displayYear}', '${id}', '${genresText.replace(/'/g, "\\'")}', '${rating}', '${displayPoster}', 'PG')">
                                            <span class="eye-icon"></span>
                                        </button>
                                        <button class="heart-btn ${isFav}" onclick="addFavorite(this, '${displayEscapedTitle}', '${displayYear}', '${id}', '${genresText.replace(/'/g, "\\'")}', '${rating}', '${displayPoster}', 'PG')">
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
                                <p class="details-overview">${displayOverview}</p>

                                ${relatedSeasonsHtml}

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
                                            ${secretLinksHtml}
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

                    toggle.addEventListener('change', function () {
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
                        document.getElementById('player').innerHTML = "";
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

                    window.addEventListener('pageshow', function (event) {
                        if (event.persisted || performance.getEntriesByType('navigation')[0]?.type === 'back_forward') {
                            window.location.reload();
                        }
                    });

                    /* ---------------- shared player state ---------------- */
                    let currentShowId = '${id}';
                    let currentType = '${type}';
                    let currentSource = 'vidlink';
                    let currentSeason = null;
                    let currentEpisode = null;
                    const currentTitle = '${displayEscapedTitle}';
                    const currentImdbId = '${imdbId || ''}';

                    /* ---------------- anime (VidPlus) state ---------------- */
                    const isAnime = ${isAnime ? 'true' : 'false'};
                    const anilistId = ${anilistId || 'null'};
                    const anilistEpisodeCount = ${anilistEpisodeCount || 'null'};
                    const animeEpisodes = ${JSON.stringify(streamingEpisodes)};
                    const useAnimePlayer = isAnime && anilistId;
                    let currentAnimeEp = 1;
                    let animeDub = false;
                    let animeServer = 'tryembed';   // 'tryembed' | 'megaplay' | 'vidplus' — all use the AniList id
                    let tmdbAnimeEpisodes = null;   // lazily-loaded TMDB stills (thumbnails only)
                    const animeTmdbSeasons = ${JSON.stringify((data.seasons || []).filter(s => s.season_number > 0).map(s => s.season_number))};
                    const animeSeasonNum = ${bestTmdbSeason || 'null'}; // TMDB season matched by air date (falls back to title parse)
                    // TMDB season metadata (number, name, episode_count) used to build an optional
                    // "jump to season/range" selector for very long single-entry shows (One Piece).
                    const animeSeasonMeta = ${JSON.stringify((data.seasons || []).filter(s => s.season_number > 0).map(s => ({ n: s.season_number, name: s.name, count: s.episode_count })))};

                    async function ensureTmdbAnimeThumbs() {
                        if (tmdbAnimeEpisodes !== null) return; // already loaded (or empty)
                        if (!animeTmdbSeasons.length) { tmdbAnimeEpisodes = []; return; }
                        try {
                            // If we parsed a specific season from the AniList title (e.g. "Season 4")
                            // AND TMDB has that season, fetch ONLY that season's stills so thumbnails
                            // line up with this AniList entry. Otherwise fall back to count-matching,
                            // then to flattening all seasons (handled server-side via &match).
                            const useSeason = (animeSeasonNum && animeTmdbSeasons.includes(animeSeasonNum))
                                ? String(animeSeasonNum)
                                : animeTmdbSeasons.join(',');
                            const r = await fetch('/media/api/anime-episodes-tmdb?id=' + currentShowId
                                + '&seasons=' + useSeason
                                + '&match=' + (anilistEpisodeCount || 0));
                            const d = await r.json();
                            tmdbAnimeEpisodes = d.episodes || [];
                        } catch {
                            tmdbAnimeEpisodes = [];
                        }
                    }

                    /* ============================================================
                       ENTRY POINT
                       movie  -> single embed
                       anime  -> VidPlus, flat episode list, in-player Sub/Dub
                       tv     -> TMDB seasons + multi-server switcher
                    ============================================================ */
                    function openPlayer() {
                        document.getElementById('playerModal').style.display = 'flex';

                        if (currentType === 'movie') {
                            currentSource = 'vidlink';
                            document.getElementById('player-title').innerText = currentTitle;
                            document.getElementById('season-episode-picker').style.display = 'none';
                            renderIframe(getMovieSrc(currentSource));
                            return;
                        }

                        if (useAnimePlayer) {
                            document.getElementById('season-episode-picker').style.display = 'block';
                            document.getElementById('season-select').style.display = 'none'; // anime has no TMDB seasons
                            document.getElementById('vidlink-player').innerHTML =
                                renderAnimeControls() +
                                placeholder();
                            // AniList thumbnails are already injected in-page; render immediately.
                            renderAnimeEpisodeList();
                            return;
                        }

                        // live-action TV
                        currentSource = 'vidlink';
                        document.getElementById('season-select').style.display = '';
                        document.getElementById('season-episode-picker').style.display = 'block';
                        document.getElementById('vidlink-player').innerHTML =
                            renderSwitcher() + placeholder();
                        loadSeasons();
                    }

                    function placeholder() {
                        return \`<div style="height:180px; display:flex; align-items:center; justify-content:center; color:#777; background:#111; border-radius:8px; font-size:14px;">
                            Select an episode below to start watching
                        </div>\`;
                    }

                    function renderIframe(src) {
                        document.getElementById('vidlink-player').innerHTML =
                            renderSwitcher() +
                            \`<iframe width="100%" height="450" src="\${src}" frameborder="0" allowfullscreen referrerpolicy="origin"></iframe>\`;
                    }

                    /* ======================= MOVIES ======================= */
                    function getMovieSrc(source) {
                        if (source === 'vidsrcembed') return \`https://vidsrc-embed.ru/embed/movie/\${currentImdbId}\`;
                        if (source === 'videasy') return \`https://player.videasy.net/movie/\${currentShowId}\`;
                        if (source === 'multiembed') return \`https://multiembed.mov/?video_id=\${currentShowId}&tmdb=1\`;
                        return \`https://vidlink.pro/movie/\${currentShowId}\`;
                    }

                    /* ===================== LIVE-ACTION TV ===================== */
                    function getEpisodeSrc(source, season, episode) {
                        if (source === 'vidsrcembed') return \`https://vidsrc-embed.ru/embed/tv/\${currentImdbId}/\${season}-\${episode}\`;
                        if (source === 'videasy') return \`https://player.videasy.net/tv/\${currentShowId}/\${season}/\${episode}\`;
                        if (source === 'multiembed') return \`https://multiembed.mov/?video_id=\${currentShowId}&tmdb=1&s=\${season}&e=\${episode}\`;
                        return \`https://vidlink.pro/tv/\${currentShowId}/\${season}/\${episode}\`;
                    }

                    function renderSwitcher() {
                        const sources = [
                            { id: 'vidlink', label: 'Server 1' },
                            { id: 'videasy', label: 'Server 2' },
                            ...(currentImdbId ? [{ id: 'vidsrcembed', label: 'Server 3' }] : []),
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

                    function switchSource(source) {
                        currentSource = source;
                        if (currentType === 'movie') {
                            renderIframe(getMovieSrc(source));
                        } else if (currentSeason && currentEpisode) {
                            document.getElementById('player-title').innerText =
                                \`\${currentTitle} — S\${String(currentSeason).padStart(2, '0')}E\${String(currentEpisode).padStart(2, '0')}\`;
                            renderIframe(getEpisodeSrc(source, currentSeason, currentEpisode));
                        } else {
                            document.getElementById('vidlink-player').innerHTML = renderSwitcher() + placeholder();
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
                                        <div class="episode-overlay"><span style="font-size:26px;">▶</span></div>
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
                        document.getElementById('player-title').innerText =
                            currentTitle + ' — S' + String(season).padStart(2, '0') + 'E' + String(episode).padStart(2, '0');
                        renderIframe(getEpisodeSrc(currentSource, season, episode));
                        document.getElementById('player-content').scrollTop = 0;
                    }

                    /* ======================= ANIME (multi-provider) ======================= */
                    function getAnimeSrc(ep) {
                        const lang = animeDub ? 'dub' : 'sub';
                        if (animeServer === 'vidplus')
                            return \`https://player.vidplus.to/embed/anime/\${anilistId}/\${ep}?dub=\${animeDub}&autonext=true&nextbutton=true\`;
                        if (animeServer === 'megaplay')
                            return \`https://megaplay.buzz/stream/ani/\${anilistId}/\${ep}/\${lang}\`;
                        // default: TryEmbed
                        return \`https://tryembed.us.cc/embed/anime/\${anilistId}/\${ep}/\${lang}\`;
                    }

                    function setAnimeServer(srv) {
                        animeServer = srv;
                        renderAnimeIframe(currentAnimeEp);
                    }

                    function renderAnimeControls() {
                        const servers = [
                            { id: 'tryembed', label: 'Server 1' },
                            { id: 'megaplay', label: 'Server 2' },
                            { id: 'vidplus', label: 'Server 3' },
                        ];
                        return \`
                            <div id="server-box">
                                <p style="color:#aaa; font-size:12px; margin:0 0 8px; text-transform:uppercase; letter-spacing:1px;">
                                    <i class="fa-solid fa-server" style="margin-right:6px; color:#e50914;"></i>Server
                                </p>
                                \${servers.map(s => \`
                                    <button class="serverBtn" onclick="setAnimeServer('\${s.id}')"
                                        style="background:\${animeServer === s.id ? '#e50914' : '#2a2a2a'};">
                                        \${s.label}
                                    </button>\`).join('')}
                            </div>
                            <div id="server-box" style="margin-top:8px;">
                                <p style="color:#aaa; font-size:12px; margin:0 0 8px; text-transform:uppercase; letter-spacing:1px;">
                                    <i class="fa-solid fa-language" style="margin-right:6px; color:#e50914;"></i>Audio
                                </p>
                                \${['sub', 'dub'].map(t => {
                                    const isDub = t === 'dub';
                                    return \`<button class="serverBtn" onclick="setAnimeAudio(\${isDub})"
                                        style="background:\${animeDub === isDub ? '#e50914' : '#2a2a2a'};">
                                        \${isDub ? 'Dub' : 'Sub'}
                                    </button>\`;
                                }).join('')}
                            </div>\`;
                    }

                    function setAnimeAudio(dub) {
                        animeDub = dub;
                        renderAnimeIframe(currentAnimeEp);
                    }

                    function renderAnimeIframe(ep) {
                        currentAnimeEp = ep;
                        document.getElementById('vidlink-player').innerHTML =
                            renderAnimeControls() +
                            \`<iframe width="100%" height="450" src="\${getAnimeSrc(ep)}" frameborder="0" allowfullscreen referrerpolicy="origin"></iframe>\`;
                        document.getElementById('player-title').innerText = currentTitle + ' — Episode ' + ep;
                        document.getElementById('player-content').scrollTop = 0;
                    }

                    function renderAnimeEpisodeList() {
                        const count = anilistEpisodeCount
                            || (tmdbAnimeEpisodes ? tmdbAnimeEpisodes.length : 0)
                            || animeEpisodes.length || 24;

                        // Do we have AniList thumbnails? They're the only source guaranteed to align
                        // with this exact entry. If present -> rich grid. If not -> clean numbered list
                        // (clearer than showing mismatched/placeholder images that confuse people).
                        // Use the grid only when AniList covers MOST episodes with thumbnails.
                        // Partial coverage (e.g. One Piece: a few hundred of 1000+) would make a
                        // patchy grid full of placeholder icons — a uniform list is cleaner there.
                        const thumbCount = animeEpisodes.filter(e => e && e.thumbnail).length;
                        const hasAniThumbs = count > 0 && (thumbCount / count) >= 0.6;
                        console.log('ANIME EP RENDER:', { count, thumbCount, ratio: (thumbCount/count).toFixed(2), mode: hasAniThumbs ? 'GRID' : 'CHIP', animeEpisodesLen: animeEpisodes.length, anilistEpisodeCount });

                        document.getElementById('episode-count').innerText = count + ' episodes';

                        if (!hasAniThumbs) {
                            // ---- CHIP MODE (no usable thumbnails) ----
                            // Build episode RANGES so long shows (One Piece) get a "jump to season"
                            // selector instead of one giant wall of chips. Ranges come from TMDB
                            // season episode-counts when available (roughly track the sagas), else
                            // fall back to fixed 100-episode chunks. The selector ONLY filters which
                            // chips show — it never changes episode numbers or playback.
                            const ranges = [];
                            if (animeSeasonMeta.length > 1) {
                                let start = 1;
                                for (const s of animeSeasonMeta) {
                                    const c = s.count || 0;
                                    if (c <= 0) continue;
                                    const end = Math.min(start + c - 1, count);
                                    const nm = (s.name && !/^season\\s*\\d+$/i.test(s.name)) ? s.name : ('Season ' + s.n);
                                    ranges.push({ label: nm + ' (E' + start + '–' + end + ')', from: start, to: end });
                                    start = end + 1;
                                    if (start > count) break;
                                }
                                // If TMDB seasons undercount vs AniList, sweep up the remainder.
                                if (start <= count) ranges.push({ label: 'More (E' + start + '–' + count + ')', from: start, to: count });
                            }
                            if (ranges.length < 2) {
                                // Fallback: fixed 100-episode chunks (only if it's long enough to bother).
                                ranges.length = 0;
                                if (count > 100) {
                                    for (let s = 1; s <= count; s += 100) {
                                        const end = Math.min(s + 99, count);
                                        ranges.push({ label: 'Episodes ' + s + '–' + end, from: s, to: end });
                                    }
                                } else {
                                    ranges.push({ label: 'All episodes', from: 1, to: count });
                                }
                            }

                            const grid = document.getElementById('episode-grid');
                            grid.setAttribute('style',
                                'display:grid !important;' +
                                'grid-template-columns:repeat(auto-fill, minmax(64px, 1fr)) !important;' +
                                'gap:8px; padding:6px 2px;');

                            // Render the chips for a given range into the grid.
                            window.renderAnimeChipRange = function (idx) {
                                const r = ranges[idx] || ranges[0];
                                let chips = '';
                                for (let i = r.from; i <= r.to; i++) {
                                    const se = animeEpisodes[i - 1];
                                    let title = '';
                                    if (se && se.title) {
                                        const cleaned = se.title.replace(/^episode\\s*\\d+\\s*[-–—:]*\\s*/i, '').trim();
                                        if (cleaned) title = cleaned;
                                    }
                                    chips += \`
                                        <div class="anime-ep-chip" onclick="renderAnimeIframe(\${i})"
                                            title="\${title ? 'Episode ' + i + ': ' + title.replace(/"/g, '') : 'Episode ' + i}"
                                            style="padding:12px 6px; cursor:pointer; background:#1c1c1c; border-radius:8px;
                                                   text-align:center; font-size:14px; font-weight:bold; color:#eee; transition:background 0.15s;"
                                            onmouseover="this.style.background='#e50914'" onmouseout="this.style.background='#1c1c1c'">
                                            \${i}
                                        </div>\`;
                                }
                                grid.innerHTML = chips;
                            };

                            // Put a range selector into the season-select dropdown (reusing it).
                            const sel = document.getElementById('season-select');
                            if (ranges.length > 1) {
                                sel.innerHTML = ranges.map((r, idx) =>
                                    \`<option value="\${idx}">\${r.label}</option>\`).join('');
                                sel.style.display = '';
                                sel.onchange = function () { window.renderAnimeChipRange(Number(this.value)); };
                            } else {
                                sel.style.display = 'none';
                            }

                            window.renderAnimeChipRange(0);
                            return;
                        }

                        // ---- GRID MODE (AniList thumbnails present) ----
                        let cards = '';
                        for (let i = 1; i <= count; i++) {
                            const se = animeEpisodes[i - 1];
                            const hasThumb = !!(se && se.thumbnail);
                            let label = 'Episode ' + i;
                            if (se && se.title) {
                                const cleaned = se.title.replace(/^episode\\s*\\d+\\s*[-–—:]*\\s*/i, '').trim();
                                if (cleaned) label = 'E' + i + ' • ' + cleaned;
                            }
                            // Real thumbnail when AniList has it; otherwise a neutral block that
                            // matches the card shape (no stretched icon, no broken-image look).
                            const media = hasThumb
                                ? \`<img src="\${se.thumbnail}" alt="Episode \${i}" class="episode-thumb">\`
                                : \`<div class="episode-thumb" style="display:flex; align-items:center; justify-content:center; background:#1c1c1c; color:#555; font-size:20px; font-weight:bold;">E\${i}</div>\`;
                            cards += \`
                                <div class="episode-card" onclick="renderAnimeIframe(\${i})" style="cursor:pointer;">
                                    <div style="position:relative;">
                                        \${media}
                                        <div class="episode-overlay"><span style="font-size:26px;">▶</span></div>
                                        <span class="episode-badge left">E\${i}</span>
                                    </div>
                                    <div class="episode-info">
                                        <p class="episode-title">\${label}</p>
                                    </div>
                                </div>\`;
                        }
                        document.getElementById('episode-grid').innerHTML = cards;
                    }

                    function closePlayer() {
                        document.getElementById('playerModal').style.display = 'none';
                        document.getElementById('vidlink-player').innerHTML = '';
                        currentSeason = null;
                        currentEpisode = null;
                    }
                </script>
            </html>`);

    } catch (err) {
        console.log("API ERROR: ", err);
    }
});

module.exports = router;