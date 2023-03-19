const fetch = require('node-fetch');
const fs = require('fs');
const csv = require('csv-parser')
const { execSync } = require('child_process');

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

Object.keys(feeds).forEach((feed) => {
  const feedURL = feeds[feed];
  console.log(`Fetching ${feedURL}...`)
  fetch(feedURL)
    .then((res) => res.arrayBuffer())
    .then((body) => {
      const buffer = Buffer.from(body);
      fs.writeFileSync(`./zips/${feed}.zip`, buffer, 'utf8');

      console.log(`Unzipping ${feed}...`)
      fs.mkdirSync(`./csv/${feed}`);
      execSync(`unzip -o ./zips/${feed}.zip -d ./csv/${feed}`);

      console.log(`Converting ${feed} to JSON...`)
      fs.mkdirSync(`./data/${feed}`);
      ['routes', 'stops', 'trips'].forEach((fileName) => {
        let data = [];
        fs.createReadStream(`./csv/${feed}/${fileName}.txt`)
          .pipe(csv())
          .on('data', function (row) {
            data.push(row)
          })
          .on('end', function () {
            fs.writeFileSync(`./data/${feed}/${fileName}.json`, JSON.stringify(data));
          });        
      })
    })
});