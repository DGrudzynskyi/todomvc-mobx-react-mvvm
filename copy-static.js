const fs = require('fs');
const path = require('path');

const indexSource = path.resolve('./app/index.html');
const indexDist = path.resolve('./dist/index.html');

const todoMvcCssSource = path.resolve('./node_modules/todomvc-app-css/index.css');
const todoMcxCssDist = path.resolve('./dist/todomvc.css');

fs.copyFileSync(indexSource, indexDist);
fs.copyFileSync(todoMvcCssSource, todoMcxCssDist);