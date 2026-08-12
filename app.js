const defaultMapCenter = [37.7749, -122.4194];
const map = L.map('map').setView(defaultMapCenter, 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const ui = {
  fileA: document.getElementById('fileA'),
  fileB: document.getElementById('fileB'),
  drawLineBtn: document.getElementById('drawLineBtn'),
  clearBtn: document.getElementById('clearBtn'),
  playPauseBtn: document.getElementById('playPauseBtn'),
  speedGroup: document.getElementById('speedGroup'),
  speedDownBtn: document.getElementById('speedDownBtn'),
  speedUpBtn: document.getElementById('speedUpBtn'),
  speedValue: document.getElementById('speedValue'),
  speedLegend: document.getElementById('speedLegend'),
  speedLegendItems: document.getElementById('speedLegendItems'),
  timeline: document.getElementById('timeline'),
  timelineTitle: document.getElementById('timelineTitle'),
  statsRow: document.getElementById('statsRow'),
  fileNameA: document.getElementById('fileNameA'),
  fileNameB: document.getElementById('fileNameB'),
  fileListA: document.getElementById('fileListA'),
  fileListB: document.getElementById('fileListB'),
  errorMessage: document.getElementById('errorMessage'),
  archiveForm: document.getElementById('archiveForm'),
  archiveFile: document.getElementById('archiveFile'),
  archiveFileSummary: document.getElementById('archiveFileSummary'),
  archiveSummaryName: document.getElementById('archiveSummaryName'),
  archiveSummarySize: document.getElementById('archiveSummarySize'),
  archiveSummaryDate: document.getElementById('archiveSummaryDate'),
  archiveSummaryDuration: document.getElementById('archiveSummaryDuration'),
  archiveSummaryDistance: document.getElementById('archiveSummaryDistance'),
  archiveSummaryPoints: document.getElementById('archiveSummaryPoints'),
  archiveSummaryDirection: document.getElementById('archiveSummaryDirection'),
  archiveSummaryMessage: document.getElementById('archiveSummaryMessage'),
  tripDirection: document.getElementById('tripDirection'),
  routeName: document.getElementById('routeName'),
  bikeSetup: document.getElementById('bikeSetup'),
  tripNotes: document.getElementById('tripNotes'),
  saveTripBtn: document.getElementById('saveTripBtn'),
  refreshArchiveBtn: document.getElementById('refreshArchiveBtn'),
  archiveStatus: document.getElementById('archiveStatus'),
  leaderboardBody: document.getElementById('leaderboardBody'),
  fileTriggers: [...document.querySelectorAll('.file-trigger')]
};

const routeStyles = [
  {name: 'Route A', color: '#2563eb'},
  {name: 'Route B', color: '#a21caf'}
];
const playbackSpeeds = [1, 2, 4, 8, 16];
const speedTierColors = ['#dc2626', '#f97316', '#eab308', '#84cc16', '#16a34a'];

const state = {
  routes: routeStylesTemplate(),
  startLine: null,
  rawPointLayer: L.layerGroup().addTo(map),
  intersectionLayer: L.layerGroup().addTo(map),
  drawMode: false,
  drawPoints: [],
  isPlaying: false,
  currentSec: 0,
  maxSec: 0,
  rafId: null,
  lastFrameTs: null,
  playbackSpeedIndex: 0,
  speedBuckets: null,
  hasUserInteractedMap: false,
  archiveConfigured: false,
  archivedTrips: [],
  archiveFileValid: false,
  commuteConfig: null
};

ui.fileA.addEventListener('change', () => handleFileLoad(0, [...(ui.fileA.files ?? [])]));
ui.fileB.addEventListener('change', () => handleFileLoad(1, [...(ui.fileB.files ?? [])]));
ui.fileTriggers.forEach((trigger) => {
  trigger.addEventListener('click', () => {
    const target = document.getElementById(trigger.dataset.target);
    target?.click();
  });
});
ui.drawLineBtn.addEventListener('click', toggleDrawMode);
ui.clearBtn.addEventListener('click', clearAll);
ui.playPauseBtn.addEventListener('click', togglePlayback);
ui.speedDownBtn.addEventListener('click', () => changePlaybackSpeed(-1));
ui.speedUpBtn.addEventListener('click', () => changePlaybackSpeed(1));
ui.timeline.addEventListener('input', () => {
  state.currentSec = Number(ui.timeline.value);
  renderAtTime(state.currentSec);
});
ui.archiveForm.addEventListener('submit', saveTripToArchive);
ui.archiveFile.addEventListener('change', previewArchiveFile);
ui.refreshArchiveBtn.addEventListener('click', loadTripArchive);
ui.leaderboardBody.addEventListener('click', onLeaderboardClick);
map.on('click', onMapClick);
registerMapInteractionTracking();
initializeMapCenterFromUserLocation();
loadTripArchive();



function registerMapInteractionTracking() {
  const mapContainer = map.getContainer();
  const markInteracted = () => { state.hasUserInteractedMap = true; };
  mapContainer.addEventListener('pointerdown', markInteracted, {passive: true});
  mapContainer.addEventListener('wheel', markInteracted, {passive: true});
}

function hasLoadedSamples() {
  return state.routes.some((route) => route.samples.length > 0);
}
function initializeMapCenterFromUserLocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    ({coords}) => {
      if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) return;
      if (hasLoadedSamples() || state.hasUserInteractedMap) return;
      map.setView([coords.latitude, coords.longitude], 12);
    },
    () => {},
    {enableHighAccuracy: false, maximumAge: 15 * 60 * 1000, timeout: 5000}
  );
}
function routeStylesTemplate() {
  return routeStyles.map((style, idx) => ({id: idx, ...style, samples: []}));
}

function clearAll() {
  clearError();
  stopPlayback();
  for (const route of state.routes) {
    for (const sample of route.samples) {
      sample.layerGroup?.remove();
      sample.marker?.remove();
    }
  }
  state.routes = routeStylesTemplate();

  if (state.startLine) {
    state.startLine.remove();
    state.startLine = null;
  }

  state.rawPointLayer.clearLayers();
  state.intersectionLayer.clearLayers();

  state.drawMode = false;
  state.drawPoints = [];
  state.currentSec = 0;
  state.maxSec = 0;
  state.speedBuckets = null;
  state.playbackSpeedIndex = 0;
  ui.fileA.value = '';
  ui.fileB.value = '';
  ui.fileNameA.textContent = 'No files selected';
  ui.fileNameB.textContent = 'No files selected';
  renderFileLists();
  ui.timeline.value = 0;
  ui.timeline.max = 0;
  ui.timeline.disabled = true;
  ui.timelineTitle.textContent = 'Timeline · 00:00';
  ui.statsRow.innerHTML = '';
  updateSpeedControl(false);
  renderSpeedLegend();
  ui.playPauseBtn.disabled = true;
  ui.playPauseBtn.textContent = 'Play';
  ui.drawLineBtn.textContent = 'Set starting line';
}

async function handleFileLoad(routeIdx, files) {
  if (!files.length) return;
  clearError();
  const route = state.routes[routeIdx];

  try {
    const nextSamples = [];
    for (const [sampleIdx, file] of files.entries()) {
      const text = await file.text();
      const points = parseGpx(text);
      if (points.length < 2) throw new Error(`${file.name} has fewer than two points.`);
      nextSamples.push({
        id: `${routeIdx}-${sampleIdx}`,
        fileName: file.name,
        points,
        layerGroup: null,
        marker: null,
        syncStartIdx: null,
        syncTimeline: null
      });
    }

    for (const sample of route.samples) {
      sample.layerGroup?.remove();
      sample.marker?.remove();
    }
    route.samples = nextSamples.map((sample) => ({
      ...sample,
      layerGroup: L.layerGroup().addTo(map)
    }));

    updateFileName(routeIdx, route.samples.map((sample) => sample.fileName));
    ui[routeIdx === 0 ? 'fileA' : 'fileB'].value = '';
    recalculateSpeedDomain();
    redrawAllRoutes();
    fitRoutes();
    attemptSyncAndPreparePlayback();
  } catch (err) {
    showError(`Could not load files for ${route.name}: ${err.message}`);
  }
}

function showError(message) { ui.errorMessage.textContent = message; ui.errorMessage.hidden = false; }
function clearError() { ui.errorMessage.textContent = ''; ui.errorMessage.hidden = true; }
function updateFileName(routeIdx, names) {
  const txt = !names.length ? 'No files selected' : `${names.length} file(s): ${names.join(', ')}`;
  if (routeIdx === 0) ui.fileNameA.textContent = txt;
  if (routeIdx === 1) ui.fileNameB.textContent = txt;
  renderFileLists();
}

function renderFileLists() {
  renderFileListForRoute(0);
  renderFileListForRoute(1);
}

function renderFileListForRoute(routeIdx) {
  const route = state.routes[routeIdx];
  const listEl = ui[routeIdx === 0 ? 'fileListA' : 'fileListB'];
  if (!listEl) return;
  listEl.innerHTML = '';
  route.samples.forEach((sample, sampleIdx) => {
    const row = document.createElement('div');
    row.className = 'file-list-row';

    const name = document.createElement('span');
    name.className = 'file-list-name';
    name.textContent = sample.fileName;
    name.title = sample.fileName;

    const swapButton = document.createElement('button');
    swapButton.type = 'button';
    swapButton.className = 'swap-button';
    swapButton.textContent = routeIdx === 0 ? '→' : '←';
    swapButton.setAttribute('aria-label', `Move ${sample.fileName} to ${state.routes[1 - routeIdx].name}`);
    swapButton.addEventListener('click', () => swapSample(routeIdx, sampleIdx));

    row.append(name, swapButton);
    listEl.append(row);
  });
}

function clearAllSampleSyncState() {
  state.intersectionLayer.clearLayers();
  for (const route of state.routes) {
    for (const sample of route.samples) {
      sample.syncStartIdx = null;
      sample.syncTimeline = null;
    }
  }
}

function swapSample(fromRouteIdx, sampleIdx) {
  clearError();
  stopPlayback();
  const fromRoute = state.routes[fromRouteIdx];
  const toRoute = state.routes[1 - fromRouteIdx];
  const [sample] = fromRoute.samples.splice(sampleIdx, 1);
  if (!sample) return;

  sample.layerGroup?.remove();
  sample.marker?.remove();
  sample.layerGroup = L.layerGroup().addTo(map);
  sample.marker = null;
  sample.syncStartIdx = null;
  sample.syncTimeline = null;
  sample.id = `${toRoute.id}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  toRoute.samples.push(sample);

  redrawAllRoutes();
  updateFileName(0, state.routes[0].samples.map((item) => item.fileName));
  updateFileName(1, state.routes[1].samples.map((item) => item.fileName));

  if (state.startLine && state.routes.every((route) => route.samples.length > 0)) {
    attemptSyncAndPreparePlayback();
  } else {
    clearAllSampleSyncState();
    resetPlaybackState();
    renderAtTime(0);
  }
}

function parseGpx(xmlText) { /* unchanged */
  const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
  const parserError = xml.querySelector('parsererror');
  if (parserError) throw new Error('Invalid XML/GPX.');
  if (xml.documentElement?.localName !== 'gpx') throw new Error('The selected XML file is not a GPX document.');
  const rawPoints = [...xml.getElementsByTagNameNS('*', 'trkpt')];
  if (rawPoints.length < 2) throw new Error('The GPX file must contain at least two track points.');
  const points = rawPoints.map((pt) => ({
    lat: Number(pt.getAttribute('lat')),
    lon: Number(pt.getAttribute('lon')),
    ele: Number(pt.getElementsByTagNameNS('*', 'ele')[0]?.textContent ?? 0),
    time: pt.getElementsByTagNameNS('*', 'time')[0]?.textContent ? Date.parse(pt.getElementsByTagNameNS('*', 'time')[0].textContent) : NaN
  }));
  if (points.some((point) => !Number.isFinite(point.lat) || !Number.isFinite(point.lon) || point.lat < -90 || point.lat > 90 || point.lon < -180 || point.lon > 180)) {
    throw new Error('The GPX file contains invalid latitude or longitude values.');
  }
  return points;
}

function drawRouteSample(route, sample) {
  const latLngs = sample.points.map((p) => [p.lat, p.lon]);
  L.polyline(latLngs, {color: route.color, weight: 3, opacity: 0.3}).addTo(sample.layerGroup);
  drawSpeedSegments(sample);
  sample.marker = L.circleMarker(latLngs[0], {radius: 5, color: '#111827', fillColor: route.color, fillOpacity: 1, weight: 1}).addTo(map);
}

function drawSpeedSegments(sample) {
  if (!state.speedBuckets) return;
  for (let i = 1; i < sample.points.length; i += 1) {
    const p0 = sample.points[i - 1];
    const p1 = sample.points[i];
    const dtSec = Number.isFinite(p1.time) && Number.isFinite(p0.time) ? (p1.time - p0.time) / 1000 : NaN;
    const speed = dtSec > 0 ? haversineM(p0, p1) / dtSec : NaN;
    if (!Number.isFinite(speed)) continue;
    const tierIdx = state.speedBuckets.findIndex((max) => speed <= max);
    const color = speedTierColors[tierIdx === -1 ? speedTierColors.length - 1 : tierIdx];
    L.polyline([[p0.lat, p0.lon], [p1.lat, p1.lon]], {color, weight: 5, opacity: 0.85}).addTo(sample.layerGroup);
  }
}

function toggleDrawMode() {
  state.drawMode = !state.drawMode;
  state.drawPoints = [];
  state.intersectionLayer.clearLayers();
  if (state.drawMode) {
    stopPlayback();
    showRawGpsPoints();
  } else {
    state.rawPointLayer.clearLayers();
    attemptSyncAndPreparePlayback();
  }
  ui.drawLineBtn.textContent = state.drawMode ? 'Click 2 points on map…' : 'Set starting line';
}

function showRawGpsPoints() {
  state.rawPointLayer.clearLayers();
  for (const route of state.routes) {
    for (const sample of route.samples) {
      for (const point of sample.points) {
        L.circleMarker([point.lat, point.lon], {
          radius: 2.5,
          stroke: true,
          color: '#ffffff',
          weight: 1,
          fillColor: route.color,
          fillOpacity: 0.9,
          interactive: false
        }).addTo(state.rawPointLayer);
      }
    }
  }
}

function onMapClick(e) {
  if (!state.drawMode) return;
  state.drawPoints.push(e.latlng);
  if (state.drawPoints.length < 2) return;
  stopPlayback();
  if (state.startLine) state.startLine.remove();
  state.startLine = L.polyline(state.drawPoints.map((p) => [p.lat, p.lng]), {color: '#111827', dashArray: '8,6', weight: 4}).addTo(map);
  state.drawMode = false;
  state.drawPoints = [];
  state.rawPointLayer.clearLayers();
  ui.drawLineBtn.textContent = 'Set starting line';
  attemptSyncAndPreparePlayback();
}

function attemptSyncAndPreparePlayback() {
  state.intersectionLayer.clearLayers();
  if (!state.startLine) return;
  if (state.routes.some((route) => route.samples.length === 0)) return;
  const [l0, l1] = state.startLine.getLatLngs();
  const crossings = [];
  for (const route of state.routes) {
    for (const sample of route.samples) {
      const crossing = findFirstCrossing(sample.points, l0, l1);
      if (!crossing) {
        clearAllSampleSyncState();
        resetPlaybackState();
        return;
      }
      crossings.push({route, sample, crossing});
    }
  }
  for (const {route, sample, crossing} of crossings) {
    sample.syncStartIdx = crossing.segmentEndIndex;
    sample.syncTimeline = buildSyncedTimeline(sample.points, crossing);
    L.circleMarker([crossing.point.lat, crossing.point.lon], {
      radius: 6,
      color: '#ffffff',
      weight: 2,
      fillColor: route.color,
      fillOpacity: 1,
      interactive: false
    }).addTo(state.intersectionLayer);
  }
  state.maxSec = Math.ceil(Math.max(...state.routes.flatMap((route) => route.samples.map((sample) => sample.syncTimeline.at(-1).tSec))));
  state.currentSec = 0;
  ui.timeline.max = String(state.maxSec);
  ui.timeline.value = '0';
  ui.timeline.disabled = false;
  updateSpeedControl(true);
  ui.playPauseBtn.disabled = false;
  renderAtTime(0);
}

function resetPlaybackState() {
  stopPlayback();
  state.currentSec = 0;
  state.maxSec = 0;
  ui.timeline.value = '0'; ui.timeline.max = '0'; ui.timeline.disabled = true;
  ui.timelineTitle.textContent = 'Timeline · 00:00';
  ui.statsRow.innerHTML = '';
  updateSpeedControl(false);
  ui.playPauseBtn.disabled = true;
}

function findFirstCrossing(points, a, b) {
  for (let i = 1; i < points.length; i += 1) {
    const crossing = segmentIntersection(points[i - 1], points[i], a, b);
    if (crossing) return {...crossing, segmentEndIndex: i};
  }
  return null;
}

function buildSyncedTimeline(points, crossing) {
  const {segmentEndIndex, routeRatio, point} = crossing;
  const timeline = [{tSec: 0, point}];
  const segmentStart = points[segmentEndIndex - 1];
  const segmentEnd = points[segmentEndIndex];
  const fullSegmentSec = pointDurationSec(segmentStart, segmentEnd);
  let elapsed = fullSegmentSec * (1 - routeRatio);
  if (elapsed > 0) timeline.push({tSec: elapsed, point: segmentEnd});
  for (let i = segmentEndIndex + 1; i < points.length; i += 1) {
    elapsed += pointDurationSec(points[i - 1], points[i]);
    timeline.push({tSec: elapsed, point: points[i]});
  }
  return timeline;
}

function pointDurationSec(start, end) {
  return Number.isFinite(start.time) && Number.isFinite(end.time) && end.time > start.time
    ? (end.time - start.time) / 1000
    : haversineM(start, end) / 4;
}
function togglePlayback() { if (!state.isPlaying) { state.isPlaying = true; ui.playPauseBtn.textContent = 'Pause'; state.lastFrameTs = null; state.rafId = requestAnimationFrame(tick); } else stopPlayback(); }
function stopPlayback() { state.isPlaying = false; ui.playPauseBtn.textContent = 'Play'; if (state.rafId) cancelAnimationFrame(state.rafId); state.rafId = null; state.lastFrameTs = null; }
function tick(ts) { if (!state.isPlaying) return; if (!state.lastFrameTs) state.lastFrameTs = ts; const dt = (ts - state.lastFrameTs) / 1000; state.lastFrameTs = ts; state.currentSec += dt * getPlaybackSpeed(); if (state.currentSec >= state.maxSec) { state.currentSec = state.maxSec; stopPlayback(); } ui.timeline.value = String(Math.floor(state.currentSec)); renderAtTime(state.currentSec); state.rafId = requestAnimationFrame(tick); }
function changePlaybackSpeed(direction) {
  state.playbackSpeedIndex = Math.max(0, Math.min(playbackSpeeds.length - 1, state.playbackSpeedIndex + direction));
  updateSpeedControl(!ui.playPauseBtn.disabled);
}

function updateSpeedControl(playbackEnabled) {
  const speed = playbackSpeeds[state.playbackSpeedIndex];
  ui.speedValue.value = `${speed}x`;
  ui.speedValue.textContent = `${speed}x`;
  ui.speedDownBtn.disabled = !playbackEnabled || state.playbackSpeedIndex === 0;
  ui.speedUpBtn.disabled = !playbackEnabled || state.playbackSpeedIndex === playbackSpeeds.length - 1;
}

const getPlaybackSpeed = () => playbackSpeeds[state.playbackSpeedIndex];

function renderAtTime(tSec) {
  const routeStats = [];
  for (const route of state.routes) {
    const sampleStats = [];
    for (const sample of route.samples) {
      if (!sample.syncTimeline) continue;
      const pos = interpolatePoint(sample.syncTimeline, tSec);
      sample.marker?.setLatLng([pos.lat, pos.lon]);
      sampleStats.push(computeStatsAtTime(sample.syncTimeline, tSec));
    }
    if (!sampleStats.length) continue;
    const avg = sampleStats.reduce((acc, cur) => ({
      speedMps: acc.speedMps + cur.speedMps,
      avgMps: acc.avgMps + cur.avgMps,
      distanceM: acc.distanceM + cur.distanceM
    }), {speedMps: 0, avgMps: 0, distanceM: 0});
    routeStats.push({route, stats: {speedMps: avg.speedMps / sampleStats.length, avgMps: avg.avgMps / sampleStats.length, distanceM: avg.distanceM / sampleStats.length}, sampleCount: sampleStats.length});
  }
  ui.timelineTitle.textContent = `Timeline · ${formatTime(tSec)}`;
  renderStats(routeStats);
}

function computeStatsAtTime(timeline, tSec) { if (!timeline?.length) return {distanceM: 0, speedMps: 0, avgMps: 0}; const clamped = Math.max(0, Math.min(tSec, timeline.at(-1).tSec)); if (clamped <= 0) return {distanceM: 0, speedMps: 0, avgMps: 0}; let distanceM = 0; let speedMps = 0; for (let i = 1; i < timeline.length; i += 1) { const prev = timeline[i - 1]; const curr = timeline[i]; const segDt = curr.tSec - prev.tSec; if (segDt <= 0) continue; const segDist = haversineM(prev.point, curr.point); if (clamped >= curr.tSec) { distanceM += segDist; speedMps = segDist / segDt; continue; } if (clamped > prev.tSec) { const ratio = (clamped - prev.tSec) / segDt; distanceM += segDist * ratio; speedMps = segDist / segDt; } break; } return {distanceM, speedMps, avgMps: distanceM / clamped}; }
function renderStats(routeStats) { if (!routeStats.length) return (ui.statsRow.innerHTML = ''); ui.statsRow.innerHTML = routeStats.map(({route, stats, sampleCount}) => { const speed = `${(stats.speedMps * 3.6).toFixed(1)} km/h`; const avg = `${(stats.avgMps * 3.6).toFixed(1)} km/h`; const dist = stats.distanceM >= 1000 ? `${(stats.distanceM / 1000).toFixed(2)} km` : `${Math.round(stats.distanceM)} m`; return `<span class="route-stats"><span class="route-dot ${route.id === 0 ? 'route-a' : 'route-b'}"></span>${route.name} (${sampleCount}): Spd: ${speed} Avg: ${avg} Dst: ${dist}</span>`; }).join(''); }
function interpolatePoint(timeline, tSec) { if (tSec <= 0) return timeline[0].point; if (tSec >= timeline.at(-1).tSec) return timeline.at(-1).point; let i = 1; while (i < timeline.length && timeline[i].tSec < tSec) i += 1; const p0 = timeline[i - 1]; const p1 = timeline[i]; const span = p1.tSec - p0.tSec || 1; const ratio = (tSec - p0.tSec) / span; return {lat: p0.point.lat + (p1.point.lat - p0.point.lat) * ratio, lon: p0.point.lon + (p1.point.lon - p0.point.lon) * ratio}; }
const formatTime = (sec) => `${String(Math.floor(Math.max(0, sec) / 60)).padStart(2, '0')}:${String(Math.max(0, Math.floor(sec)) % 60).padStart(2, '0')}`;
function fitRoutes() { const bounds = []; for (const route of state.routes) for (const sample of route.samples) sample.points.forEach((p) => bounds.push([p.lat, p.lon])); if (bounds.length) map.fitBounds(bounds, {padding: [30, 30]}); }
function recalculateSpeedDomain() {
  const speeds = [];
  for (const route of state.routes) for (const sample of route.samples) for (let i = 1; i < sample.points.length; i += 1) {
    const p0 = sample.points[i - 1];
    const p1 = sample.points[i];
    const dtSec = Number.isFinite(p1.time) && Number.isFinite(p0.time) ? (p1.time - p0.time) / 1000 : NaN;
    const speed = dtSec > 0 ? haversineM(p0, p1) / dtSec : NaN;
    if (Number.isFinite(speed)) speeds.push(speed);
  }
  if (!speeds.length) {
    state.speedBuckets = null;
    renderSpeedLegend();
    return;
  }
  speeds.sort((a, b) => a - b);
  const q = (fraction) => speeds[Math.min(speeds.length - 1, Math.max(0, Math.floor((speeds.length - 1) * fraction)))];
  state.speedBuckets = [q(0.2), q(0.4), q(0.6), q(0.8)];
  renderSpeedLegend();
}

function renderSpeedLegend() {
  if (!state.speedBuckets) {
    ui.speedLegend.hidden = true;
    ui.speedLegendItems.innerHTML = '';
    return;
  }
  const thresholds = state.speedBuckets.map((speed) => speed * 3.6);
  const labels = thresholds.map((speed, idx) => idx === 0
    ? `≤ ${speed.toFixed(1)} km/h`
    : `${thresholds[idx - 1].toFixed(1)}–${speed.toFixed(1)} km/h`);
  labels.push(`> ${thresholds.at(-1).toFixed(1)} km/h`);
  ui.speedLegendItems.innerHTML = labels.map((label, idx) => `<span class="speed-legend-item"><span class="speed-swatch" style="background:${speedTierColors[idx]}"></span>${label}</span>`).join('');
  ui.speedLegend.hidden = false;
}

async function loadTripArchive() {
  setArchiveStatus('Loading saved trips…');
  ui.refreshArchiveBtn.disabled = true;
  try {
    const statusResponse = await fetch('/api/archive-status');
    if (!statusResponse.ok) throw new Error('The archive API is unavailable. Run the app with `npm run dev` for local API support.');
    const status = await statusResponse.json();
    state.archiveConfigured = Boolean(status.configured);
    state.commuteConfig = status.commute || null;
    setArchiveFormEnabled(state.archiveConfigured);
    if (!state.archiveConfigured) {
      state.archivedTrips = [];
      renderLeaderboard();
      setArchiveStatus('Trip storage is not configured yet. Add the Supabase environment variables in Vercel.', 'error');
      return;
    }

    const response = await fetch('/api/trips');
    const payload = await readApiResponse(response);
    state.archivedTrips = payload.trips || [];
    renderLeaderboard();
    setArchiveStatus(`${state.archivedTrips.length} saved trip${state.archivedTrips.length === 1 ? '' : 's'}.`);
  } catch (error) {
    state.archiveConfigured = false;
    setArchiveFormEnabled(false);
    setArchiveStatus(error.message, 'error');
  } finally {
    ui.refreshArchiveBtn.disabled = false;
  }
}

async function saveTripToArchive(event) {
  event.preventDefault();
  const file = ui.archiveFile.files?.[0];
  if (!file) return setArchiveStatus('Choose a GPX file first.', 'error');
  if (!state.archiveFileValid) return setArchiveStatus('Choose a valid GPX file before saving.', 'error');
  ui.saveTripBtn.disabled = true;
  setArchiveStatus(`Saving ${file.name}…`);
  try {
    const response = await fetch('/api/trips', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/gpx+xml',
        'X-GPX-Filename': encodeURIComponent(file.name),
        'X-Trip-Direction': encodeURIComponent(ui.tripDirection.value),
        'X-Route-Name': encodeURIComponent(ui.routeName.value),
        'X-Bike-Setup': encodeURIComponent(ui.bikeSetup.value),
        'X-Trip-Notes': encodeURIComponent(ui.tripNotes.value)
      },
      body: file
    });
    await readApiResponse(response);
    ui.archiveForm.reset();
    clearArchiveFilePreview();
    setArchiveStatus(`${file.name} was saved successfully.`, 'success');
    await loadTripArchive();
  } catch (error) {
    setArchiveStatus(error.message, 'error');
  } finally {
    ui.saveTripBtn.disabled = !state.archiveConfigured || !state.archiveFileValid;
  }
}

async function previewArchiveFile() {
  const file = ui.archiveFile.files?.[0];
  state.archiveFileValid = false;
  ui.saveTripBtn.disabled = true;
  if (!file) return clearArchiveFilePreview();

  renderArchiveFilePreview({file, message: 'Reading and validating ride…'});
  try {
    if (file.size === 0) throw new Error('The selected file is empty.');
    if (file.size > 4 * 1024 * 1024) throw new Error('The GPX file exceeds the 4 MB upload limit.');
    if (!file.name.toLowerCase().endsWith('.gpx')) throw new Error('Choose a file with the .gpx extension.');
    const points = parseGpx(await file.text());
    const metrics = calculateGpxPreviewMetrics(points);
    const directionSuggestion = suggestDirectionFromEndpoints(points);
    if (directionSuggestion.value) ui.tripDirection.value = directionSuggestion.value;
    state.archiveFileValid = true;
    renderArchiveFilePreview({
      file,
      date: formatTripDate(metrics.recordedAt),
      duration: formatDuration(metrics.elapsedTimeS),
      distance: formatDistance(metrics.distanceM),
      points: points.length.toLocaleString(),
      direction: directionSuggestion.label,
      message: directionSuggestion.message
    });
  } catch (error) {
    renderArchiveFilePreview({file, message: error.message, error: true});
  } finally {
    ui.saveTripBtn.disabled = !state.archiveConfigured || !state.archiveFileValid;
  }
}

function suggestDirectionFromEndpoints(points) {
  if (!state.commuteConfig) {
    return {
      value: null,
      label: 'Manual selection',
      message: 'GPX validated. Configure home and work endpoints to enable automatic direction suggestions.'
    };
  }

  const {home, work, endpointRadiusM} = state.commuteConfig;
  const start = points[0];
  const finish = points.at(-1);
  const distances = {
    startHome: haversineM(start, home),
    startWork: haversineM(start, work),
    finishHome: haversineM(finish, home),
    finishWork: haversineM(finish, work)
  };

  if (distances.startHome <= endpointRadiusM && distances.finishWork <= endpointRadiusM) {
    return directionResult('home_to_work', 'Home → Work', distances.startHome, distances.finishWork, 'home', 'work');
  }
  if (distances.startWork <= endpointRadiusM && distances.finishHome <= endpointRadiusM) {
    return directionResult('work_to_home', 'Work → Home', distances.startWork, distances.finishHome, 'work', 'home');
  }
  return {
    value: null,
    label: 'Manual selection',
    message: `GPX validated. The start and finish do not both fall within ${formatDistance(endpointRadiusM)} of the configured endpoints, so direction was not changed.`
  };
}

function directionResult(value, label, startDistanceM, finishDistanceM, startName, finishName) {
  return {
    value,
    label: `${label} (suggested)`,
    message: `GPX validated. Suggested ${label}: start is ${formatDistance(startDistanceM)} from ${startName} and finish is ${formatDistance(finishDistanceM)} from ${finishName}.`
  };
}

function calculateGpxPreviewMetrics(points) {
  if (points.some((point) => !Number.isFinite(point.time))) {
    throw new Error('Every track point must have a valid timestamp.');
  }
  let distanceM = 0;
  for (let index = 1; index < points.length; index += 1) {
    if (points[index].time <= points[index - 1].time) {
      throw new Error('Track-point timestamps must increase throughout the ride.');
    }
    distanceM += haversineM(points[index - 1], points[index]);
  }
  const elapsedTimeS = (points.at(-1).time - points[0].time) / 1000;
  if (elapsedTimeS <= 0) throw new Error('The timestamps do not describe a positive ride duration.');
  return {recordedAt: new Date(points[0].time).toISOString(), elapsedTimeS, distanceM};
}

function renderArchiveFilePreview({file, date = '—', duration = '—', distance = '—', points = '—', direction = '—', message = '', error = false}) {
  ui.archiveFileSummary.hidden = false;
  ui.archiveFileSummary.classList.toggle('is-error', error);
  ui.archiveSummaryName.textContent = file.name;
  ui.archiveSummarySize.textContent = formatFileSize(file.size);
  ui.archiveSummaryDate.textContent = date;
  ui.archiveSummaryDuration.textContent = duration;
  ui.archiveSummaryDistance.textContent = distance;
  ui.archiveSummaryPoints.textContent = points;
  ui.archiveSummaryDirection.textContent = direction;
  ui.archiveSummaryMessage.textContent = message;
}

function clearArchiveFilePreview() {
  state.archiveFileValid = false;
  ui.archiveFileSummary.hidden = true;
  ui.archiveFileSummary.classList.remove('is-error');
  ui.saveTripBtn.disabled = !state.archiveConfigured;
}

function formatFileSize(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function renderLeaderboard() {
  if (!state.archivedTrips.length) {
    ui.leaderboardBody.innerHTML = '<tr><td colspan="9" class="empty-table">No saved trips yet.</td></tr>';
    return;
  }
  ui.leaderboardBody.innerHTML = state.archivedTrips.map((trip) => `
    <tr>
      <td title="${escapeHtml(trip.original_filename)}">${formatTripDate(trip.recorded_at)}</td>
      <td>${formatDirection(trip.direction)}</td>
      <td>${formatDistance(trip.distance_m)}</td>
      <td>${formatDuration(trip.elapsed_time_s)}</td>
      <td>${formatDuration(trip.moving_time_s)}</td>
      <td>${formatDuration(trip.stopped_time_s)}</td>
      <td>${(Number(trip.average_speed_mps) * 3.6).toFixed(1)} km/h</td>
      <td>${escapeHtml(trip.bike_setup || '—')}</td>
      <td><span class="compare-actions">
        <button type="button" class="compare-button" data-trip-id="${trip.id}" data-route="0">Route A</button>
        <button type="button" class="compare-button" data-trip-id="${trip.id}" data-route="1">Route B</button>
      </span></td>
    </tr>`).join('');
}

async function onLeaderboardClick(event) {
  const button = event.target.closest('[data-trip-id]');
  if (!button) return;
  const trip = state.archivedTrips.find((item) => item.id === button.dataset.tripId);
  if (!trip) return;
  button.disabled = true;
  setArchiveStatus(`Loading ${trip.original_filename} into Route ${button.dataset.route === '0' ? 'A' : 'B'}…`);
  try {
    const response = await fetch(`/api/trip-file?id=${encodeURIComponent(trip.id)}`);
    if (!response.ok) await readApiResponse(response);
    const blob = await response.blob();
    const file = new File([blob], trip.original_filename, {type: 'application/gpx+xml'});
    await handleFileLoad(Number(button.dataset.route), [file]);
    setArchiveStatus(`${trip.original_filename} loaded into Route ${button.dataset.route === '0' ? 'A' : 'B'}.`, 'success');
  } catch (error) {
    setArchiveStatus(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

function setArchiveFormEnabled(enabled) {
  for (const element of ui.archiveForm.elements) element.disabled = !enabled;
  ui.saveTripBtn.disabled = !enabled || !state.archiveFileValid;
}

function setArchiveStatus(message, type = '') {
  ui.archiveStatus.textContent = message;
  ui.archiveStatus.className = `archive-status${type ? ` is-${type}` : ''}`;
}

async function readApiResponse(response) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) throw new Error(payload.error || `Archive request failed (${response.status}).`);
  return payload;
}

function formatTripDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, {dateStyle: 'medium', timeStyle: 'short'}).format(date);
}

function formatDirection(value) {
  if (value === 'work_to_home') return 'Work → Home';
  if (value === 'home_to_work') return 'Home → Work';
  return 'Other';
}

function formatDistance(value) {
  const meters = Number(value);
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
}

function formatDuration(value) {
  const seconds = Math.max(0, Math.round(Number(value) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[character]));
}
function redrawAllRoutes() { for (const route of state.routes) for (const sample of route.samples) { sample.layerGroup?.remove(); sample.marker?.remove(); sample.layerGroup = L.layerGroup().addTo(map); sample.marker = null; drawRouteSample(route, sample); } }
function segmentIntersection(routeStart, routeEnd, lineStart, lineEnd) {
  const p = {x: routeStart.lon, y: routeStart.lat};
  const r = {x: routeEnd.lon - routeStart.lon, y: routeEnd.lat - routeStart.lat};
  const q = {x: lineStart.lng, y: lineStart.lat};
  const s = {x: lineEnd.lng - lineStart.lng, y: lineEnd.lat - lineStart.lat};
  const denominator = cross2d(r, s);
  if (Math.abs(denominator) < 1e-15) return null;
  const qMinusP = {x: q.x - p.x, y: q.y - p.y};
  const routeRatio = cross2d(qMinusP, s) / denominator;
  const lineRatio = cross2d(qMinusP, r) / denominator;
  const epsilon = 1e-9;
  if (routeRatio < -epsilon || routeRatio > 1 + epsilon || lineRatio < -epsilon || lineRatio > 1 + epsilon) return null;
  const ratio = Math.max(0, Math.min(1, routeRatio));
  return {
    routeRatio: ratio,
    point: {
      lat: routeStart.lat + (routeEnd.lat - routeStart.lat) * ratio,
      lon: routeStart.lon + (routeEnd.lon - routeStart.lon) * ratio,
      ele: routeStart.ele + (routeEnd.ele - routeStart.ele) * ratio,
      time: Number.isFinite(routeStart.time) && Number.isFinite(routeEnd.time)
        ? routeStart.time + (routeEnd.time - routeStart.time) * ratio
        : NaN
    }
  };
}
function cross2d(a, b) { return a.x * b.y - a.y * b.x; }
function haversineM(a, b) { const R = 6371000; const toRad = (deg) => (deg * Math.PI) / 180; const dLat = toRad(b.lat - a.lat); const dLon = toRad(b.lon - a.lon); const lat1 = toRad(a.lat); const lat2 = toRad(b.lat); const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
