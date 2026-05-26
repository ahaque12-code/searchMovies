const mongoose = require("mongoose");
const favoriteSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: String,
  year: String,
  imdbId: String,
  genres: String,
  rating: String,
  image: String,
  certification: { type: String, default: "PG" },
});

module.exports = mongoose.models.Favorite || mongoose.model("Favorite", favoriteSchema);