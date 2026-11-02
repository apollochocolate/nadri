import { REGIONS } from './regions.js';
import { gradeOf, WEIGHTS, SKY_NAMES, GRADE_NAMES } from './score.js';
import {
  loadAll, regionDays, currentRegion, saveRegion, regionSelect,
  renderLayout, renderMeta, showError, hourLabel,
} from './app.js';

renderLayout('index.html');

const state = { region: currentRegion().id, dayIdx: 0 };
const PART_NAMES = { temp: '기온', rain: '강수', dust: '미세먼지', sky: '하늘', wind: '바람' };

let data;
try {
  data = await loadAll();
  renderMeta(data.meta);
  setupControls();
  render();
} catch (e) {
  showError(document.getElementById('score-area'), e);
}

function setupControls() {
  const box = document.getElementById('controls');
  box.append(regionSelect(state.region, (id) => { state.region = id; render(); }));

  const seg = document.createElement('div');
  seg.className = 'seg';
  const days = regionDays(data, state.region).slice(0, 2);
  seg.innerHTML = days.map((d, i) => `<button data-i="${i}" class="${i === 0 ? 'on' : ''}">${d.label.rel}<small>${d.label.short}</small></button>`).join('');
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    state.dayIdx = Number(b.dataset.i);
    seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    render();
  });
  box.append(seg);
}

function render() {
  renderScore();
  renderRanking();
}

function renderScore() {
  const area = document.getElementById('score-area');
  const day = regionDays(data, state.region)[state.dayIdx];
  if (!day || !day.score) { area.innerHTML = '<div class="empty">예보 데이터가 없어요.</div>'; return; }

  const region = REGIONS.find((r) => r.id === state.region);
  const g = gradeOf(day.score.total);
  const temps = day.hours.map((h) => h.TMP);
  const maxPop = Math.max(...day.hours.map((h) => h.POP));
  const air = data.air.current[state.region] || {};
  // 가장 많이 나타나는 하늘상태
  const skyCount = {};
  day.hours.forEach((h) => { skyCount[h.SKY] = (skyCount[h.SKY] || 0) + 1; });
  const sky = Object.entries(skyCount).sort((a, b) => b[1] - a[1])[0]?.[0];

  const C = 2 * Math.PI * 100; // 게이지 둘레
  area.className = `card score-card g-${g.key}`;
  area.innerHTML = `
    <div class="gauge">
      <svg viewBox="0 0 240 240">
        <circle class="track" cx="120" cy="120" r="100" fill="none" stroke-width="18"/>
        <circle class="bar" cx="120" cy="120" r="100" fill="none" stroke-width="18"
          stroke-dasharray="${C}" stroke-dashoffset="${C}"/>
      </svg>
      <div class="gauge-center">
        <div class="gauge-emoji">${g.emoji}</div>
        <div class="gauge-num">${day.score.total}</div>
        <div class="gauge-label">${g.label}</div>
      </div>
    </div>
    <div>
      <p class="score-msg">${region.full} ${day.label.rel}, ${g.msg}</p>
      <p class="score-sub">${day.label.short} · 활동 시간대(9~18시) 평균 기준</p>
      ${day.best ? `<div class="best-time">⏰ 추천 시간대 ${hourLabel(day.best.start)}~${Number(day.best.end.slice(0, 2)) + 1}시 <span class="muted">(${day.best.score}점)</span></div>` : ''}
      <div class="stats">
        <div class="stat"><span>기온</span><b>${Math.min(...temps)}° / ${Math.max(...temps)}°</b></div>
        <div class="stat"><span>최고 강수확률</span><b>${maxPop}%</b></div>
        <div class="stat"><span>하늘</span><b>${SKY_NAMES[sky] ?? '-'}</b></div>
        <div class="stat"><span>미세먼지${state.dayIdx ? ' 예보' : ''}</span><b>${day.dustName}</b></div>
      </div>
      <div class="parts">
        ${Object.entries(day.score.parts).map(([k, v]) => `
          <div class="part">
            <span class="part-name">${PART_NAMES[k]} <small>${Math.round(WEIGHTS[k] * 100)}%</small></span>
            <span class="part-bar"><i style="width:0%" data-w="${v}"></i></span>
            <span class="part-val">${v}</span>
          </div>`).join('')}
      </div>
      ${state.dayIdx === 0 && air.pm10 != null ? `<p class="muted" style="font-size:13px;margin:-6px 0 16px">실시간 PM10 ${air.pm10}㎍/㎥ (${GRADE_NAMES[gradeKey10(air.pm10)]}) · PM2.5 ${air.pm25}㎍/㎥ · 측정소 ${air.stations}곳 평균</p>` : ''}
      <div class="actions">
        <a class="btn primary" href="detail.html?region=${state.region}&day=${state.dayIdx}">시간대별 자세히 보기 →</a>
        <a class="btn" href="spots.html?region=${state.region}">${region.name} 추천 장소</a>
      </div>
    </div>`;

  // 애니메이션: 다음 프레임에서 값 적용
  requestAnimationFrame(() => requestAnimationFrame(() => {
    area.querySelector('.bar').style.strokeDashoffset = C * (1 - day.score.total / 100);
    area.querySelectorAll('.part-bar i').forEach((i) => { i.style.width = i.dataset.w + '%'; });
  }));
}

function gradeKey10(v) { return v <= 30 ? 1 : v <= 80 ? 2 : v <= 150 ? 3 : 4; }

function renderRanking() {
  const list = REGIONS.map((r) => {
    const d = regionDays(data, r.id)[state.dayIdx];
    return { r, score: d?.score?.total ?? 0 };
  }).sort((a, b) => b.score - a.score);

  const first = regionDays(data, state.region)[state.dayIdx];
  document.getElementById('rank-hint').textContent = first ? `${first.label.rel} ${first.label.short} 기준 · 지역을 누르면 바뀌어요` : '';

  // 2열 레이아웃에서 위→아래 순서로 읽히도록 재배치
  const half = Math.ceil(list.length / 2);
  const ordered = window.matchMedia('(max-width: 860px)').matches
    ? list
    : Array.from({ length: list.length }, (_, i) => list[(i % 2) * half + Math.floor(i / 2)]).filter(Boolean);

  const box = document.getElementById('rank-list');
  box.innerHTML = ordered.map((x) => {
    const g = gradeOf(x.score);
    const rank = list.indexOf(x) + 1;
    return `<button class="rank-item g-${g.key} ${x.r.id === state.region ? 'me' : ''}" data-id="${x.r.id}">
      <span class="rank-no">${rank}</span>
      <span class="rank-name">${x.r.name}</span>
      <span class="rank-bar"><i style="width:${x.score}%"></i></span>
      <span class="rank-score">${g.emoji} ${x.score}</span>
    </button>`;
  }).join('');
  box.onclick = (e) => {
    const b = e.target.closest('.rank-item');
    if (!b) return;
    state.region = b.dataset.id;
    saveRegion(state.region);
    document.querySelector('.region-select').value = state.region;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
}
