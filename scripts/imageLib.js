//a small(ish) monochrome image library of sorts that wont eat up all of my ram when i need a few million pixels
//just array of booleans. originally was going to do bitwise ops on an array of ints, but that was too much work

const sharp = require('sharp');
const TraceSkeleton = require('skeleton-tracing-js')

class Image {
  //in pixel size
  constructor(x, y) {
    this._width = x;
    this._height = y;
    this._data = new Uint8Array(x * y);
  }

  //takes an x y coordinate pair and returns
  coordinateToArrayPosition(coord) {
    const x = coord[0];
    const y = coord[1];

    if (x >= this._width || y >= this._height) {
      throw new Error(`Coordinate ${coord} is out of range for image of size ${[this._width, this._height]}`)
    }

    //moving y number widths through the image
    const rowOffset = y * this._width;
    const bitNumber = rowOffset + x;
    //const byteNumber = Math.floor(bitNumber / 8);
    //const bitOffsetInByte = bitNumber % 8;

    return bitNumber;
  }

  setArray(array) {
    this._data = array;
  }

  setPoint(coord, value) {
    const position = this.coordinateToArrayPosition(coord);

    let actualValue = 0;
    if (value === true || value > 0) {
      value = 255;
    }

    this._data[position] = value;
  }

  lerp(start, end, t) {
    return start * (1 - t) + end * t;
  }

  //used for line drawing
  interpolatePoints(pointA, pointB) {
    let [x0, y0] = pointA;
    let [x1, y1] = pointB;

    const points = [];

    // Calculate differences and absolute differences
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);

    // Determine the sign of the differences
    const sx = (x0 < x1) ? 1 : -1;
    const sy = (y0 < y1) ? 1 : -1;

    let err = dx - dy;

    // Initial point
    points.push([x0, y0]);

    while (!(x0 === x1 && y0 === y1)) {
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
      // Add point to the array
      points.push([x0, y0]);
    }

    return points;
  }

  drawLine(coordA, coordB) {
    const interprolatedPoints = this.interpolatePoints(coordA, coordB);

    interprolatedPoints.forEach((point) => this.setPoint(point, 1));
  }

  blurImage() {
    const pixels = this._data;
    const width = this._width;
    const height = this._height;

    // Create a copy of the original pixels array
    const blurredPixels = pixels.slice();

    // Iterate through each pixel in the image
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Calculate the index of the current pixel in the 1D array
        const index = y * width + x;


        // Apply a simple blur by averaging the neighboring pixels
        const average = this.calculateAverage(pixels, width, height, x, y);
        blurredPixels[index] = average;
      }
    }

    this._data = blurredPixels;
  }

  calculateAverage(pixels, width, height, x, y) {
    let sum = 0;
    let count = 0;

    // Iterate through neighboring pixels
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const neighborX = x + i;
        const neighborY = y + j;

        // Check if the neighboring pixel is within the image bounds
        if (neighborX >= 0 && neighborX < width && neighborY >= 0 && neighborY < height) {
          // Calculate the index of the neighboring pixel
          const neighborIndex = neighborY * width + neighborX;

          // Accumulate the pixel values
          sum += pixels[neighborIndex];
          count++;
        }
      }
    }

    // Calculate the average value
    const average = sum / count;
    return average;
  }

  threshold() {
    this._data = this._data.map(pixel => pixel > 0 ? 255 : 0);
  }

  getPoint(coord) {
    const position = this.coordinateToArrayPosition(coord);

    return position;
  }

  skeleton() {
    return TraceSkeleton.fromBoolArray(this._data, this._width, this._height);
  }

  //probably dont use this with super large ones lol
  printArrayToConsole() {
    console.log("Raw array:")
    let i = 0;
    for (let y = 0; y < this._height; y++) {
      for (let x = 0; x < this._width; x++) {
        process.stdout.write(this._data[i].toString());
        process.stdout.write(' ');
        i++;
      }

      process.stdout.write('\n');
    }
  }

  saveImageToPath(path = './image.jpg', rotate = false) {
    sharp(this._data, {
      raw: {
        width: this._width,
        height: this._height,
        channels: 1,
      }
    })
      .rotate(rotate ? 270 : 0)
      .toFile(path, (err, info) => {
        if (err) console.error(err);
        if (info) console.log(info);
      })
  }
}

module.exports = Image;