const { Worker } = require("worker_threads");
const fs = require('fs');

// dot env
require('dotenv').config();

const feeds = JSON.parse(fs.readFileSync('./feeds.json', 'utf8'));

//removing old zips
fs.existsSync('./zips') && fs.rmSync('./zips', { recursive: true });
fs.mkdirSync('./zips');

//removing old csvs
fs.existsSync('./csv') && fs.rmSync('./csv', { recursive: true });
fs.mkdirSync('./csv');

//removing old data
fs.existsSync('./data') && fs.rmSync('./data', { recursive: true });
fs.mkdirSync('./data');

const startValue = new Date().valueOf();

Object.keys(feeds).forEach((feed) => {
  //if (feed !== 'southshore') return;

  if (feeds[feed].disabled === true) return;

  const worker = new Worker(
    __dirname + "/generateWorker.js",
    {
      workerData: {
        feed,
        feeds,
      }
    }
  );

  worker.on("message", (message) => {
    if (message === 'finished') {
      console.log('worker end:', new Date().valueOf() - startValue, 'ms');
    }
  });
});

console.log('end:', new Date().valueOf());