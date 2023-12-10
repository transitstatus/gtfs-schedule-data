# GTFS Schedule Data

This package hosts the static GTFS data used by [store](https://github.com/piemadd/store) for transit data. 

## Installation
```sh
git clone https://github.com/piemadd/gtfs-schedule-data
```

Make sure to create a .env file with the following variables:
- `metra_authorization` : The Basic authorization string for the metra API. In format:
 ```js
 'Basic ' + base64(`${username}:${password}`)
 ```
- `bay_511` : Bay area 511 api key

## Running

Simply running `node ./scripts/generate.js` will do basic ingestion creating icons, shapes, and some json files with routes and stops. 

~~After doing this, the optional `node genPaths.js` can be run to create accurate lines between each stop. This is used to guesstimate vehicle positions when one isn't given and for the record (aka strava for transit).~~
JK that didn't work. A lot of work has to happen on other services for that to happen.

Make sure to run `node ./scripts/genDir.js` to generate the HTML directories.