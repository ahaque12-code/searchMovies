const mongoose = require("mongoose");

const favoriteSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: String,
  year: String,
  imdbId: String,
  genres: String,
  rating: String,
  image: String,
  certification: { type: String, default: "PG" },
});

module.exports = mongoose.model("Favorite", favoriteSchema);