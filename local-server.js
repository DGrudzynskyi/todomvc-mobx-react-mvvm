var express = require('express');

var app = express();
app.use('/', express.static('dist'));
app.listen(5010);

console.log("Server Started on PORT " + 5010);
