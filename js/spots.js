import { getRegion } from './regions.js';
import { gradeOf } from './score.js';
import {
  loadAll, loadXML, regionDays, currentRegion, regionSelect,
  renderLayout, renderMeta, showError,
} from './app.js';

renderLayout('spots.html');

// 관광공사 콘텐츠 타입
const TYPES = {
  12: { name: '관광지', icon: '🏞', indoor: false },
  14: { name: '문화시설', icon: '🏛', indoor: true },
  15: { name: '축제·행사', icon: '🎉', indoor: false },
  25: { name: '여행코스', icon: '🗺', indoor: false },
  28: { name: '레포츠', icon: '🚴', indoor: false },
  32: { name: '숙박', icon: '🏨', indoor: true },
  38: { name: '쇼핑', icon: '🛍', indoor: true },
  39: { name: '음식점', icon: '🍽', indoor: true },
};

const state = { region: currentRegion().id, type: 'all', q: '', myPos: null, selected: null };
let data, spots = [], mode, map, layer;
const markers = new Map();

// ---------- XML → 객체 변환 ----------
function parseSpots(doc) {
  const code = doc.querySelector('header > resultCode')?.textContent;
  if (code && code !== '0000' && code !== '00') {
    throw new Error(doc.querySelector('header > resultMsg')?.textContent || 'API 오류');
  }
  const get = (el, tag) => el.getElementsByTagName(tag)[0]?.textContent?.trim() ?? '';
  return [...doc.getElementsByTagName('item')].map((el) => ({
    id: get(el, 'contentid'),
    title: get(el, 'title'),
    type: Number(get(el, 'contenttypeid')),
    addr: [get(el, 'addr1'), get(el, 'addr2')].filter(Boolean).join(' '),
    tel: get(el, 'tel'),
    image: (get(el, 'firstimage2') || get(el, 'firstimage')).replace(/^http:/, 'https:'),
    lat: parseFloat(get(el, 'mapy')),
    lon: parseFloat(get(el, 'mapx')),
  })).filter((s) => s.title && !isNaN(s.lat) && !isNaN(s.lon) && s.lat > 0);
}

// API 문자열을 HTML에 넣기 전 이스케이프
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 두 좌표 사이 거리(km) - 하버사인 공식
function distanceKm(a, b) {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// ---------- 날씨 맞춤 모드 ----------
function weatherMode() {
  const today = regionDays(data, state.region)[0];
  if (!today) return { indoor: false, g: gradeOf(70), text: '' };
  const g = gradeOf(today.score.total);
  const reasons = [];
  if (today.score.parts.rain < 55) reasons.push('비 소식');
  if (today.dust >= 3) reasons.push('미세먼지 나쁨');
  if (today.score.parts.temp < 40) reasons.push('기온이 나들이에 불편');
  if (today.score.parts.wind < 60) reasons.push('강한 바람');
  const indoor = reasons.length > 0 || today.score.total < 50;
  return { indoor, g, score: today.score.total, reasons };
}

function renderMode() {
  mode = weatherMode();
  const el = document.getElementById('mode');
  el.innerHTML = `<div class="mode-banner g-${mode.g.key}">
    <span class="big">${mode.indoor ? '🏛' : '🌳'}</span>
    <div>
      <b>오늘은 ${mode.indoor ? '실내' : '야외'} 장소 위주로 추천해요</b>
      <div class="muted">나들이 지수 ${mode.score ?? '-'}점 ${mode.g.emoji}${mode.reasons?.length ? ` · ${mode.reasons.join(', ')}` : ' · 밖에 나가기 좋은 날씨예요'}</div>
    </div>
    <a class="btn" style="margin-left:auto" href="detail.html?region=${state.region}">시간대 보기</a>
  </div>`;
}

// ---------- 목록 정렬/필터 ----------
function visibleSpots() {
  const region = getRegion(state.region);
  const origin = state.myPos || { lat: region.lat, lon: region.lon };
  const q = state.q.trim().toLowerCase();
  return spots
    .map((s) => ({ ...s, dist: distanceKm(origin, s), fit: (TYPES[s.type]?.indoor ?? false) === mode.indoor }))
    .filter((s) => state.type === 'all' || s.type === Number(state.type))
    .filter((s) => !q || s.title.toLowerCase().includes(q) || s.addr.toLowerCase().includes(q))
    .sort((a, b) => {
      if (state.myPos) return a.dist - b.dist;               // 내 위치 모드: 거리순
      if (a.fit !== b.fit) return a.fit ? -1 : 1;            // 날씨에 맞는 유형 우선
      if (!!a.image !== !!b.image) return a.image ? -1 : 1;  // 사진 있는 곳 우선
      return a.dist - b.dist;
    })
    .slice(0, 60);
}

function renderChips() {
  const counts = {};
  spots.forEach((s) => { counts[s.type] = (counts[s.type] || 0) + 1; });
  const types = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  const el = document.getElementById('chips');
  el.innerHTML = [`<button class="chip ${state.type === 'all' ? 'on' : ''}" data-t="all">전체 ${spots.length}</button>`]
    .concat(types.map((t) => `<button class="chip ${state.type === t ? 'on' : ''}" data-t="${t}">${TYPES[t]?.icon ?? '📍'} ${TYPES[t]?.name ?? '기타'} ${counts[t]}</button>`))
    .join('');
  el.onclick = (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    state.type = b.dataset.t;
    renderChips();
    renderList();
  };
}

function renderList() {
  const list = visibleSpots();
  const box = document.getElementById('list');
  if (!list.length) {
    box.innerHTML = '<div class="empty">조건에 맞는 장소가 없어요.</div>';
  } else {
    box.innerHTML = list.map((s) => {
      const t = TYPES[s.type] || { name: '기타', icon: '📍' };
      const img = s.image
        ? `<img class="spot-img" src="${esc(s.image)}" alt="" loading="lazy" data-icon="${t.icon}">`
        : `<div class="spot-img">${t.icon}</div>`;
      return `<article class="spot ${state.selected === s.id ? 'on' : ''}" data-id="${s.id}">
        ${img}
        <div class="spot-body">
          <p class="spot-title">${esc(s.title)}</p>
          <p class="spot-addr">${esc(s.addr) || '주소 정보 없음'}</p>
          <div class="tags">
            <span class="tag">${t.name}</span>
            <span class="tag ${t.indoor ? 'indoor' : 'outdoor'}">${t.indoor ? '실내' : '야외'}</span>
            ${s.fit ? '<span class="tag fit">오늘 추천</span>' : ''}
            <span class="tag">${s.dist < 1 ? Math.round(s.dist * 1000) + 'm' : s.dist.toFixed(1) + 'km'}</span>
          </div>
        </div>
      </article>`;
    }).join('');
  }
  // 이미지 로딩 실패 시 아이콘으로 대체
  box.querySelectorAll('img.spot-img').forEach((img) => {
    img.addEventListener('error', () => {
      const d = document.createElement('div');
      d.className = 'spot-img';
      d.textContent = img.dataset.icon;
      img.replaceWith(d);
    }, { once: true });
  });
  box.onclick = (e) => {
    const card = e.target.closest('.spot');
    if (card) focusSpot(card.dataset.id, true);
  };
  renderMarkers(list);
}

// ---------- 지도 ----------
function initMap() {
  map = L.map('map', { scrollWheelZoom: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18, attribution: '&copy; OpenStreetMap',
  }).addTo(map);
  layer = L.layerGroup().addTo(map);
}

function renderMarkers(list) {
  layer.clearLayers();
  markers.clear();
  list.forEach((s) => {
    const t = TYPES[s.type] || {};
    const m = L.circleMarker([s.lat, s.lon], {
      radius: s.fit ? 9 : 7, weight: 2, color: '#fff',
      fillColor: t.indoor ? '#3d8bd9' : '#1f9d6b', fillOpacity: s.fit ? 0.95 : 0.6,
    }).bindPopup(`<b>${esc(s.title)}</b><br><small>${t.name ?? ''} · ${esc(s.addr)}</small><br>
      <a href="https://map.kakao.com/link/map/${encodeURIComponent(s.title)},${s.lat},${s.lon}" target="_blank" rel="noopener">카카오맵에서 보기 ↗</a>`);
    m.on('click', () => focusSpot(s.id, false));
    m.addTo(layer);
    markers.set(s.id, m);
  });
  if (state.myPos) {
    L.circleMarker([state.myPos.lat, state.myPos.lon], { radius: 8, color: '#fff', weight: 3, fillColor: '#e0574f', fillOpacity: 1 })
      .bindTooltip('내 위치').addTo(layer);
  }
  const pts = list.map((s) => [s.lat, s.lon]);
  if (state.myPos) pts.push([state.myPos.lat, state.myPos.lon]);
  if (pts.length) map.fitBounds(pts, { padding: [30, 30], maxZoom: 13 });
  else { const r = getRegion(state.region); map.setView([r.lat, r.lon], 10); }
}

function focusSpot(id, fromList) {
  state.selected = id;
  document.querySelectorAll('.spot').forEach((el) => el.classList.toggle('on', el.dataset.id === id));
  const m = markers.get(id);
  if (m) {
    map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 13), { duration: 0.6 });
    m.openPopup();
  }
  if (!fromList) document.querySelector(`.spot[data-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ---------- 지역 로딩 ----------
async function loadRegion() {
  const region = getRegion(state.region);
  document.getElementById('title').textContent = `${region.full} 추천 장소`;
  document.getElementById('list').innerHTML = '<div class="loading">관광정보(XML)를 불러오는 중…</div>';
  state.type = 'all';
  state.selected = null;
  renderMode();
  try {
    const doc = await loadXML(`data/spots/${state.region}.xml`);
    spots = parseSpots(doc);
  } catch (e) {
    spots = [];
    showError(document.getElementById('list'), e);
    return;
  }
  renderChips();
  renderList();
}

// ---------- 시작 ----------
try {
  data = await loadAll();
  renderMeta(data.meta);
  initMap();
  document.getElementById('controls').append(regionSelect(state.region, (id) => {
    state.region = id;
    state.myPos = null;
    loadRegion();
  }));

  let timer;
  document.getElementById('search').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.q = e.target.value; renderList(); }, 200); // 디바운스
  });

  const nearBtn = document.getElementById('near-btn');
  nearBtn.addEventListener('click', () => {
    if (state.myPos) { state.myPos = null; nearBtn.textContent = '📍 내 위치에서 가까운 순'; renderList(); return; }
    if (!navigator.geolocation) return alert('이 브라우저는 위치 기능을 지원하지 않아요.');
    nearBtn.textContent = '📍 위치 확인 중…';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.myPos = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        nearBtn.textContent = '✕ 거리순 해제';
        renderList();
      },
      () => { nearBtn.textContent = '📍 내 위치에서 가까운 순'; alert('위치 권한이 필요해요.'); },
      { timeout: 8000 },
    );
  });

  await loadRegion();
} catch (e) {
  showError(document.getElementById('list'), e);
}
