const express = require('express');
const router = express.Router();
const Watchlist = require('../models/Watchlist');


router.get('/', async (req, res) => {
    const items = await Watchlist.find({ user: req.session.userId });
});

router.post('/add', async (req, res) => {
    const { title, year, imdbId, genres, rating, image, certification, mediaType } = req.body;
    const existing = await Watchlist.findOne({ user: req.session.userId, imdbId });
    if (existing) {
        await Watchlist.deleteOne({ user: req.session.userId, imdbId });
        return res.json({ status: 'removed' });
    }
    await Watchlist.create({ user: req.session.userId, title, year, imdbId, genres, rating, image, certification, mediaType });
    res.json({ status: 'added' });
});

router.post('/watched/:imdbId', async (req, res) => {
   const item = await Watchlist.findOne({ user: req.session.userId, imdbId: req.params.imdbId });
    if (!item) return res.json({ watched: false });
    
    item.watched = !item.watched;
    await item.save();
    res.json({ watched: item.watched });
});

module.exports = router;