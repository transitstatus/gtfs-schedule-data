const feeds = {
  amtrak: {
    url: "https://content.amtrak.com/content/gtfs/GTFS.zip",
    headers: {},
    urlEnv: [],
    separator: ",",
    seperatorOverrides: {},
    colorOverrides: {},
    mapCodeOverrides: {},
    colorReplacements: {
      "CAE4F1": "5366c9"
    },
    textColorReplacements: {},
    trim: false,
    noSegments: false,
    disabled: false
  },
  viarail: {
    url: "https://www.viarail.ca/sites/all/files/gtfs/viarail.zip",
    headers: {},
    urlEnv: [],
    separator: ",",
    seperatorOverrides: {},
    colorOverrides: {},
    mapCodeOverrides: {},
    colorReplacements: {},
    textColorReplacements: {},
    trim: false,
    noSegments: false,
    disabled: false
  },
  brightline: {
    url: "http://feed.gobrightline.com/bl_gtfs.zip",
    headers: {},
    urlEnv: [],
    separator: ",",
    seperatorOverrides: {},
    colorOverrides: {},
    mapCodeOverrides: {},
    colorReplacements: {
      "F2E205": "FFDB00"
    },
    textColorReplacements: {
      //"0D0D0D": "363636"
    },
    trim: false,
    noSegments: false,
    disabled: false
  },
  flixbus_us: {
    url: "https://gtfs.gis.flix.tech/gtfs_generic_us.zip",
    headers: {},
    urlEnv: [],
    separator: ",",
    seperatorOverrides: {},
    colorOverrides: {},
    mapCodeOverrides: {},
    colorReplacements: {},
    textColorReplacements: {
      "73D700": "000000"
    },
    trim: false,
    noSegments: true,
    disabled: false
  },
  bart: {
    url: "https://www.bart.gov/dev/schedules/google_transit.zip",
    headers: {},
    urlEnv: [],
    separator: ",",
    seperatorOverrides: {},
    colorOverrides: {},
    mapCodeOverrides: {},
    colorReplacements: {},
    textColorReplacements: {},
    trim: false,
    noSegments: false,
    disabled: false
  },
  RG: {
    name: "Regional GTFS",
    url: "https://api.511.org/transit/datafeeds?api_key=env.bay_511&operator_id=RG",
    headers: {},
    urlEnv: [
      "env.bay_511"
    ],
    separator: ",",
    seperatorOverrides: {},
    colorOverrides: {},
    mapCodeOverrides: {},
    colorReplacements: {},
    textColorReplacements: {},
    trim: false,
    noSegments: true,
    disabled: false
  },
  nashville: {
    url: "https://www.wegotransit.com/GoogleExport/google_transit.zip",
    headers: {},
    urlEnv: [],
    separator: ",",
    seperatorOverrides: {},
    colorOverrides: {},
    mapCodeOverrides: {},
    colorReplacements: {},
    textColorReplacements: {},
    trim: false,
    noSegments: true,
    disabled: false
  },
  dekalb_il: {
    url: "https://data.trilliumtransit.com/gtfs/cityofdekalb-il-us/cityofdekalb-il-us.zip",
    headers: {},
    urlEnv: [],
    separator: ",",
    seperatorOverrides: {},
    colorOverrides: {},
    mapCodeOverrides: {},
    colorReplacements: {},
    textColorReplacements: {},
    trim: false,
    noSegments: true,
    useRouteShortNameAsRouteCode: true,
    disabled: false
  },
  marta: {
    name: "MARTA",
    url: "https://www.itsmarta.com/google_transit_feed/google_transit.zip",
    headers: {},
    urlEnv: [],
    separator: ",",
    seperatorOverrides: {},
    colorOverrides: {},
    mapCodeOverrides: {},
    colorReplacements: {},
    textColorReplacements: {},
    trim: false,
    noSegments: true,
    disabled: false
  },
  hawaii_thebus: {
    name: "The Bus (Hawai'i)",
    url: "https://www.thebus.org/transitdata/production/google_transit.zip",
    headers: {},
    urlEnv: [],
    separator: ",",
    seperatorOverrides: {},
    colorOverrides: {},
    mapCodeOverrides: {},
    colorReplacements: {},
    textColorReplacements: {},
    trim: false,
    noSegments: true,
    disabled: false
  },
  metra: {
    name: "Metra",
    url: "https://gtfsapi.metrarail.com/gtfs/raw/schedule.zip",
    headers: {
      "Authorization": "env.metra_authorization"
    },
    urlEnv: [],
    separator: ",",
    seperatorOverrides: {
      "stops": ",",
      "shapes": ","
    },
    colorOverrides: {},
    mapCodeOverrides: {},
    colorReplacements: {},
    textColorReplacements: {},
    trim: true,
    disabled: false
  },
  njt_rail: {
    name: "NJT Rail",
    url: "https://raildata.njtransit.com/api/GTFSRT/getGTFS",
    headers: {
      "accept": "*/*"
    },
    "body": {
      "token": "env.njt_rail_key"
    },
    "bodyType": "formData",
    urlEnv: [],
    separator: ",",
    seperatorOverrides: {},
    colorOverrides: {},
    mapCodeOverrides: {},
    colorReplacements: {},
    "allShapes": false,
    textColorReplacements: {},
    trim: true,
    disabled: false
  },
  njt_rail_nonrt: {
    name: "NJT Rail",
    url: "https://www.njtransit.com/rail_data.zip",
    headers: {},
    urlEnv: [],
    separator: ",",
    seperatorOverrides: {},
    colorOverrides: {},
    mapCodeOverrides: {},
    colorReplacements: {},
    "allShapes": false,
    textColorReplacements: {},
    trim: true,
    disabled: false
  },
  wmata_rail: {
    name: "WMATA Rail",
    url: "https://api.wmata.com/gtfs/rail-gtfs-static.zip",
    headers: {
      "api_key": "env.wmata_primary",
      "Cache-Control": "no-cache"
    },
    urlEnv: [],
    separator: ",",
    seperatorOverrides: {},
    colorOverrides: {},
    mapCodeOverrides: {},
    colorReplacements: {},
    textColorReplacements: {},
    trim: true,
    disabled: false
  },
  nyct_subway: {
    name: "NYC Subway",
    url: "http://web.mta.info/developers/data/nyct/subway/google_transit.zip",
    headers: {},
    urlEnv: [],
    separator: ",",
    seperatorOverrides: {},
    colorOverrides: {
      "1": [
        "EE352E",
        "F2F2F2"
      ],
      "2": [
        "EE352E",
        "F2F2F2"
      ],
      "3": [
        "EE352E",
        "F2F2F2"
      ],
      "4": [
        "00933C",
        "F2F2F2"
      ],
      "5": [
        "00933C",
        "F2F2F2"
      ],
      "6": [
        "00933C",
        "F2F2F2"
      ],
      "7": [
        "B933AD",
        "F2F2F2"
      ],
      "5X": [
        "00933C",
        "F2F2F2"
      ],
      "6X": [
        "00A65C",
        "F2F2F2"
      ],
      "7X": [
        "B933AD",
        "F2F2F2"
      ],
      "GS": [
        "6D6E71",
        "F2F2F2"
      ],
      "A": [
        "2850AD",
        "FFFFFF"
      ],
      "B": [
        "FF6319",
        "FFFFFF"
      ],
      "C": [
        "2850AD",
        "FFFFFF"
      ],
      "D": [
        "FF6319",
        "FFFFFF"
      ],
      "E": [
        "2850AD",
        "FFFFFF"
      ],
      "F": [
        "FF6319",
        "F2F2F2"
      ],
      "FX": [
        "FF6319",
        "F2F2F2"
      ],
      "FS": [
        "FF6319",
        "F2F2F2"
      ],
      "G": [
        "67b441",
        "F2F2F2"
      ],
      "J": [
        "996633",
        "F2F2F2"
      ],
      "L": [
        "A7A9AC",
        "F2F2F2"
      ],
      "M": [
        "FF6319",
        "F2F2F2"
      ],
      "N": [
        "FCCC0A",
        "000000"
      ],
      "Q": [
        "FCCC0A",
        "000000"
      ],
      "R": [
        "FCCC0A",
        "000000"
      ],
      "H": [
        "A7A9AC",
        "F2F2F2"
      ],
      "W": [
        "FCCC0A",
        "000000"
      ],
      "Z": [
        "996633",
        "F2F2F2"
      ],
      "SI": [
        "2850AD",
        "FFFFFF"
      ]
    },
    mapCodeOverrides: {},
    colorReplacements: {},
    textColorReplacements: {},
    trim: false,
    noSegments: false,
    disabled: false
  },
  lirr: {
    name: "Long Island Railroad (MTA)",
    url: "http://web.mta.info/developers/data/lirr/google_transit.zip",
    headers: {},
    urlEnv: [],
    separator: ",",
    seperatorOverrides: {},
    colorOverrides: {},
    mapCodeOverrides: {},
    colorReplacements: {},
    textColorReplacements: {},
    trim: false,
    noSegments: true,
    disabled: true
  },
  mnrr: {
    name: "Metro North (MTA)",
    url: "http://web.mta.info/developers/data/mnr/google_transit.zip",
    headers: {},
    urlEnv: [],
    separator: ",",
    seperatorOverrides: {},
    colorOverrides: {},
    mapCodeOverrides: {},
    colorReplacements: {},
    textColorReplacements: {},
    trim: false,
    noSegments: true,
    disabled: false
  },
  nyct_bronx: {
    name: "NYC Bronx Buses",
    url: "http://web.mta.info/developers/data/nyct/bus/google_transit_bronx.zip",
    headers: {},
    urlEnv: [],
    separator: ",",
    seperatorOverrides: {},
    colorOverrides: {},
    textColorReplacements: {},
    mapCodeOverrides: {},
    colorReplacements: {},
    trim: false,
    noSegments: true,
    disabled: false
  },
  nyct_brooklyn: {
    name: "NYC Brooklyn Buses",
    url: "http://web.mta.info/developers/data/nyct/bus/google_transit_brooklyn.zip",
    headers: {},
    urlEnv: [],
    separator: ",",
    seperatorOverrides: {},
    colorOverrides: {},
    mapCodeOverrides: {},
    colorReplacements: {},
    textColorReplacements: {},
    trim: false,
    noSegments: true,
    disabled: false
  },
  nyct_manhattan: {
    name: "NYC Manhattan Buses",
    url: "http://web.mta.info/developers/data/nyct/bus/google_transit_manhattan.zip",
    headers: {},
    urlEnv: [],
    separator: ",",
    seperatorOverrides: {},
    colorOverrides: {},
    mapCodeOverrides: {},
    colorReplacements: {},
    textColorReplacements: {},
    trim: false,
    noSegments: true,
    disabled: false
  },
  nyct_queens: {
    name: "NYC Queens Buses",
    url: "http://web.mta.info/developers/data/nyct/bus/google_transit_queens.zip",
    headers: {},
    urlEnv: [],
    separator: ",",
    seperatorOverrides: {},
    colorOverrides: {},
    mapCodeOverrides: {},
    colorReplacements: {},
    textColorReplacements: {},
    trim: false,
    noSegments: true,
    disabled: false
  },
  nyct_staten_island: {
    name: "NYC Staten Island Buses",
    url: "http://web.mta.info/developers/data/nyct/bus/google_transit_staten_island.zip",
    headers: {},
    urlEnv: [],
    separator: ",",
    seperatorOverrides: {},
    colorOverrides: {},
    mapCodeOverrides: {},
    colorReplacements: {},
    textColorReplacements: {},
    trim: false,
    noSegments: true,
    disabled: false
  },
  nyct_mta_bus_company: {
    name: "NYC MTA Bus Company",
    url: "http://web.mta.info/developers/data/busco/google_transit.zip",
    headers: {},
    urlEnv: [],
    separator: ",",
    seperatorOverrides: {},
    colorOverrides: {},
    mapCodeOverrides: {},
    colorReplacements: {},
    textColorReplacements: {},
    trim: false,
    noSegments: true,
    disabled: false
  },
  cta: {
    name: "Chicago Transit Authority",
    url: "https://www.transitchicago.com/downloads/sch_data/google_transit.zip",
    headers: {},
    urlEnv: [],
    separator: ",",
    seperatorOverrides: {},
    colorOverrides: {},
    mapCodeOverrides: {
      "Red": "R",
      "P": "P",
      "Y": "Y",
      "Blue": "B",
      "Pink": "V",
      "G": "G",
      "Brn": "T",
      "Org": "O"
    },
    colorReplacements: {
      "565a5c": "949ca1"
    },
    textColorReplacements: {},
    trim: false,
    noSegments: true, // change to true at some point
    disabled: false
  },
  southshore: {
    name: "South Shore Line",
    url: "http://www.mysouthshoreline.com/google/google_transit.zip",
    headers: {},
    urlEnv: [],
    separator: ",",
    seperatorOverrides: {},
    colorOverrides: {
      "so_shore": [
        "EA6E10",
        "000000"
      ]
    },
    mapCodeOverrides: {},
    colorReplacements: {},
    textColorReplacements: {},
    trim: false,
    noSegments: false,
    disabled: false,
    //"subfolder": "new schedule/"
  },
  casco_bay_lines: {
    name: "Casco Bay Lines",
    url: "http://smttracker.com/downloads/gtfs/cascobaylines-portland-me-usa.zip",
    headers: {},
    urlEnv: [],
    separator: ",",
    seperatorOverrides: {},
    colorOverrides: {},
    mapCodeOverrides: {},
    colorReplacements: {},
    textColorReplacements: {},
    trim: true,
    noSegments: true,
    disabled: true
  },
  gp_metro: {
    name: "GP Metro",
    url: "http://www.smttracker.com/downloads/gtfs/greater-portland-me.zip",
    headers: {},
    urlEnv: [],
    separator: ",",
    seperatorOverrides: {},
    colorOverrides: {},
    mapCodeOverrides: {},
    colorReplacements: {},
    textColorReplacements: {},
    trim: true,
    noSegments: true,
    disabled: true
  },
  south_portland: {
    name: "South Portland Bus Lines",
    url: "http://www.smttracker.com/downloads/gtfs/south-portland-me-us.zip",
    headers: {},
    urlEnv: [],
    separator: ",",
    seperatorOverrides: {},
    colorOverrides: {},
    mapCodeOverrides: {},
    colorReplacements: {},
    textColorReplacements: {},
    trim: true,
    noSegments: true,
    disabled: true
  }
};

module.exports = feeds;