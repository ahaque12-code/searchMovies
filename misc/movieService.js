const axios = require("axios");

async function searchTMDB(query) {
    const url = `https://api.themoviedb.org/3/search/multi?api_key=${process.env.TMDB_API_KEY}&query=${encodeURIComponent(query)}`;
    const response = await axios.get(url);
    return response.data.results.slice(0, 5).map(m => ({
        title: m.title || m.name,
        type: m.media_type,
        rating: m.vote_average
    }));
}

module.exports = { searchTMDB };