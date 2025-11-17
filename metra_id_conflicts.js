const fs = require('fs');

const rawTripsFile = fs.readFileSync('./csv/metra/trips.txt', { encoding: 'utf8' });

const tripIDWithUnderscoresRegex = /_[A-Z]+\d+_/g;
const allMatches = [...rawTripsFile.match(tripIDWithUnderscoresRegex)].map((tripID) => tripID.replace('_', '').replace('_', ''));

let uniqueTrainNumbers = {};

allMatches.forEach((trip) => {
  if (!uniqueTrainNumbers[trip]) uniqueTrainNumbers[trip] = 0;
  uniqueTrainNumbers[trip]++;
})

let trainsByNumber = {};

Object.keys(uniqueTrainNumbers).forEach((trip) => {
  const trainAsNumber = trip.match(/\d+/)[0];
  if (!trainsByNumber[trainAsNumber]) trainsByNumber[trainAsNumber] = [];
  trainsByNumber[trainAsNumber].push(trip);
});

let linesWithDuplicates = {};
const filteredTrainNumbers = Object.keys(trainsByNumber).filter((trainNumber) => trainsByNumber[trainNumber].length > 1);

filteredTrainNumbers.forEach((trainNumber) => {
  trainsByNumber[trainNumber].forEach((trip) => {
    const lineID = trip.match(/[A-Z]+/)[0];
    if (!linesWithDuplicates[lineID]) linesWithDuplicates[lineID] = 0;
    linesWithDuplicates[lineID]++;
  })
  
  console.log(trainNumber, trainsByNumber[trainNumber])
})

console.log(filteredTrainNumbers)
console.log('-----');
console.log(linesWithDuplicates)
console.log('-----');
console.log(filteredTrainNumbers.length)