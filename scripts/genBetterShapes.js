const fs = require('fs');
const { parse } = require('csv-parse');
const turf = require('@turf/turf');

const Image = require('./imageLib.js');

const feeds = require('../feeds.js');

return; //make sure i dont accidentally run this lol

const skeletonedToGeoJSON = (skeletonedData, properties = {}, ratio = 10000, minLat = 0, minLon = 0, curve = false) => {

  const toCoords = skeletonedData.polylines.map((polyline) => {
    return polyline.map((n) => {
      return [
        (n[1] / ratio) + minLon,
        (n[0] / ratio) + minLat
      ]
    })
  });

  const afterCurve = {
    ...skeletonedData,
    polylines: curve ? toCoords.map((polyline) => {
      return turf.bezierSpline(turf.lineString(polyline)).geometry.coordinates;
    }) : skeletonedData.polylines
  }

  return {
    "type": "FeatureCollection",
    "features": afterCurve.polylines.map((polyline) => {
      return {
        "type": "Feature",
        "properties": properties,
        "geometry": {
          "coordinates": polyline,
          "type": "LineString"
        }
      }
    })
  }
};

const coordToPixel = (coord, min, ratio = 10000) => Math.floor((coord - min) * ratio);
const pixelToCoord = (pixel, min, ratio = 10000) => (pixel / ratio) + min;

//removing old images
fs.existsSync('./images') && fs.rmSync('./images', { recursive: true });
fs.mkdirSync('./images');

//removing old better shapes
fs.existsSync('./better_shapes') && fs.rmSync('./better_shapes', { recursive: true });
fs.mkdirSync('./better_shapes');

Object.keys(feeds).forEach((feed) => {
  //if (feed !== 'cta') return;
  //if (feed !== 'metra') return;
  //if (feed !== 'southshore') return;
  //if (feed !== 'chicago') return;
  if (feed !== 'SM') return;

  if (feeds[feed].disabled === true) return;

  let feedPath = `./csv/${feed}`;
  if (feeds[feed].subfolder) {
    feedPath = `./csv/${feed}/${feeds[feed].subfolder}`
  }

  //making folders for images and geojson
  fs.mkdirSync(`./images/${feed}`)
  fs.mkdirSync(`./better_shapes/${feed}`)

  let lines = {};

  let routes = {};
  let shapeIDToRouteID = {};
  let routeIDReplacements = {};

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

      routes[row.route_id] = {
        color: row.route_color,
        text_color: row.route_text_color,
        type: row.route_type,
        shapes: [],
        minLat: 99999,
        maxLat: -9999,
        minLon: 99999,
        maxLon: -9999,
      }
    })
    .on('end', function () {
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
          if (feeds[feed]['useRouteShortNameAsRouteCode']) row.route_id = routeIDReplacements[row.route_id];
          routes[row.route_id].shapes.push(row.shape_id);
          shapeIDToRouteID[row.shape_id] = row.route_id;
        })
        .on('end', function () {
          console.log(`Processing ${feed} shapes...`)
          fs.createReadStream(`${feedPath}/shapes.txt`)
            .pipe(parse({
              delimiter: feeds[feed]['seperatorOverrides'].shapes ?? feeds[feed]['separator'],
              columns: true,
              skip_empty_lines: true,
              bom: true,
              trim: feeds[feed]['trim'],
            }))
            .on('data', function (row) {
              const routeID = shapeIDToRouteID[row.shape_id];
              //console.log(row.trip_id, shapeIDToRouteID[row.shape_id])

              if (!routeID) return;

              const lat = Number(row.shape_pt_lat);
              const lon = Number(row.shape_pt_lon);

              //min and max lat and lon
              if (lat > routes[routeID].maxLat) routes[routeID].maxLat = lat;
              if (lat < routes[routeID].minLat) routes[routeID].minLat = lat;
              if (lon > routes[routeID].maxLon) routes[routeID].maxLon = lon;
              if (lon < routes[routeID].minLon) routes[routeID].minLon = lon;

              if (!lines[row.shape_id]) lines[row.shape_id] = [];

              lines[row.shape_id].push([lat, lon, Number(row.shape_pt_sequence)]);
            })
            .on('end', function () {
              Object.keys(routes).forEach((routeID) => {
                const route = routes[routeID];

                const coordWidth = Math.floor(route.maxLat - route.minLat);
                const coordHeight = Math.floor(route.maxLon - route.minLon);

                const imageWidth = Math.floor((route.maxLat - route.minLat) * 10000) + 1;
                const imageHeight = Math.floor((route.maxLon - route.minLon) * 10000) + 1;

                console.log(`Creating image of size ${[imageWidth, imageHeight]} for ${feed} route ${routeID}`);

                const image = new Image(imageWidth, imageHeight);

                console.log(`Image created for ${feed} route ${routeID}`);
                console.log(`Drawing lines for ${feed} route ${routeID}`);

                route.shapes.forEach((shapeID) => {
                  const line = lines[shapeID];
                  const sortedPixels = line.sort((a, b) => b[2] - a[2]).map((n) => [coordToPixel(n[0], route.minLat), coordToPixel(n[1], route.minLon)]);

                  for (let i = 0; i < sortedPixels.length - 1; i++) {
                    image.drawLine(sortedPixels[i], sortedPixels[i + 1]);
                  }
                })

                console.log(`Finished)(?) drawing image for ${feed} route ${routeID}`)

                console.log(`Slightly blurring and skeletonizing image for ${feed} route ${routeID} for skeletonization`);

                image.blurImage();
                image.threshold(); //bring em back to 255
                //image.blurImage(); //do it again for the funny
                //image.blurImage(); //this is working???
                //image.threshold(); //once more back to 255

                image.saveImageToPath(`./images/${feed}/${routeID}.jpg`, true);
                //image.saveImageToPath('./images/initial.jpg', false);

                const skeletoned = image.skeleton();

                fs.writeFileSync(`./better_shapes/${feed}/${routeID}.json`, JSON.stringify(skeletonedToGeoJSON(skeletoned, {}, 10000, route.minLat, route.minLon, true), null, 2), { encoding: 'utf-8' })

                /*
                fs.writeFileSync('./meta.json', JSON.stringify({
                  minLat,
                  minLon,
                  maxLat,
                  maxLon,
                  imageWidth,
                  imageHeight
                }, null, 2), {
                  encoding: 'utf-8'
                })
                */

                console.log('saved image')
              })
            })
        })
    })
});