const fs = require('fs');
const { parse } = require('csv-parse');
const turf = require('@turf/turf');
const feeds = require('../feeds.js');

// https://stackoverflow.com/questions/33907276/calculate-point-between-two-coordinates-based-on-a-percentage
const calculateLineMidpointWithPercent = (lon1, lat1, lon2, lat2, per = 0.5) => [lon1 + (lon2 - lon1) * per, lat1 + (lat2 - lat1) * per];

// dot env
require('dotenv').config();

Object.keys(feeds).forEach((feed) => {
  //if (feed !== 'bart') return;
  //if (feed !== 'metra') return;
  //if (feed !== 'southshore') return;
  //if (feed !== 'cta') return;

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
          if (!row.shape_id && feed === 'nyct_subway') {
            row.shape_id = row.trip_id.split('_').reverse()[0];
            if (!shapes[row.shape_id]) {
              const custom_nyct_subway_shape_overrides = {
                'B..S65R': 'B..S45R',
                'B..N65R': 'B..N45R',
              };

              row.shape_id = custom_nyct_subway_shape_overrides[row.shape_id];

              if (!row.shape_id) return; // these are lost causes tbh
            }
          } else if (!row.shape_id) return;

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
                    const aNumber = shapes[trips[a].shapeID].length;
                    const bNumber = shapes[trips[b].shapeID].length;

                    return bNumber - aNumber;
                  });

                  for (let tripIDKey = 0; tripIDKey < sortedTripIDKeys.length; tripIDKey++) {
                    const tripID = sortedTripIDKeys[tripIDKey];

                    //if (trips[tripID].routeID != 'Org') continue; // only orange REMOVEME

                    let tripShape = turf.lineString(shapes[trips[tripID].shapeID]).geometry.coordinates.map((point, i) => [...point, i]);

                    const modifiedTripPoints = trips[tripID].stopTimes.map((startStopTime, i, arr) => {
                      const stopID = stops[startStopTime.stopID].parent ?? startStopTime.stopID;
                      const stopData = stops[stopID];
                      const stopPoint = [stopData.lon, stopData.lat];

                      let firstClosestPoint = [0, 0, -1, 9999999];
                      let secondClosestPoint = [0, 0, -1, 9999999];

                      for (let pointsIndex = 0; pointsIndex < tripShape.length; pointsIndex++) {
                        const point = tripShape[pointsIndex];
                        const pointDistance = turf.distance(point, stopPoint);

                        if (pointDistance < secondClosestPoint[3]) { // first we see if we're closer than the 2nd
                          secondClosestPoint = [...point, pointDistance];

                          if (pointDistance < firstClosestPoint[3]) { // if we're also closer than the 1st, we swap em
                            [firstClosestPoint, secondClosestPoint] = [secondClosestPoint, firstClosestPoint];
                          };
                        } else { // we have passed the point and can stop
                          // first we should modify the shape array
                          tripShape.splice(0, pointsIndex - 2); // assuming the last two points are firstClosestPoint and secondClosestPoint, which they probably are
                          break;
                        };
                      };

                      const pointsSurroundingStop = [firstClosestPoint, secondClosestPoint].sort((a, b) => a[2] - b[2]);
                      const distanceBetweenPoints = turf.distance(pointsSurroundingStop[0].slice(0, 2), pointsSurroundingStop[1].slice(0, 2));
                      const percentAlongDistanceBetweenPointsIncludingMidPoint = pointsSurroundingStop[0][3] / (pointsSurroundingStop[0][3] + pointsSurroundingStop[1][3]);
                      
                      //console.log(pointsSurroundingStop[0][0], pointsSurroundingStop[0][1], pointsSurroundingStop[1][0], pointsSurroundingStop[1][1], percentAlongDistanceBetweenPointsIncludingMidPoint);
                      let lineMidPoint = calculateLineMidpointWithPercent(pointsSurroundingStop[0][0], pointsSurroundingStop[0][1], pointsSurroundingStop[1][0], pointsSurroundingStop[1][1], percentAlongDistanceBetweenPointsIncludingMidPoint);

                      // stuff thats only going to show up at the beginning and the end, and isnt really a problem, but is best to avoid
                      // this is when the stop is actually before or after both of the points, and not between them, so here we're
                      // just snapping the point to the closer one in the even that happens
                      if (distanceBetweenPoints < pointsSurroundingStop[1][3]) lineMidPoint = pointsSurroundingStop[0].slice(0, 2);
                      if (distanceBetweenPoints < pointsSurroundingStop[0][3]) lineMidPoint = pointsSurroundingStop[1].slice(0, 2);

                      return [
                        pointsSurroundingStop[0][2],
                        lineMidPoint,
                        pointsSurroundingStop[1][2],
                      ]
                    });

                    tripShape = turf.lineString(shapes[trips[tripID].shapeID]).geometry.coordinates;

                    trips[tripID].stopTimes.forEach((startStopTime, i, arr) => {
                      if (i === arr.length - 1) return; //as there is no i + 1 element

                      // i + 1 element
                      const endStopTime = arr[i + 1];

                      //getting parent stations
                      const startStopID = stops[startStopTime.stopID].parent ?? startStopTime.stopID;
                      const endStopID = stops[endStopTime.stopID].parent ?? endStopTime.stopID;
                      const additionalStopID = arr[i + 2] ? (stops[arr[i + 2].stopID].parent ?? arr[i + 2].stopID) : 'undefined';

                      //setting up the key dict
                      segmentKeyDict[`${trips[tripID].routeID}_${endStopID}_${additionalStopID}`] = `${startStopID}_${endStopID}`;

                      //dont redo work already done
                      if (segments[`${startStopID}_${endStopID}`]) return;

                      const startStopPointMeta = modifiedTripPoints[i];
                      const endStopPointMeta = modifiedTripPoints[i + 1];
                      
                      //getting sub-line for stations
                      const slicedShape = turf.lineString([
                        startStopPointMeta[1],
                        ...tripShape.slice(startStopPointMeta[2], endStopPointMeta[0] + 1),
                        endStopPointMeta[1],
                      ]);

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