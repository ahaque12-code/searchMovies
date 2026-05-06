const express = require("express");
const path = require("path");
const port = 3001;
const app = express();

app.use(express.static(__dirname));

app.get('/', (req,res) =>{
    res.send(`<!DOCTYPE html>
        <html>
            <head>
                <meta charset = "utf-8">
                <link rel = "stylesheet" href= "style.css">
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
                <title>Final Project</title>
                <script src = "func.js"></script>
            </head>
            <body>
                <div id = introduction>
                    <h1>Final Project :3</h1>
                    <p>Going to write smth</p>
                </div>
            </body>
        </html>
        `)
})

app.listen(port, (err) => {
    if(err) {
        console.log("Server failed: " + err);
    } else {
        console.log(`http://localhost:${port}`);
    }
});