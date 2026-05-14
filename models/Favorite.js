const mongoose = require("mongoose");

const favoriteSchema = new mongoose.Schema({
  title: String,
  year: String,
  imdbId: String,
  genres: String,
  rating: String,
  image: String
});

module.exports = mongoose.model("Favorite", favoriteSchema);