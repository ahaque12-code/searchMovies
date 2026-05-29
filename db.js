const Favorite = require("./models/Favorite");
async function fetchFavoritesFromDB(userId) {
    try {
        return await Favorite.find({ user: userId });
    } catch (err) {
        console.error("Database Fetch Error:", err);
        return [];
    }
}
module.exports = { fetchFavoritesFromDB };