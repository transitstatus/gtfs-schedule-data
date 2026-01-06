const fs = require('fs');
const { parse } = require('csv-parse');
const turf = require('@turf/turf');
const feeds = require('../feeds.js');

// https://stackoverflow.com/questions/33907276/calculate-point-between-two-coordinates-based-on-a-percentage
const calculateLineMidpointWithPercent = (lon1, lat1, lon2, lat2, per = 0.5) => [lon1 + (lon2 - lon1) * per, lat1 + (lat2 - lat1) * per];

// dot env
require('dotenv').config();

const addPointsBetweenPoints = (points, iterations) => {
  let finalPoints = [];

  for (let i = 0; i < points.length - 1; i++) {
    const thisPoint = points[i];
    const nextPoint = points[i + 1];

    const distanceBetweenPointsIsh = Math.sqrt(
      Math.pow((nextPoint[0] - thisPoint[0]), 2) +
      Math.pow((nextPoint[1] - thisPoint[1]), 2)
    );

    let thisNewPoints = [thisPoint];

    for (let j = 0; j < distanceBetweenPointsIsh; j += 0.01) {
      const tValue = j / distanceBetweenPointsIsh;
      const interprolatedPoint = [
        thisPoint[0] + (nextPoint[0] - thisPoint[0]) * tValue,
        thisPoint[1] + (nextPoint[1] - thisPoint[1]) * tValue,
      ];

      thisNewPoints.push(interprolatedPoint);
    };

    if (i == points.length - 2) thisNewPoints.push(nextPoint); // add last point to last segment

    finalPoints.push(...thisNewPoints);
  }

  if (iterations > 1) return addPointsBetweenPoints(finalPoints, iterations - 1);
  return finalPoints;
};

Object.keys(feeds).forEach((feed) => {
  //if (feed !== 'bart') return;
  //if (feed !== 'metra') return;
  //if (feed !== 'southshore') return;
  if (feed !== 'amtrak') return;

  if (feeds[feed].disabled === true) return;
  if (feeds[feed].noSegments === true) return;
  if (!fs.existsSync(`./csv/${feed}`)) return;

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
          /*if (!row.shape_id && feed === 'nyct_subway') {
            row.shape_id = row.trip_id.split('_').reverse()[0];
            if (!shapes[row.shape_id]) {
              const custom_nyct_subway_shape_overrides = {
                'B..S65R': 'B..S45R',
                'B..N65R': 'B..N45R',
              };

              row.shape_id = custom_nyct_subway_shape_overrides[row.shape_id];

              if (!row.shape_id) return; // these are lost causes tbh
            }
          }*/

          trips[row.trip_id] = {
            routeID: row.route_id,
            shapeID: row.shape_id ?? null,
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
                stopDistanceTraveled: row.shape_distance_traveled,
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

                  const tripIDKeys = Object.keys(trips);
                  const sortedTripIDKeys = tripIDKeys.sort((a, b) => {
                    if (!trips[a].shapeID && !trips[b].shapeID) return 0;
                    if (!trips[a].shapeID) return 1;
                    if (!trips[b].shapeID) return -1;

                    const aNumber = shapes[trips[a].shapeID].length;
                    const bNumber = shapes[trips[b].shapeID].length;

                    return bNumber - aNumber;
                  });

                  for (let tripIDKey = 0; tripIDKey < sortedTripIDKeys.length; tripIDKey++) {
                    const tripID = sortedTripIDKeys[tripIDKey];

                    //if (trips[tripID].routeID != 'Org') continue; // only orange REMOVEME

                    const tripShape = trips[tripID].shapeID ?
                      turf.lineString(addPointsBetweenPoints(shapes[trips[tripID].shapeID])) :
                      turf.lineString(trips[tripID].stopTimes.map((stop) => [
                        stops[stop.stopID].lon,
                        stops[stop.stopID].lat,
                      ]))
                    ;

                    //fs.writeFileSync('./out.json', JSON.stringify(turf.lineString(tripShape)), { encoding: 'utf8' })

                    trips[tripID].stopTimes.forEach((startStopTime, i, arr) => {
                      if (i === arr.length - 1) return; //as there is no i + 1 element

                      // i + 1 element
                      const endStopTime = arr[i + 1];

                      // stop data
                      const startStopData = stops[startStopTime.stopID];
                      const endStopData = stops[endStopTime.stopID];

                      //getting parent stations
                      const startStopID = startStopData.parent ?? startStopTime.stopID;
                      const endStopID = endStopData.parent ?? endStopTime.stopID;
                      const additionalStopID = arr[i + 2] ? (stops[arr[i + 2].stopID].parent ?? arr[i + 2].stopID) : 'undefined';

                      //setting up the key dict
                      segmentKeyDict[`${trips[tripID].routeID}_${endStopID}_${additionalStopID}`] = `${startStopID}_${endStopID}`;

                      //dont redo work already done
                      //if (segments[`${startStopID}_${endStopID}`]) return;
                      if (segments[`${startStopID}_${endStopID}`] && segments[`${startStopID}_${endStopID}`].meters > 0) return;

                      // points
                      const startStopPoint = [startStopData.lon, startStopData.lat];
                      const endStopPoint = [endStopData.lon, endStopData.lat];

                      const startStopNearestPoint = turf.nearestPointOnLine(tripShape, startStopPoint);
                      const endStopNearestPoint = turf.nearestPointOnLine(tripShape, endStopPoint);

                      //console.log(startStopNearestPoint, endStopNearestPoint)

                      //getting sub-line for stations
                      const slicedShapeRaw = tripShape.geometry.coordinates.slice(startStopNearestPoint.properties.index, endStopNearestPoint.properties.index + 1);

                      //console.log(feedPath, startStopID, endStopID, slicedShapeRaw)

                      const slicedShape = turf.lineString(slicedShapeRaw.length > 1 ? slicedShapeRaw : [startStopPoint, endStopPoint]);

                      //console.log(startStopPointMeta, endStopPointMeta);

                      const slicedShapeLength = turf.length(slicedShape, { units: 'meters' });

                      //getting the segment time
                      const startTime = startStopTime.departureTime.split(':');
                      const endTime = endStopTime.arrivalTime.split(':');

                      const hoursDiff = Number(endTime[0]) - Number(startTime[0]);
                      const minutesDiff = Number(endTime[1]) - Number(startTime[1]);
                      const secondsDiff = Number(endTime[2]) - Number(startTime[2]);

                      const timeDiff = (hoursDiff * 60 * 60) + (minutesDiff * 60) + secondsDiff;

                      segments[`${startStopID}_${endStopID}`] = {
                        seconds: timeDiff,
                        meters: slicedShapeLength,
                        shape: slicedShape.geometry.coordinates,
                      }
                    });

                    //break; //only once REMOVEME
                  }

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