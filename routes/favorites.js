const express = require("express");
const router = express.Router();
const Favorite = require("../models/Favorite");

router.get("/", async (req, res) => {
  const favorites = await Favorite.find();

  let html = `
    <!DOCTYPE html>
    <html>
      <head>
        <link rel="stylesheet" href="/style.css">
        <title>Favorite List</title>
      </head>
      <body>
        <nav class="navbar2">
          <span class="nav-title2">Favorite List</span>
          <div class="nav-links2">
            <a href="/">Back Home</a>
          </div>
        </nav>
        <div class="movie-grid">
    `;

  favorites.forEach(movie => {
    html += `
      <div class="movie-card">
      <img src="${movie.image || ''}" alt="movie poster">
      <h3>${movie.title}</h3>
      <p><strong>Year:</strong> ${movie.year || "N/A"}</p>
      <p><strong>Genre:</strong> ${movie.genres || "Unknown"}</p>
      <p><strong>Rating:</strong> ${movie.rating || "N/A"}</p>
      <form action="/favorites/delete/${movie._id}" method="POST">
        <button type="submit" id = "deleteBtn">Delete</button>
      </form>
    </div>
    `;
  });

    html += `
    </div>
  </body>
  </html>`;

  res.send(html);
});

router.post("/add", async (req, res) => {
  const { title, year, imdbId, genres, rating, image } = req.body;

  await Favorite.create({
    title,
    year,
    imdbId,
    genres,
    rating,
    image
  });

  res.redirect("/favorites");
});

router.post("/delete/:id", async (req, res) => {
  try {
    await Favorite.findByIdAndDelete(req.params.id);
    res.redirect("/favorites");
  } catch (err) {
    console.log(err);
    res.send("Error deleting movie");
  }
});
module.exports = router;