import { getRegion } from './regions.js';
import { hourScore, gradeOf, SKY_NAMES, PTY_NAMES } from './score.js';
import {
  loadAll, regionDays, currentRegion, regionSelect,
  renderLayout, renderMeta, showError, hourLabel, gradeColor,
} from './app.js';

renderLayout('detail.html');

const params = new URLSearchParams(location.search);
const state = { region: currentRegion().id, dayIdx: Number(params.get('day')) || 0 };
let data, scoreChart, weatherChart;

Chart.defaults.font.family = "'Pretendard', sans-serif";
Chart.defaults.color = '#5d6875';


function setupControls() {
  const box = document.getElementById('controls');
  box.append(regionSelect(state.region, (id) => { state.region = id; render(); }));
  const seg = document.createElement('div');
  seg.className = 'seg';
  const days = regionDays(data, state.region);
  if (state.dayIdx >= days.length) state.dayIdx = 0;
  seg.innerHTML = days.map((d, i) => `<button data-i="${i}" class="${i === state.dayIdx ? 'on' : ''}">${d.label.rel}<small>${d.label.short}</small></button>`).join('');
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    state.dayIdx = Number(b.dataset.i);
    seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    const url = new URL(location.href);
    url.searchParams.set('day', state.dayIdx);
    history.replaceState(null, '', url);
    render();
  });
  box.append(seg);
}

const skyIcon = (h) => (h.PTY > 0 ? ({ 1: '🌧', 2: '🌨', 3: '❄️', 4: '🌦' }[h.PTY] || '🌧') : ({ 1: '☀️', 3: '⛅', 4: '☁️' }[h.SKY] || '·'));

function render() {
  const region = getRegion(state.region);
  const day = regionDays(data, state.region)[state.dayIdx];
  document.getElementById('title').textContent = `${region.full} 시간대별 상세`;
  if (!day) return;

  const hours = day.hours.map((h) => ({ ...h, s: hourScore(h, day.dust) }));
  const g = gradeOf(day.score.total);
  const temps = hours.map((h) => h.TMP);
  const rainHours = hours.filter((h) => h.PTY > 0).length;

  // 요약 카드
  document.getElementById('summary').innerHTML = `
    <div class="stat g-${g.key}"><span>하루 점수</span><b style="color:var(--g)">${g.emoji} ${day.score.total}점</b></div>
    <div class="stat"><span>추천 시간대</span><b>${day.best ? `${hourLabel(day.best.start)}~${Number(day.best.end.slice(0, 2)) + 1}시` : '-'}</b></div>
    <div class="stat"><span>최저 / 최고</span><b>${Math.min(...temps)}° / ${Math.max(...temps)}°</b></div>
    <div class="stat"><span>비 오는 시간</span><b>${rainHours ? rainHours + '시간' : '없음'}</b></div>
    <div class="stat"><span>미세먼지${state.dayIdx ? ' 예보' : ''}</span><b>${day.dustName}</b></div>`;

  const labels = hours.map((h) => hourLabel(h.time));

  // 차트 1: 시간대별 점수 (등급 색상)
  scoreChart?.destroy();
  scoreChart = new Chart(document.getElementById('score-chart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '나들이 점수',
        data: hours.map((h) => h.s.total),
        backgroundColor: hours.map((h) => gradeColor(gradeOf(h.s.total).key)),
        borderRadius: 6,
      }],
    },
    options: {
      maintainAspectRatio: false,
      scales: { y: { min: 0, max: 100, grid: { color: '#eee9df' } }, x: { grid: { display: false } } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            afterLabel: (ctx) => {
              const p = hours[ctx.dataIndex].s.parts;
              return `기온 ${Math.round(p.temp)} · 강수 ${Math.round(p.rain)} · 먼지 ${p.dust} · 하늘 ${p.sky} · 바람 ${Math.round(p.wind)}`;
            },
          },
        },
      },
    },
  });

  // 차트 2: 기온(선) + 강수확률(막대) 이중 축
  weatherChart?.destroy();
  weatherChart = new Chart(document.getElementById('weather-chart'), {
    data: {
      labels,
      datasets: [
        { type: 'line', label: '기온(℃)', data: temps, borderColor: '#e0574f', backgroundColor: '#e0574f', tension: 0.35, yAxisID: 'y', pointRadius: 3 },
        { type: 'bar', label: '강수확률(%)', data: hours.map((h) => h.POP), backgroundColor: 'rgba(61,139,217,.35)', borderRadius: 4, yAxisID: 'y1' },
      ],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: { position: 'left', title: { display: true, text: '℃' }, grid: { color: '#eee9df' } },
        y1: { position: 'right', min: 0, max: 100, title: { display: true, text: '%' }, grid: { display: false } },
        x: { grid: { display: false } },
      },
    },
  });

  // 시간별 표
  const inBest = (t) => day.best && t >= day.best.start && t <= day.best.end;
  document.getElementById('table').innerHTML = `
    <table class="hour-table">
      <thead><tr><th>시간</th><th>하늘</th><th>기온</th><th>강수확률</th><th>강수형태</th><th>풍속</th><th>습도</th><th>점수</th></tr></thead>
      <tbody>${hours.map((h) => {
        const hg = gradeOf(h.s.total);
        return `<tr class="${inBest(h.time) ? 'best' : ''}">
          <td><b>${hourLabel(h.time)}</b></td>
          <td>${skyIcon(h)} ${SKY_NAMES[h.SKY] ?? ''}</td>
          <td>${h.TMP}℃</td>
          <td>${h.POP}%</td>
          <td>${PTY_NAMES[h.PTY] ?? '-'}</td>
          <td>${h.WSD}m/s</td>
          <td>${h.REH ?? '-'}%</td>
          <td><span class="pill g-${hg.key}">${h.s.total}</span></td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
}

// ---------- 시작 ----------
try {
  data = await loadAll();
  renderMeta(data.meta);
  setupControls();
  render();
} catch (e) {
  showError(document.querySelector('main .grid'), e);
}
