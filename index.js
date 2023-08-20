const fetch = require('node-fetch');
const fs = require('fs');
const { parse } = require('csv-parse');
const csv = require('csv-parser')
const { execSync } = require('child_process');
const simplify = require('@turf/simplify');

console.log(simplify)

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
  //if (feed !== 'cta') return;

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
      let routeShapes = {};
      let tripsDict = {};
      let parentStations = {};

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
            routeType: row.route_type,
            routeColor: feeds[feed]['colorOverrides'][row.route_id] ? feeds[feed]['colorOverrides'][row.route_id][0] : row.route_color,
            routeTextColor: feeds[feed]['colorOverrides'][row.route_id] ? feeds[feed]['colorOverrides'][row.route_id][1] : row.route_text_color,
            routeTrips: {},
            routeStations: [],
            destinations: [],
          }

          routeShapes[row.route_id] = [];
        })
        .on('end', function () {
          console.log(`Processing ${feed} trips...`)
          fs.createReadStream(`./csv/${feed}/trips.txt`)
            .pipe(parse({
              delimiter: feeds[feed]['separator'],
              columns: true
            }))
            .on('data', function (row) {
              routes[row.route_id]['routeTrips'][row.trip_id] = {
                headsign: row.trip_headsign,
              };

              tripsDict[row.trip_id] = row.route_id;

              routeShapes[row.route_id].push(row.shape_id);

              if (!routes[row.route_id]['destinations'].includes(row.trip_headsign)) {
                if (row.trip_headsign === '' || row.trip_headsign === null || row.trip_headsign === undefined) return;
                routes[row.route_id]['destinations'].push(row.trip_headsign);
              }
            })
            .on('end', function () {
              console.log(`Processing ${feed} shapes...`)

              let shapes = {};
              let finalGeoJSONByType = {};

              fs.mkdirSync(`./data/${feed}/shapes`);

              fs.createReadStream(`./csv/${feed}/shapes.txt`)
                .pipe(parse({
                  delimiter: feeds[feed]['separator'],
                  columns: true,
                  skip_empty_lines: true,
                }))
                .on('data', function (row) {
                  if (!shapes[row.shape_id]) {
                    shapes[row.shape_id] = [];
                  }

                  shapes[row.shape_id].push([Number(Number(row.shape_pt_lon).toFixed(5)), Number(Number(row.shape_pt_lat).toFixed(5))]);
                })
                .on('end', function () {
                  Object.keys(routeShapes).forEach((route) => {
                    if (!finalGeoJSONByType[routes[route]['routeType']]) {
                      finalGeoJSONByType[routes[route]['routeType']] = {
                        type: 'FeatureCollection',
                        features: [],
                      };
                    }

                    let finalGeoJSON = {
                      type: 'FeatureCollection',
                      features: [],
                    };

                    routeShapes[route].forEach((shape) => {
                      if (!shapes[shape]) return;

                      finalGeoJSON.features.push({
                        type: 'Feature',
                        properties: {
                          shapeID: shape,
                        },
                        geometry: {
                          type: 'LineString',
                          coordinates: shapes[shape],
                        },
                      });
                    });

                    //detect if multiple shapes are the same and remove them
                    finalGeoJSON.features = finalGeoJSON.features.filter((feature, index, self) =>
                      index === self.findIndex((t) => (
                        t.geometry.coordinates.length === feature.geometry.coordinates.length &&
                        t.geometry.coordinates.every((v, i) => v === feature.geometry.coordinates[i])
                      ))
                    );

                    //simplify each polyline to a tolerance of 0.0001
                    finalGeoJSON.features = finalGeoJSON.features.map((feature) => {
                      const simplified = simplify(feature, { tolerance: 0.0001, highQuality: true });
                      return simplified;
                    });

                    finalGeoJSONByType[routes[route]['routeType']].features.push({
                      type: 'Feature',
                      properties: {
                        routeID: route,
                        routeShortName: routes[route]['routeShortName'],
                        routeLongName: routes[route]['routeLongName'],
                        routeColor: routes[route]['routeColor'],
                      },
                      geometry: {
                        type: 'MultiLineString',
                        coordinates: finalGeoJSON.features.map((feature) => feature.geometry.coordinates),
                      },
                    });

                    /*
                    fs.writeFile(`./data/${feed}/shapes/${route}.geojson`, JSON.stringify(finalGeoJSON), (err) => {
                      if (err) throw err;
                    });
                    */
                  });

                  Object.keys(finalGeoJSONByType).forEach((type) => {
                    fs.writeFileSync(`./data/${feed}/shapes/type_${type}.geojson`, JSON.stringify(finalGeoJSONByType[type]));
                  });

                  console.log(`${feed} shapes processed`);
                });

              console.log(`Processing ${feed} stops...`)
              fs.createReadStream(`./csv/${feed}/stops.txt`)
                .pipe(parse({
                  delimiter: feeds[feed]['separator'],
                  columns: true
                }))
                .on('data', function (row) {
                  parentStations[row.stop_id] = row.parent_station;
                })
                .on('end', function () {
                  //console.log(parentStations)

                  console.log(`Processing ${feed} stop times...`)
                  fs.createReadStream(`./csv/${feed}/stop_times.txt`)
                    .pipe(parse({
                      delimiter: feeds[feed]['separator'],
                      columns: true
                    }))
                    .on('data', function (row) {
                      const routeID = tripsDict[row.trip_id];
                      const parentStation = parentStations[row.stop_id];

                      if (row.stop_id == 30068) {
                        //console.log(row.stop_id)
                        //console.log(parentStation)

                        //console.log(routes[routeID]['routeStations'].includes(parentStation))
                      }

                      if (!parentStation && !routes[routeID]['routeStations'].includes(row.stop_id)) {
                        routes[routeID]['routeStations'].push(row.stop_id);
                      }

                      if (parentStation && !routes[routeID]['routeStations'].includes(parentStation)) {
                        routes[routeID]['routeStations'].push(parentStation);
                      }

                      if (!routes[routeID]['destinations'].includes(row.stop_headsign)) {
                        if (row.stop_headsign === '' || row.stop_headsign === null || row.stop_headsign === undefined) return;
                        routes[routeID]['destinations'].push(row.stop_headsign);
                      }

                      if (!routes[routeID]['routeTrips'][row.trip_id]['headsign']) {
                        if (row.stop_headsign === '' || row.stop_headsign === null || row.stop_headsign === undefined) return;
                        routes[routeID]['routeTrips'][row.trip_id]['headsign'] = row.stop_headsign;
                      }
                    })
                    .on('end', function () {
                      console.log(`Sorting ${feed} route stops...`)
                      Object.keys(routes).forEach((route) => {
                        routes[route]['routeStations'] = routes[route]['routeStations'].map((n) => n.trim()).sort();
                      });

                      console.log(`Sorting ${feed} destinations...`)
                      Object.keys(routes).forEach((route) => {
                        routes[route]['destinations'] = routes[route]['destinations'].map((n) => n.trim()).sort();
                      });

                      console.log(`Writing ${feed} routes to JSON...`)
                      fs.writeFileSync(`./data/${feed}/routes.json`, JSON.stringify(routes));
                    });
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
});