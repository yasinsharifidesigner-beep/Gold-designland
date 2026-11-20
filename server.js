const express = require('express');
const path = require('path');
const { init } = require('./panel/db');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));

init().then(function () {
  require('./panel/mount')(app);
  app.use(express.static(path.join(__dirname, 'public')));
  app.listen(port);
}).catch(function (err) {
  console.error(err);
  process.exit(1);
});
