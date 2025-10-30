const fs = require('fs');

const agencies = fs.readdirSync('./data');

let shapesList = [];
let colorsList = [];

for (let i = 0; i < agencies.length; i++) {
  const agency = agencies[i];

  const shapes = fs.readdirSync(`./data/${agency}/shapes`).map((fileName) => `${agency}/shapes/${fileName}`);

  const meta = JSON.parse(fs.readFileSync(`./data/${agency}/meta.json`, { encoding: 'utf8' }));

  colorsList.push(...meta.colorSets);

  shapesList.push(...shapes);
}

fs.writeFileSync('./shapesList.json', JSON.stringify(shapesList));
fs.writeFileSync('./colorsList.json', JSON.stringify([...new Set(colorsList.sort())]));