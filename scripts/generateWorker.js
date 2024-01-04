const { parentPort, workerData } = require("worker_threads");
const fetch = require('node-fetch');
const fs = require('fs');
const { parse } = require('csv-parse');
const { execSync } = require('child_process');
const meta = require('@turf/meta');
const simplify = require('@turf/simplify').default;
const bezier = require('@turf/bezier-spline').default;
const truncate = require('@turf/truncate').default;
const sharp = require('sharp');

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

const processURL = (url, urlEnv) => {
  let finalURL = url;
  urlEnv.forEach((replacement) => {
    finalURL = finalURL.replace(replacement, process.env[replacement.replace('env.', '')]);
  })
  return finalURL;
}

const RED = 0.2126;
const GREEN = 0.7152;
const BLUE = 0.0722;

const GAMMA = 2.4;

const luminance = (r, g, b) => {
  var a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928
      ? v / 12.92
      : Math.pow((v + 0.055) / 1.055, GAMMA);
  });
  return a[0] * RED + a[1] * GREEN + a[2] * BLUE;
}

const contrast = (rgb1, rgb2) => {
  var lum1 = luminance(...rgb1);
  var lum2 = luminance(...rgb2);
  var brightest = Math.max(lum1, lum2);
  var darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

const contrastFromString = (color1, color2) => {
  const rgb1 = color1.match(/[A-Za-z0-9]{2}/g).map((v) => parseInt(v, 16));
  const rgb2 = color2.match(/[A-Za-z0-9]{2}/g).map((v) => parseInt(v, 16));
  return contrast(rgb1, rgb2);
}

const processFeed = (feed, feeds) => {
  const feedURL = processURL(feeds[feed]['url'], feeds[feed]['urlEnv']);
  console.log(`Fetching ${feed} zip...`)
  fetch(feedURL, {
    method: 'GET',
    headers: processHeaders(feeds[feed]['headers'])
  })
    .then((res) => res.arrayBuffer())
    .then((body) => {
      const buffer = Buffer.from(body);
      fs.writeFileSync(`./zips/${feed}.zip`, buffer, 'utf8');
      console.log(`Saved ${feed} to ./zips/${feed}.zip`);

      //console.log(body.toString());

      console.log(`Unzipping ${feed}...`);
      fs.mkdirSync(`./csv/${feed}`);
      execSync(`unzip -o ./zips/${feed}.zip -d ./csv/${feed}`);
      console.log(`Unzipped ${feed} to ./csv/${feed}`);

      console.log(`Converting ${feed} to JSON...`)
      fs.mkdirSync(`./data/${feed}`);

      let feedPath = `./csv/${feed}`;
      if (feeds[feed].subfolder) {
        feedPath = `./csv/${feed}/${feeds[feed].subfolder}`
      }

      let routes = {};
      let routeColors = {};
      let routeShapes = {};
      let tripsDict = {};
      let parentStations = {};
      let tripsMeta = {};

      let minLat = 999999;
      let maxLat = -99999;
      let minLon = 999999;
      let maxLon = -99999;

      console.log(`Processing ${feed} routes...`)
      fs.createReadStream(`${feedPath}/routes.txt`)
        .pipe(parse({
          delimiter: feeds[feed]['separator'],
          columns: true,
          skip_empty_lines: true,
          bom: true,
          trim: feeds[feed]['trim'],
        }))
        .on('data', function (row) {
          let routeColor = feeds[feed]['colorOverrides'][row.route_id] ? feeds[feed]['colorOverrides'][row.route_id][0] : row.route_color;
          let routeTextColor = feeds[feed]['colorOverrides'][row.route_id] ? feeds[feed]['colorOverrides'][row.route_id][1] : row.route_text_color;

          console.log(routeColor, routeTextColor)

          if (feeds[feed]['colorReplacements'][routeColor]) {
            routeColor = feeds[feed]['colorReplacements'][routeColor]
          }

          if (routeColor.length === 0) {
            routeColor = '000000';
          }

          if (routeTextColor.length === 0) {
            const constrastWhite = contrastFromString('FFFFFF', routeColor);
            const contrastBlack = contrastFromString('000000', routeColor);

            if (constrastWhite < contrastBlack) {
              routeTextColor = '000000';
            } else {
              routeTextColor = 'FFFFFF';
            }

            if (routeColor === '000000') {
              routeTextColor = 'FFFFFF';
            }
          }

          routes[row.route_id] = {
            routeID: row.route_id,
            routeShortName: row.route_short_name,
            routeLongName: row.route_long_name,
            routeType: row.route_type,
            routeColor: routeColor,
            routeTextColor: routeTextColor,
            routeTrips: {},
            routeStations: [],
            destinations: [],
          }

          if (!Object.keys(routeColors).includes(routeColor)) {
            routeColors[routeColor] = { routeTextColor, types: [] };
          }

          if (!routeColors[routeColor].types.includes(row.route_type)) {
            routeColors[routeColor].types.push(row.route_type);
          }

          routeShapes[row.route_id] = [];
        })
        .on('end', function () {
          console.log(`Generating ${feed} icons...`)

          fs.mkdirSync(`./data/${feed}/icons`);

          const tramTemplate = fs.readFileSync('./templates/tram.svg', 'utf8');
          const trainTemplate = fs.readFileSync('./templates/train.svg', 'utf8');
          const busTemplate = fs.readFileSync('./templates/bus.svg', 'utf8');
          const boatTemplate = fs.readFileSync('./templates/boat.svg', 'utf8');
          const arrowTemplate = fs.readFileSync('./templates/arrow.svg', 'utf8');
          //const boxTemplate = fs.readFileSync('./templates/box.svg', 'utf8');

          let iconsRef = [];

          Object.keys(routeColors).forEach((routeColor) => {
            const routeTextColor = routeColors[routeColor].routeTextColor;
            const types = routeColors[routeColor].types;

            let actualRouteColor = routeColor === '000000' ? 'FFFFFF' : routeColor;
            let actualRouteTextColor = routeColor === '000000' ? '000000' : routeTextColor;

            //trams
            if (types.includes('0')) {
              //processing template
              const tramIcon = tramTemplate.replaceAll("#FFFFFF", `#${actualRouteColor}`).replaceAll("#000000", `#${actualRouteTextColor}`);
              const tramBuffer = Buffer.from(tramIcon, 'utf8');

              iconsRef.push(`${routeColor}_tram.png`);

              sharp(tramBuffer)
                .resize(64, 64)
                .png()
                .toFile(`./data/${feed}/icons/${routeColor}_tram.png`, (err, info) => {
                  if (err) throw err;
                  //if (info) console.log(info);
                  console.log(`${routeColor}_tram.png generated for ${feed}`)
                });
            }

            //trains
            if (types.includes('1') || types.includes('2') || types.includes('5')) {
              //processing template
              const trainIcon = trainTemplate.replaceAll("#FFFFFF", `#${actualRouteColor}`).replaceAll("#000000", `#${actualRouteTextColor}`);
              const trainBuffer = Buffer.from(trainIcon, 'utf8');

              iconsRef.push(`${routeColor}_train.png`);

              sharp(trainBuffer)
                .resize(64, 64)
                .png()
                .toFile(`./data/${feed}/icons/${routeColor}_train.png`, (err, info) => {
                  if (err) throw err;
                  //if (info) console.log(info);
                  console.log(`${routeColor}_train.png generated for ${feed}`)
                });
            }

            //buses
            if (types.includes('3')) {
              const busIcon = busTemplate.replaceAll("#FFFFFF", `#${actualRouteColor}`).replaceAll("#000000", `#${actualRouteTextColor}`);
              const busBuffer = Buffer.from(busIcon, 'utf8');

              iconsRef.push(`${routeColor}_bus.png`);

              sharp(busBuffer)
                .resize(64, 64)
                .png()
                .toFile(`./data/${feed}/icons/${routeColor}_bus.png`, (err, info) => {
                  if (err) throw err;
                  console.log(`${routeColor}_bus.png generated for ${feed}`)
                });
            }

            //ferries
            if (types.includes('4')) {
              const boatIcon = boatTemplate.replaceAll("#FFFFFF", `#${actualRouteColor}`).replaceAll("#000000", `#${actualRouteTextColor}`);
              const boatBuffer = Buffer.from(boatIcon, 'utf8');

              iconsRef.push(`${routeColor}_boat.png`);

              sharp(boatBuffer)
                .resize(64, 64)
                .png()
                .toFile(`./data/${feed}/icons/${routeColor}_boat.png`, (err, info) => {
                  if (err) throw err;
                  if (info) console.log(info);
                });
            }

            //arrow
            const arrowIcon = arrowTemplate.replaceAll("#FFFFFF", `#${actualRouteColor}`).replaceAll("#000000", `#${actualRouteTextColor}`);
            const arrowBuffer = Buffer.from(arrowIcon, 'utf8');

            iconsRef.push(`${routeColor}_arrow.png`);

            sharp(arrowBuffer)
              .resize(120, 120)
              .png()
              .toFile(`./data/${feed}/icons/${routeColor}_arrow.png`, (err, info) => {
                if (err) throw err;
                console.log(`${routeColor}_arrow.png generated for ${feed}`)
              });
          });

          const uniqueIconsRef = [...new Set(iconsRef)];

          fs.writeFileSync(`./data/${feed}/icons.json`, JSON.stringify(uniqueIconsRef));
          
          console.log(`Processing ${feed} trips...`)
          fs.createReadStream(`${feedPath}/trips.txt`)
            .pipe(parse({
              delimiter: feeds[feed]['separator'],
              columns: true,
              skip_empty_lines: true,
              bom: true,
              trim: feeds[feed]['trim'],
            }))
            .on('data', function (row) {
              tripsMeta[row.trip_id] = {
                headsign: row.trip_headsign,
              }
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

              console.log(`Writing ${feed} trip metadata to JSON...`)
              fs.writeFileSync(`./data/${feed}/tripMeta.json`, JSON.stringify(tripsMeta), { encoding: 'utf-8' })

              console.log(`Processing ${feed} shapes...`)

              let shapes = {};
              let finalGeoJSONByType = {};

              fs.mkdirSync(`./data/${feed}/shapes`);

              fs.createReadStream(`${feedPath}/shapes.txt`)
                .pipe(parse({
                  delimiter: feeds[feed]['seperatorOverrides'].shapes ?? feeds[feed]['separator'],
                  columns: true,
                  skip_empty_lines: true,
                  bom: true,
                  trim: feeds[feed]['trim'],
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
                      if (!shapes[shape]) {
                        console.log('Shape not found')
                        return;
                      }

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

                    //simplify each polyline to a tolerance of 0.00001
                    finalGeoJSON.features = finalGeoJSON.features.map((feature) => {
                      const simplified = simplify(feature, { tolerance: 0.00001, highQuality: true });
                      //const splined = bezier(simplified);
                      //didnt need because the simplified above is doing that
                      //const truncated = truncate(simplified); //ensure only 6 digits

                      meta.coordAll(simplified).forEach((point) => {
                        if (point[0] > maxLon) maxLon = point[0];
                        if (point[0] < minLon) minLon = point[0];
                        if (point[1] > maxLat) maxLat = point[1];
                        if (point[1] < minLat) minLat = point[1];
                      })

                      return simplified
                    });

                    finalGeoJSONByType[routes[route]['routeType']].features.push({
                      type: 'Feature',
                      properties: {
                        routeID: feeds[feed].mapCodeOverrides[route] ?? route,
                        routeShortName: routes[route]['routeShortName'],
                        routeLongName: routes[route]['routeLongName'],
                        routeColor: `#${routes[route]['routeColor'] === '000000' ? 'FFFFFF' : routes[route]['routeColor']}`,
                      },
                      geometry: {
                        type: 'MultiLineString',
                        coordinates: finalGeoJSON.features.map((feature) => feature.geometry.coordinates),
                      },
                    });
                  });

                  Object.keys(finalGeoJSONByType).forEach((type) => {
                    fs.writeFileSync(`./data/${feed}/shapes/type_${type}.geojson`, JSON.stringify(finalGeoJSONByType[type]));
                  });

                  console.log(`${feed} shapes processed`);
                });

              console.log(`Processing ${feed} stops...`)
              fs.createReadStream(`${feedPath}/stops.txt`)
                .pipe(parse({
                  delimiter: feeds[feed]['separator'],
                  columns: true,
                  skip_empty_lines: true,
                  bom: true,
                  trim: feeds[feed]['trim'],
                }))
                .on('data', function (row) {
                  parentStations[row.stop_id] = row.parent_station;
                })
                .on('end', function () {
                  //console.log(parentStations)

                  let tripEnds = {};

                  console.log(`Processing ${feed} stop times...`)
                  fs.createReadStream(`${feedPath}/stop_times.txt`)
                    .pipe(parse({
                      delimiter: feeds[feed]['seperatorOverrides'].stop_times ?? feeds[feed]['separator'],
                      columns: true,
                      skip_empty_lines: true,
                      trim: feeds[feed]['trim'],
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
                        if (row.stop_headsign !== '' || row.stop_headsign !== null || row.stop_headsign !== undefined) {
                          routes[routeID]['destinations'].push(row.stop_headsign);
                        }
                      }

                      if (!routes[routeID]['routeTrips'][row.trip_id]['headsign']) {
                        if (row.stop_headsign !== '' || row.stop_headsign !== null || row.stop_headsign !== undefined) {
                          routes[routeID]['routeTrips'][row.trip_id]['headsign'] = row.stop_headsign;
                        }
                      }

                      tripEnds[row.trip_id] = row.stop_id;
                    })
                    .on('end', function () {

                      let stops = {};
                      console.log(`Processing ${feed} stops...`)
                      fs.createReadStream(`${feedPath}/stops.txt`)
                        .pipe(parse({
                          delimiter: feeds[feed]['separator'],
                          columns: true,
                          skip_empty_lines: true,
                          bom: true,
                          trim: feeds[feed]['trim'],
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
                          console.log(`Adding ${feed} destinations to routes...`)
                          Object.keys(routes).forEach((routeKey) => {
                            const route = routes[routeKey];

                            Object.keys(route.routeTrips).forEach((tripKey) => {
                              const finalStopID = tripEnds[tripKey];

                              if (!finalStopID) return; //probably a yeeted trip

                              if (!route.destinations.includes(finalStopID)) {
                                route.destinations.push(stops[finalStopID].stopName);
                              }
                              route.routeTrips[tripKey].headsign = stops[finalStopID].stopName;
                            })

                            route.destinations = [...new Set(route.destinations)];
                            route.destinations = route.destinations.filter((destination) => destination !== null && destination !== undefined && destination !== '');
                          });

                          console.log(`Writing ${feed} stops to JSON...`)
                          fs.writeFileSync(`./data/${feed}/stops.json`, JSON.stringify(stops));

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

                          console.log(`Writing ${feed} metadata to JSON...`)
                          fs.writeFileSync(`./data/${feed}/meta.json`, JSON.stringify({
                            icons: uniqueIconsRef,
                            bbox: {
                              minLat,
                              maxLat,
                              minLon,
                              maxLon,
                            }
                          }))
                

                          parentPort.postMessage('finished');
                        });
                    });
                });
            });
        })
    });
}

processFeed(workerData.feed, workerData.feeds);