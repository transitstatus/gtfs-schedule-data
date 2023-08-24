//generates feeds from passio.json
const fs = require('fs');

const rawFeeds = JSON.parse(fs.readFileSync('passio.json'));

let finalFeeds = {};

rawFeeds.forEach((feed) => {
  console.log(feed)
  finalFeeds[feed.username] = {
    url: `https://passio3.com/${feed.username}/passioTransit/gtfs/google_transit.zip`,
    headers: {},
    seperator: ',',
    seperatorOverrides: {},
    colorOverrides: {},
  }
})

fs.writeFileSync('passioFeeds.json', JSON.stringify(finalFeeds, null, 2));