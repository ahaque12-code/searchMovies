const express = require("express");
const port = 3001;
const app = express();
app.get('/', (req,res) =>{
    res.send(`<!DOCTYPE html>
        <html>
            <head>
                <meta charset = "utf-8">
                <link rel = "stylsheet" href= "/style.css">
                <title>Final Project</title>
            </head>
            <body>
                <h1>Final Project :3</h1>
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