const { parentPort, workerData } = require("worker_threads");
const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const { parse } = require('csv-parse');
const { execSync } = require('child_process');
const turf = require('@turf/turf');
const sharp = require('sharp');

const default_ff_headers = {
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:136.0) Gecko/20100101 Firefox/136.0",
  //"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-User": "?1",
  "Priority": "u=0, i",
  "Pragma": "no-cache",
  "Cache-Control": "no-cache"
};

const routeTypeMinZooms = {
  '0': 7, //tram
  '1': 7, //subway
  '2': 0, //commuter, regional, and intercity
  '3': 8, //buses, might need to make exceptions if stuff like flixbus is added
  '4': 7, //ferries
  '5': 7, //cable cars
}

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
  //if (feed != 'hawaii_thebus') return;

  try {
    const feedURL = processURL(feeds[feed]['url'], feeds[feed]['urlEnv']);
    console.log(`Fetching ${feed} zip...`)

    let requestBody = "";
    let requestHeaders = {
      ...default_ff_headers,
      ...processHeaders(feeds[feed]['headers']),
    }

    if (feeds[feed]['bodyType']) {
      switch (feeds[feed]['bodyType']) {
        case "raw":
          requestBody = feeds[feed]['body'];
          break;
        case "json":
          requestBody = JSON.stringify(feeds[feed]['body']);
          break;
        case "formData":
          const formData = new FormData();
          const processedForm = processHeaders(feeds[feed]['body']);

          Object.keys(processedForm).forEach((formKey) => {
            formData.append(formKey, processedForm[formKey]);
          })
          requestBody = formData;
          requestHeaders = {
            ...requestHeaders,
            ...formData.getHeaders(),
          }
      }
    }

    fetch(feedURL, {
      method: feeds[feed]['bodyType'] ? 'POST' : 'GET',
      headers: requestHeaders,
      body: feeds[feed]['bodyType'] ? requestBody : null
    })
      .then((res) => res.arrayBuffer())
      .then((body) => {
        const buffer = Buffer.from(body);
        fs.writeFileSync(`./zips/${feed}.zip`, buffer, 'utf8');
        console.log(`Saved ${feed} to ./zips/${feed}.zip`);

        //console.log(body.toString());

        console.log(`Unzipping ${feed}...`);
        fs.mkdirSync(`./csv/${feed}`);
        execSync(`unzip -o ./zips/${feed}.zip -d ./csv/${feed} || echo ./zips/${feed}.zip`);
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
        let colorSets = [];
        let routeIDReplacements = {};

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
            if (feeds[feed]['useRouteShortNameAsRouteCode']) {
              routeIDReplacements[row.route_id] = row.route_short_name;
              row.route_id = row.route_short_name;
            };

            let routeColor = (feeds[feed]['colorOverrides'][row.route_id] ? feeds[feed]['colorOverrides'][row.route_id][0] : row.route_color) ?? '';
            let routeTextColor = (feeds[feed]['colorOverrides'][row.route_id] ? feeds[feed]['colorOverrides'][row.route_id][1] : row.route_text_color) ?? '';

            if (feeds[feed]['colorReplacements'][routeColor]) {
              routeColor = feeds[feed]['colorReplacements'][routeColor]
            }

            if (feeds[feed]['textColorReplacements'][routeTextColor]) { // BASED ON ROUTE COLOR
              routeTextColor = feeds[feed]['textColorReplacements'][routeTextColor];
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

            // for later icon gen
            colorSets.push(`${routeColor}_${routeTextColor}`);

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

            //const tramTemplate = fs.readFileSync('./templates/tram.svg', 'utf8');
            //const trainTemplate = fs.readFileSync('./templates/train.svg', 'utf8');
            //const busTemplate = fs.readFileSync('./templates/bus.svg', 'utf8');
            ///const boatTemplate = fs.readFileSync('./templates/boat.svg', 'utf8');
            const circleTemplate = fs.readFileSync('./templates/circle.svg', 'utf8');
            const arrowTemplate = fs.readFileSync('./templates/arrow.svg', 'utf8');
            //const boxTemplate = fs.readFileSync('./templates/box.svg', 'utf8');

            let iconsRef = [];

            Object.keys(routeColors).forEach((routeColor) => {
              const routeTextColor = routeColors[routeColor].routeTextColor;
              const types = routeColors[routeColor].types;

              let actualRouteColor = routeColor === '000000' ? 'FFFFFF' : routeColor;
              let actualRouteTextColor = routeColor === '000000' ? '000000' : routeTextColor;

              /*
              //trams
              if (types.includes('0')) {
                //processing template
                const tramIcon = tramTemplate.replaceAll("FILL", `#${actualRouteColor}`).replaceAll("BORDERS", `#${actualRouteTextColor}`);
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
                const trainIcon = trainTemplate.replaceAll("FILL", `#${actualRouteColor}`).replaceAll("BORDERS", `#${actualRouteTextColor}`);
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
                const busIcon = busTemplate.replaceAll("FILL", `#${actualRouteColor}`).replaceAll("BORDERS", `#${actualRouteTextColor}`);
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
                const boatIcon = boatTemplate.replaceAll("FILL", `#${actualRouteColor}`).replaceAll("BORDERS", `#${actualRouteTextColor}`);
                const boatBuffer = Buffer.from(boatIcon, 'utf8');

                iconsRef.push(`${routeColor}_boat.png`);

                sharp(boatBuffer)
                  .resize(64, 64)
                  .png()
                  .toFile(`./data/${feed}/icons/${routeColor}_boat.png`, (err, info) => {
                    if (err) throw err;
                    //if (info) console.log(info);
                  });
              }
              */

              //arrow
              const arrowIcon = arrowTemplate.replaceAll("FILL", `#${actualRouteColor}`).replaceAll("BORDERS", `#${actualRouteTextColor}`);
              const arrowBuffer = Buffer.from(arrowIcon, 'utf8');

              iconsRef.push(`${routeColor}_arrow.png`);

              sharp(arrowBuffer)
                .resize(120, 120)
                .png()
                .toFile(`./data/${feed}/icons/${routeColor}_arrow.png`, (err, info) => {
                  if (err) throw err;
                  console.log(`${routeColor}_arrow.png generated for ${feed}`)
                });

              //circle
              const circleIcon = circleTemplate.replaceAll("FILL", `#${actualRouteColor}`).replaceAll("BORDERS", `#${actualRouteTextColor}`);
              const circleBuffer = Buffer.from(circleIcon, 'utf8');

              iconsRef.push(`${routeColor}_circle.png`);

              sharp(circleBuffer)
                .resize(64, 64)
                .png()
                .toFile(`./data/${feed}/icons/${routeColor}_circle.png`, (err, info) => {
                  if (err) throw err;
                  console.log(`${routeColor}_circle.png generated for ${feed}`)
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
              .on('data', (row) => {
                if (feeds[feed]['useRouteShortNameAsRouteCode']) row.route_id = routeIDReplacements[row.route_id];
                if (!routes[row.route_id]) return; //thanks NJT

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

                    shapes[row.shape_id].push([Number(Number(row.shape_pt_lon).toFixed(5)), Number(Number(row.shape_pt_lat).toFixed(5)), Number(row.shape_pt_sequence)]);
                  })
                  .on('end', function () {
                    console.log(`Sorting ${feed} shapes...`);
                    Object.keys(shapes).forEach((shapeKey) => {
                      shapes[shapeKey] = shapes[shapeKey]
                        .sort((a, b) => a[2] - b[2])
                        .map((coord) => [coord[0], coord[1]]);
                    })

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
                          //commented out since this was clogging up logs lmao
                          //console.log('Shape not found')
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
                        const simplified = turf.simplify(feature, { tolerance: 0.00001, highQuality: true });
                        //const splined = bezier(simplified);
                        //didnt need because the simplified above is doing that
                        //const truncated = truncate(simplified); //ensure only 6 digits

                        turf.meta.coordAll(simplified).forEach((point) => {
                          if (point[0] > maxLon) maxLon = point[0];
                          if (point[0] < minLon) minLon = point[0];
                          if (point[1] > maxLat) maxLat = point[1];
                          if (point[1] < minLat) minLat = point[1];
                        })

                        return simplified
                      });

                      let almostFinalFeature = {
                        type: 'Feature',
                        properties: {
                          routeID: feeds[feed].mapCodeOverrides[route] ?? route,
                          routeShortName: routes[route]['routeShortName'],
                          routeLongName: routes[route]['routeLongName'],
                          routeColor: `#${routes[route]['routeColor'] === '000000' ? 'FFFFFF' : routes[route]['routeColor']}`,
                          minZoom: routeTypeMinZooms[routes[route]['routeType']],
                        },
                        geometry: {
                          type: 'MultiLineString',
                          coordinates: finalGeoJSON.features.map((feature) => feature.geometry.coordinates),
                        },
                      };

                      //const areaCoverage = turf.area(turf.bboxPolygon(turf.bbox(almostFinalFeature)));
                      //almostFinalFeature.properties.areaCoverage = areaCoverage;

                      finalGeoJSONByType[routes[route]['routeType']].features.push(almostFinalFeature);
                    });

                    Object.keys(finalGeoJSONByType).forEach((type) => {
                      fs.writeFileSync(`./data/${feed}/shapes/type_${type}.geojson`, JSON.stringify(finalGeoJSONByType[type]));
                    });

                    console.log(`${feed} shapes processed`);
                  });

                console.log(`Processing ${feed} stops...`)
                fs.createReadStream(`${feedPath}/stops.txt`)
                  .pipe(parse({
                    delimiter: feeds[feed]['seperatorOverrides'].stops ?? feeds[feed]['separator'],
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

                        if (!routes[routeID]) return; //thanks NJT

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
                            delimiter: feeds[feed]['seperatorOverrides'].stops ?? feeds[feed]['separator'],
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
                              stopTZ: row.stop_timezone,
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
                              },
                              colorSets,
                            }));

                            parentPort.postMessage('finished');
                          });
                      });
                  });
              });
          })
      });
  } catch (e) {
    console.log(e);
  }
}

processFeed(workerData.feed, workerData.feeds);