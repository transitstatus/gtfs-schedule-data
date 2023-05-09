const fetch = require('node-fetch');
const fs = require('fs');
const { parse } = require('csv-parse');
const csv = require('csv-parser')
const { execSync } = require('child_process');

// dot env
require('dotenv').config();

const processHeaders = (headers) => {
  const processedHeaders = {};
  Object.keys(headers).forEach((header) => {
    if (headers[header].startsWith('env.')) {
      const envVar = headers[header].replace('env.', '');
      processedHeaders[header] = process.env[envVar];
    } else {
      processedHeaders[header] = headers[header];
    };
  });
  return processedHeaders;
};

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
  const feedURL = feeds[feed]['url'];
  console.log(`Fetching ${feedURL}...`)
  fetch(feedURL, {
    method: 'GET',
    headers: processHeaders(feeds[feed]['headers'])
  })
    .then((res) => res.arrayBuffer())
    .then((body) => {
      const buffer = Buffer.from(body);
      fs.writeFileSync(`./zips/${feed}.zip`, buffer, 'utf8');
      console.log(`Saved ${feed} to ./zips/${feed}.zip`);

      console.log(`Unzipping ${feed}...`);
      fs.mkdirSync(`./csv/${feed}`);
      execSync(`unzip -o ./zips/${feed}.zip -d ./csv/${feed}`);
      console.log(`Unzipped ${feed} to ./csv/${feed}`);

      console.log(`Converting ${feed} to JSON...`)
      fs.mkdirSync(`./data/${feed}`);

      let routes = {};
      console.log(`Processing ${feed} routes...`)
      fs.createReadStream(`./csv/${feed}/routes.txt`)
        .pipe(parse({
          delimiter: feeds[feed]['separator'],
          columns: true
        }))
        .on('data', function (row) {
          routes[row.route_id] = {
            routeID: row.route_id,
            routeShortName: row.route_short_name,
            routeLongName: row.route_long_name,
            routeColor: feeds[feed]['colorOverrides'][row.route_id] ? feeds[feed]['colorOverrides'][row.route_id][0] : row.route_color,
            routeTextColor: feeds[feed]['colorOverrides'][row.route_id] ? feeds[feed]['colorOverrides'][row.route_id][1] : row.route_text_color,
            routeTrips: []
          }
        })
        .on('end', function () {
          console.log(`Processing ${feed} trips...`)
          fs.createReadStream(`./csv/${feed}/trips.txt`)
            .pipe(parse({
              delimiter: feeds[feed]['separator'],
              columns: true
            }))
            .on('data', function (row) {
              routes[row.route_id].routeTrips.push(
                {
                  id: row.trip_id,
                  headsign: row.trip_headsign
                }
              );
            })
            .on('end', function () {
              console.log(`Writing ${feed} routes to JSON...`)
              fs.writeFileSync(`./data/${feed}/routes.json`, JSON.stringify(routes));
            });
        });

      let stops = {};
      console.log(`Processing ${feed} stops...`)
      fs.createReadStream(`./csv/${feed}/stops.txt`)
        .pipe(parse({
          delimiter: feeds[feed]['separator'],
          columns: true
        }))
        .on('data', function (row) {

          stops[row.stop_id] = {
            stopID: row.stop_id,
            stopName: row.stop_name,
            stopLat: Number(Number(row.stop_lat).toFixed(5)),
            stopLon: Number(Number(row.stop_lon).toFixed(5)),
            zoneID: row.zone_id,
            parentStation: row.parent_station,
          };
        })
        .on('end', function () {
          console.log(`Writing ${feed} stops to JSON...`)
          fs.writeFileSync(`./data/${feed}/stops.json`, JSON.stringify(stops));
        });
    })
});