import { hourScore, gradeOf, pm10Grade, GRADE_NAMES, SKY_NAMES } from './score.js';
import { loadAll, renderLayout, renderMeta } from './app.js';

renderLayout('about.html');

// ---------- 점수 시뮬레이터 ----------
const inputs = [
  { id: 'TMP', label: '기온', min: -10, max: 35, step: 1, value: 21, fmt: (v) => `${v}℃` },
  { id: 'POP', label: '강수확률', min: 0, max: 100, step: 10, value: 20, fmt: (v) => `${v}%` },
  { id: 'PM10', label: '미세먼지(PM10)', min: 0, max: 200, step: 5, value: 40, fmt: (v) => `${v}㎍ ${GRADE_NAMES[pm10Grade(v)]}` },
  { id: 'SKY', label: '하늘', min: 1, max: 3, step: 1, value: 1, fmt: (v) => SKY_NAMES[[1, 3, 4][v - 1]] },
  { id: 'WSD', label: '풍속', min: 0, max: 14, step: 0.5, value: 3, fmt: (v) => `${v}m/s` },
];

const box = document.getElementById('sim-inputs');
box.innerHTML = inputs.map((x) => `
  <div class="sim-row">
    <label for="sim-${x.id}">${x.label}</label>
    <input type="range" id="sim-${x.id}" min="${x.min}" max="${x.max}" step="${x.step}" value="${x.value}">
    <output id="out-${x.id}"></output>
  </div>`).join('');

function simulate() {
  const v = Object.fromEntries(inputs.map((x) => [x.id, Number(document.getElementById(`sim-${x.id}`).value)]));
  inputs.forEach((x) => { document.getElementById(`out-${x.id}`).textContent = x.fmt(v[x.id]); });
  const h = { TMP: v.TMP, POP: v.POP, PTY: 0, SKY: [1, 3, 4][v.SKY - 1], WSD: v.WSD };
  const s = hourScore(h, pm10Grade(v.PM10));
  const g = gradeOf(s.total);
  const el = document.getElementById('sim-result');
  el.className = `sim-result g-${g.key}`;
  el.innerHTML = `<div style="font-size:34px">${g.emoji}</div><div class="num">${s.total}</div><div class="lbl">${g.label}</div>
    <small class="muted">기온 ${Math.round(s.parts.temp)} · 강수 ${s.parts.rain} · 먼지 ${s.parts.dust}<br>하늘 ${s.parts.sky} · 바람 ${Math.round(s.parts.wind)}</small>`;
}
box.addEventListener('input', simulate);
simulate();

// ---------- 데이터 상태 ----------
try {
  const { meta, weather } = await loadAll();
  renderMeta(meta);
  const fmt = (iso) => (iso ? new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '-');
  document.getElementById('status').innerHTML = `
    <p style="margin:0 0 6px">${meta.sample ? '⚠️ 현재 <b>샘플 데이터</b>로 표시 중입니다. GitHub Actions가 실행되면 실제 데이터로 바뀝니다.' : '✅ 공공데이터포털 실데이터로 표시 중입니다.'}</p>
    <p style="margin:0">마지막 수집 ${fmt(meta.updatedAt)} · 단기예보 발표 ${meta.weatherBase ?? '-'} · 대기 측정 ${meta.airTime ?? '-'} · 관광정보 갱신 ${fmt(meta.tourUpdatedAt)}
    · 지역 ${Object.keys(weather.regions).length}곳</p>
    ${meta.errors?.length ? `<p style="color:#c0392b">최근 수집 오류: ${meta.errors.join(' / ')}</p>` : ''}`;
} catch (e) {
  document.getElementById('status').textContent = '데이터 상태를 불러오지 못했어요: ' + e.message;
}
