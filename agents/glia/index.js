const express = require('express');
const { model } = require('./model-config');
const { exec } = require('child_process');

const app = express();
app.use(express.json());

app.post('/query', async (req, res) => {
  const input = req.body.prompt;
  exec(\ollama run \ "\"\, (err, stdout) => {
    if (err) return res.status(500).send(err.message);
    res.send(stdout);
  });
});

app.listen(3004, () => {
  console.log('Glia listening on port 3004 using ' + model);
});
