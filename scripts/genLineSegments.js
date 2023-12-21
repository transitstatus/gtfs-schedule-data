const fs = require('fs');
const { parse } = require('csv-parse');
const turf = require('@turf/turf');

// dot env
require('dotenv').config();

const feeds = JSON.parse(fs.readFileSync('./feeds.json', 'utf8'));

Object.keys(feeds).forEach((feed) => {
  //if (feed !== 'cta') return;
  //if (feed !== 'metra') return;
  //if (feed !== 'southshore') return;
  //if (feed !== 'chicago') return;

  if (feeds[feed].disabled === true) return;

  console.log(`Generating line segments for ${feed}`);

  let feedPath = `./csv/${feed}`;
  if (feeds[feed].subfolder) {
    feedPath = `./csv/${feed}/${feeds[feed].subfolder}`
  }

  console.log(`Ingesting shapes for ${feed}`);

  let shapes = {};
  let trips = {};
  let stops = {};
  let segments = {};
  let segmentKeyDict = {};

  fs.createReadStream(`${feedPath}/shapes.txt`)
    .pipe(parse({
      delimiter: feeds[feed]['seperatorOverrides'].shapes ?? feeds[feed]['separator'],
      columns: true,
      skip_empty_lines: true,
      bom: true,
      trim: feeds[feed]['trim'],
    }))
    .on('data', (row) => {
      if (!shapes[row.shape_id]) {
        shapes[row.shape_id] = []
      }

      //including the sequence number so we can sort it later. most agencies have points pre sorted, but edge cases are super fun
      shapes[row.shape_id].push([row.shape_pt_lon, row.shape_pt_lat, row.shape_pt_sequence]);
    })
    .on('end', () => {
      console.log(`Done ingesting shapes for ${feed}`);
      console.log(`Sorting shapes for ${feed}`);

      Object.keys(shapes).forEach((shapeID) => {
        shapes[shapeID] = shapes[shapeID].sort((a, b) => a[2] - b[2]).map((n) => [Number(n[0]), Number(n[1])]);
      })

      console.log(`Done sorting shapes for ${feed}`);
      console.log(`Ingesting trips for ${feed}`);

      fs.createReadStream(`${feedPath}/trips.txt`)
        .pipe(parse({
          delimiter: feeds[feed]['separator'],
          columns: true,
          skip_empty_lines: true,
          bom: true,
          trim: feeds[feed]['trim'],
        }))
        .on('data', (row) => {
          if (!row.shape_id) return;

          trips[row.trip_id] = {
            routeID: row.route_id,
            shapeID: row.shape_id,
            stopTimes: [],
          }
        })
        .on('end', () => {
          console.log(`Ingesting stop times for ${feed}`)
          fs.createReadStream(`${feedPath}/stop_times.txt`)
            .pipe(parse({
              delimiter: feeds[feed]['seperatorOverrides'].stop_times ?? feeds[feed]['separator'],
              columns: true,
              skip_empty_lines: true,
              trim: feeds[feed]['trim'],
            }))
            .on('data', (row) => {
              if (!trips[row.trip_id]) return;

              trips[row.trip_id].stopTimes.push({
                arrivalTime: row.arrival_time,
                departureTime: row.departure_time,
                stopID: row.stop_id,
                stopSequence: row.stop_sequence,
              })
            })
            .on('end', () => {
              console.log(`Done ingesting trips for ${feed}`);
              console.log(`Sorting stop times for ${feed}`);

              Object.keys(trips).forEach((tripID) => {
                trips[tripID].stopTimes = trips[tripID].stopTimes.sort((a, b) => a.stopSequence - b.stopSequence)
              })

              console.log(`Done sorting stop times for ${feed}`);
              console.log(`Ingesting stops for ${feed}`);

              fs.createReadStream(`${feedPath}/stops.txt`)
                .pipe(parse({
                  delimiter: feeds[feed]['separator'],
                  columns: true,
                  skip_empty_lines: true,
                  bom: true,
                  trim: feeds[feed]['trim'],
                }))
                .on('data', (row) => {
                  stops[row.stop_id] = {
                    name: row.stop_name,
                    lat: Number(row.stop_lat),
                    lon: Number(row.stop_lon),
                    parent: row.parent_station && row.parent_station.length > 0 ? row.parent_station : undefined,
                  }
                })
                .on('end', () => {
                  console.log(`Done ingesting stops for ${feed}`);
                  console.log(`Setting up line segments for ${feed}`);

                  Object.keys(trips).forEach((tripID) => {
                    if (trips[tripID].routeID !== 'Y') return;

                    trips[tripID].stopTimes.forEach((startStopTime, i, arr) => {
                      if (i === arr.length - 1) return; //as there is no i + 1 element

                      // i + 1 element
                      const endStopTime = arr[i + 1];

                      //getting parent stations
                      const startStopID = stops[startStopTime.stopID].parent ?? startStopTime.stopID;
                      const endStopID = stops[endStopTime.stopID].parent ?? endStopTime.stopID;
                      const additionalStopID = arr[i + 2] ? (stops[arr[i + 2].stopID].parent ?? arr[i + 2].stopID) : 'undefined';

                      //dont redo work already done
                      if (segments[`${startStopID}_${endStopID}`]) return;

                      //setting up the key dict
                      //if (i < arr.length - 2) { //if this is the last segment
                      //  segmentKeyDict[`${trips[tripID].routeID}_${endStopID}_undefined`] = `${startStopID}_${endStopID}`;
                      //} else { //since there are 2+ upcoming stops, we can just go ahead
                      segmentKeyDict[`${trips[tripID].routeID}_${endStopID}_${additionalStopID}`] = `${startStopID}_${endStopID}`;
                      //}

                      //getting stop metadata
                      const startStop = stops[startStopID];
                      const endStop = stops[endStopID];

                      //getting the points
                      const startPoint = turf.point([startStop.lon, startStop.lat]);
                      const endPoint = turf.point([endStop.lon, endStop.lat]);

                      //getting shape data
                      const initialShape = turf.lineString(shapes[trips[tripID].shapeID]);

                      //getting sub-line for stations
                      const slicedShape = turf.lineSlice(startPoint, endPoint, initialShape);

                      //getting the segment time
                      const startTime = startStopTime.departureTime.split(':');
                      const endTime = endStopTime.arrivalTime.split(':');

                      const hoursDiff = Number(endTime[0]) - Number(startTime[0]);
                      const minutesDiff = Number(endTime[1]) - Number(startTime[1]);
                      const secondsDiff = Number(endTime[2]) - Number(startTime[2]);

                      const timeDiff = (hoursDiff * 60 * 60) + (minutesDiff * 60) + secondsDiff;

                      segments[`${startStopID}_${endStopID}`] = {
                        seconds: timeDiff,
                        shape: slicedShape.geometry.coordinates,
                      }
                    })
                  })

                  console.log(`Line segments setup for ${feed}, saving to disk`)

                  fs.writeFileSync(`./data/${feed}/segments.json`, JSON.stringify({
                    segments,
                    segmentKeyDict
                  }), { encoding: 'utf8' });
                })
            })

          /*
        fs.writeFileSync(`./data/${feed}/ingested.json`, JSON.stringify({
          "type": "FeatureCollection",
          "features": Object.values(shapes).map((shape) => {
            return {
              "type": "Feature",
              "properties": {},
              "geometry": {
                "coordinates": shape,
                "type": "LineString"
              }
            }
          })
        }), { encoding: 'utf8' })
        */
        });
    });
});