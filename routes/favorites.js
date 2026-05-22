const express = require("express");
const router = express.Router();
const Favorite = require("../models/Favorite");

router.get("/", async (req, res) => {
  const favorites = await Favorite.find();

  let html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset = "utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="/style.css">
        <link rel="icon" type="image/x-icon" href="images/icon.png">
        <title>Favorite List</title>
      </head>
      <body>
        <nav class="navbar2">
          <span class="nav-title2">Favorite List</span>
          <div class="nav-links2">
            <a href="/">Back Home</a>
          </div>
        </nav>

        <div style="text-align:center; margin:20px;">
            <button id="deleteAllBtn" onclick="deleteAllFavorites()">
                🗑️ Remove All Favorites
            </button>
        </div>
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
    <script>
      async function deleteAllFavorites() {
          const confirmDelete =
              confirm("Are you sure you want to remove all favorites?");
          if (!confirmDelete) return;
          await fetch("/favorites/deleteAll", {
              method: "POST"
          });
          location.reload();
      }
    </script>
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

router.post("/deleteAll", async (req, res) => {
    await Favorite.deleteMany({});
    res.sendStatus(200);
});
module.exports = router;