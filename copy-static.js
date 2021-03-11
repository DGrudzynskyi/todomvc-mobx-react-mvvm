const fs = require('fs');
const path = require('path');

const todoMvcCssSource = path.resolve('./node_modules/todomvc-app-css/index.css');
const todoMcxCssDist = path.resolve('./dist/todomvc.css');

fs.copyFileSync(todoMvcCssSource, todoMcxCssDist);