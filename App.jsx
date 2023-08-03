import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Map } from "react-map-gl";
import maplibregl from "maplibre-gl";
import DeckGL from "@deck.gl/react";
import { GeoJsonLayer, PolygonLayer } from "@deck.gl/layers";
import {
  LightingEffect,
  AmbientLight,
  _SunLight as SunLight,
} from "@deck.gl/core";
import { scaleThreshold } from "d3-scale";
import * as topojson from "topojson-client";
import {
  csv,
  rollup,
  index,
  filter,
  sum,
  scaleLinear,
  scaleSqrt,
  scaleSequential,
  scaleSequentialSqrt,
  extent,
  interpolateInferno,
  color as d3Color,
} from "d3";

import {
  Slider,
  Switch,
  Stack,
  Container,
  FormGroup,
  FormControlLabel,
} from "@mui/material";

import "./style.css";
// Source data GeoJSON
const DATA_URL =
  "https://raw.githubusercontent.com/jPeach-Stantec/flow-map-test/main/test-msoa.json"; // eslint-disable-line

// Source csv
const DATA_CSV =
  "https://raw.githubusercontent.com/jPeach-Stantec/flow-map-test/main/test-msoa.csv";
async function getData(url) {
  const geoP = (await fetch(url)).json();
  const dataP = csv(DATA_CSV).then((data) => index(data, (d) => d.ReturnName));

  return Promise.all([geoP, dataP]).then(([geo, data]) => {
    // console.log(geo, data);
    const geoData = topojson.feature(geo, geo.objects["test-msoa"]);
    const dataFields = Object.keys(data.get(data.keys().next().value)).slice(1);

    geoData.features.forEach((d) => {
      const vals = data.get(d.properties.msoa11nm);
      dataFields.forEach((k) => {
        if (k !== "ReturnName") d.properties[k] = vals ? +vals[k] : 0;
      });
    });
    return [geoData, dataFields];
  });
}
export const COLOR_SCALE = scaleThreshold()
  .domain([
    -0.6, -0.45, -0.3, -0.15, 0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1.05, 1.2,
  ])
  .range([
    [65, 182, 196],
    [127, 205, 187],
    [199, 233, 180],
    [237, 248, 177],
    // zero
    [255, 255, 204],
    [255, 237, 160],
    [254, 217, 118],
    [254, 178, 76],
    [253, 141, 60],
    [252, 78, 42],
    [227, 26, 28],
    [189, 0, 38],
    [128, 0, 38],
  ]);

const INITIAL_VIEW_STATE = {
  latitude: 53,
  longitude: -0.5,
  zoom: 6,
  maxZoom: 16,
  pitch: 45,
  bearing: 0,
};

const MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json";

const ambientLight = new AmbientLight({
  color: [255, 255, 255],
  intensity: 1.0,
});

const dirLight = new SunLight({
  timestamp: Date.UTC(2019, 7, 1, 8),
  color: [255, 255, 255],
  intensity: 1.0,
  _shadow: true,
});

const landCover = [
  [
    [1.76294, 49.864679],
    [1.76294, 59.3922591],
    [-7.6607354, 59.3922591],
    [-7.6607354, 49.864679],
  ],
];

const toRGB = (col) => {
  return [
    col.r,
    col.g,
    col.b, //, col.opacity || 0
  ];
};

function getDeckLayers(data, col, scenarios) {
  if (!data) return null;
  const domain = extent(
    filter(
      [
        ...data.features.map((d) => {
          const { msoa11nm, ...rest } = d.properties;
          return Math.max(...Object.values(rest));
        }),
        ...data.features.map((d) => {
          const { msoa11nm, ...rest } = d.properties;
          return Math.min(...Object.values(rest));
        }),
      ],
      (d) => d !== 0
    )
  );
  console.log(domain);
  const elevationScale = scaleLinear().domain(domain).range([0, 100000]);
  const colorScale = scaleSequential()
    .domain(domain)
    .interpolator(interpolateInferno);

  return [
    // only needed when using shadows - a plane for shadows to drop on
    new PolygonLayer({
      id: "ground",
      data: landCover,
      stroked: false,
      getPolygon: (f) => f,
      getFillColor: [0, 0, 0, 0],
    }),
    new GeoJsonLayer({
      id: "geojson",
      data,
      opacity: 0.8,
      stroked: false,
      filled: true,
      extruded: true,
      wireframe: true,
      autoHighlight: true,
      elevationScale: 1,
      getLineColor: [255, 255, 255],
      highlightColor: [100, 100, 100, 100],
      getLineWidth: 1,
      pickable: true,
      getElevation: (d) => elevationScale(d.properties[col]),
      updateTriggers: {
        getElevation: col,
        getFillColor: col,
      },
      getFillColor: (d) => toRGB(d3Color(colorScale(d.properties[col]))),
      transitions: {
        getElevation: {
          duration: 300,
        },
        getFillColor: {
          duration: 300,
        },
      },
    }),
  ];
}

function getTooltip({ object, scenario }) {
  // console.log(object, scenario);
  return (
    object && {
      html: `\
  <div><b>Zone Totals</b></div>
  <div>Zone: ${object.properties.msoa11nm}</div>
  <div>Demand: ${object.properties[scenario]}</div>
  `,
    }
  );
}

export default function App({ hasData = false, mapStyle = MAP_STYLE }) {
  const [effects] = useState(() => {
    const lightingEffect = new LightingEffect({ ambientLight, dirLight });
    lightingEffect.shadowColor = [0, 0, 0, 0.5];
    return [lightingEffect];
  });
  const [data, setData] = useState(hasData);
  const [scenarios, setScenarios] = useState([]);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [column, setColumn] = useState("Core");
  const firstRender = useRef(true);

  useEffect(() => {
    getData(DATA_URL).then(([data, scenarios]) => {
      setData(data);
      setScenarios(scenarios);
      setColumn(scenarios[0]);
    });
    firstRender.current = false;
    // const interval = setInterval(() => setColumn(column === "val" ? "val2" : "val"), 1000)
    // return () => { clearInterval(interval) }
  }, []);

  const updateColumn = (event, value) => {
    console.log("Updated");
    if (autoUpdate) setAutoUpdate(false);
    setColumn(scenarios[value]);
  };
  const updateToggle = (checked) => {
    setAutoUpdate(checked);
  };

  if (autoUpdate && !firstRender.current) {
    const t = setTimeout(() => {
      console.log("timer");
      const idx = (scenarios.indexOf(column) + 1) % scenarios.length;
      setColumn(scenarios[idx]);
    }, 3000);
  }
  const layers = getDeckLayers(data, column, scenarios);
  // const scenarios = getScenarios(data)

  const marks = scenarios.map((v, idx) => {
    return { value: idx, label: v };
  });

  console.log(scenarios.indexOf(column));

  return (
    <Container>
      <Stack direction={"row"} spacing={8}>
        <FormGroup
          sx={{
            zIndex: 1000,
            backgroundColor: "white",
            paddingRight: "10px",
            borderRadius: "5px",
          }}
        >
          <FormControlLabel
            labelPlacement="start"
            control={
              <Switch
                checked={autoUpdate}
                onChange={(event) => updateToggle(event.target.checked)}
              />
            }
            label="Auto-Update"
          />
        </FormGroup>

        <Slider
          aria-label="scenario-select"
          value={scenarios.indexOf(column)}
          step={1}
          marks={marks}
          onChange={(e, v) => updateColumn(e, v)}
          min={0}
          max={scenarios.length - 1}
          sx={{
            zIndex: 1000,
          }}
        />
      </Stack>
      <DeckGL
        layers={layers ? layers : null}
        effects={effects}
        initialViewState={INITIAL_VIEW_STATE}
        controller={true}
        getTooltip={(d) => getTooltip({ ...d, scenario: column })}
      >
        <Map
          reuseMaps
          mapLib={maplibregl}
          mapStyle={mapStyle}
          preventStyleDiffing={true}
        />
      </DeckGL>
    </Container>
  );
}

export function renderToDOM(container) {
  createRoot(container).render(<App />);
}
