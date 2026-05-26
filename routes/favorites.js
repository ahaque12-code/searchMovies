const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const Favorite = require("../models/Favorite"); 


router.get("/", async (req, res) => {
  if (!req.session.userId) return res.redirect("/users/login");

  const favorites = await Favorite.find({ user: req.session.userId });
  console.log("Fetching favorites for user:", req.session.userId);
  console.log("Favorites found:", favorites.length); 
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
          <div class="nav-item2">
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
    const cert = movie.certification || "PG";
    html += `
      <div class="movie-card">
        <div class="poster-container">
          <span class="cert-badge ${cert.replace(/[^a-zA-Z0-9]/g, '-')}">${cert}</span>
          <img src="${movie.image || ''}" alt="movie poster">
        </div>
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
  if (!req.session.userId) return res.sendStatus(401);
    
    const { title, year, imdbId, genres, rating, image, certification } = req.body;
    
    const existing = await Favorite.findOne({ user: req.session.userId, imdbId: imdbId });
    
    if (existing) {
        await Favorite.findByIdAndDelete(existing._id);
        res.sendStatus(200);
    } else {
        await Favorite.create({
            user: req.session.userId,
            title, year, imdbId, genres, rating, image, certification
        });
        res.sendStatus(200);
    }
});

router.post("/delete/:id", async (req, res) => {
  try {
    const deleted = await Favorite.findOneAndDelete({ 
        _id: req.params.id, 
        user: req.session.userId 
    });
    
    if (!deleted) return res.send("Favorite not found or access denied.");
    res.redirect("/favorites");
  } catch (err) {
    console.log(err);
    res.send("Error deleting movie");
  }
});

router.post("/deleteAll", async (req, res) => {
    if (!req.session.userId) return res.sendStatus(401);

    await Favorite.deleteMany({ user: req.session.userId });
    
    res.sendStatus(200);
});
module.exports = router;