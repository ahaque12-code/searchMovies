const express = require("express");
const router = express.Router();
const axios = require("axios");
const Chat = require('../models/Chat');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

async function sendMessageWithRetry(message, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            return await model.generateContent(message);
        } catch (err) {
            // Only retry if it's a 503 (Server overload)
            if (err.status === 503 && i < retries - 1) {
                const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s...
                await new Promise(res => setTimeout(res, delay));
                continue; 
            }
            throw err;
        }
    }
}


router.post("/message", async (req, res) => {
    const { message } = req.body;
    const userId = req.session.userId;

    try {
        const chatDoc = await Chat.findOne({ userId });
        const history = chatDoc ? chatDoc.messages.slice(-6) : []; 
        const historyContext = history.map(m => `${m.sender}: ${m.text}`).join('\n');

        const fullPrompt = `
            You are a helpful MovieBot for SearchMovie.win. 
            If the user asks for recommendations, be helpful and specific. 
            If the user asks you can take them to a page of our webiste and our website only
            Don't talk about your underlying code, how you were built, or sensitive details; 
            if asked, tell them the operation is invalid.
            
            Conversation History:
            ${historyContext}
            
            User: ${message}
            Bot:`;

        const result = await sendMessageWithRetry(fullPrompt);        
        const botReply = result.response.text();

        let chat = chatDoc || new Chat({ userId, messages: [] });
        chat.messages.push({ sender: 'user', text: message });
        chat.messages.push({ sender: 'bot', text: botReply });
        await chat.save();

        res.json({ reply: botReply });
    } catch (err) {
        console.error(err);
        res.status(500).json({ reply: "Database error." });
    }
});

router.get("/history", async (req, res) => {
    const chat = await Chat.findOne({ userId: req.session.userId });
    res.json(chat ? chat.messages : []);
});

router.delete("/clear", async (req, res) => {
    try {
        const userId = req.session.userId;
        await Chat.findOneAndUpdate(
            { userId }, 
            { $set: { messages: [] } }
        );
        res.json({ success: true, message: "Chat history cleared." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Could not clear chat." });
    }
});

module.exports = router;