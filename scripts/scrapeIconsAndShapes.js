const fs = require('fs');

const agencies = fs.readdirSync('./data');

let iconsList = [];
let shapesList = [];

for (let i = 0; i < agencies.length; i++) {
  const agency = agencies[i];

  const icons = fs.readdirSync(`./data/${agency}/icons`).map((fileName) => `https://gtfs.piemadd.com/data/${agency}/icons/${fileName}`);
  const shapes = fs.readdirSync(`./data/${agency}/shapes`).map((fileName) => `https://gtfs.piemadd.com/data/${agency}/shapes/${fileName}`);

  iconsList.push(...icons);
  shapesList.push(...shapes);
}

fs.writeFileSync('./iconsList.json', JSON.stringify(iconsList));
fs.writeFileSync('./shapesList.json', JSON.stringify(shapesList));