// 모든 페이지가 함께 쓰는 공통 모듈: 데이터 로딩, 지역 선택 상태, 레이아웃
import { REGIONS, getRegion } from './regions.js';
import { dayScore, bestWindow, GRADE_NAMES } from './score.js';

// ---------- 데이터 로딩 ----------
// 1시간 단위 캐시 무효화 파라미터 (GitHub Pages CDN 캐시 대응)
const bust = () => `?v=${Math.floor(Date.now() / 3600000)}`;

export async function loadJSON(path) {
  const res = await fetch(path + bust());
  if (!res.ok) throw new Error(`${path} 불러오기 실패 (${res.status})`);
  return res.json();
}

// XML 문서를 받아 DOMParser로 파싱
export async function loadXML(path) {
  const res = await fetch(path + bust());
  if (!res.ok) throw new Error(`${path} 불러오기 실패 (${res.status})`);
  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('XML 파싱 오류');
  return doc;
}

let cache = null;
export async function loadAll() {
  if (cache) return cache;
  const [weather, air, meta] = await Promise.all([
    loadJSON('data/weather.json'),
    loadJSON('data/air.json'),
    loadJSON('data/meta.json').catch(() => ({})),
  ]);
  cache = { weather, air, meta };
  return cache;
}

// ---------- 날짜 ----------
const kstDate = (offset = 0) => {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};
export const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
export const toDash = (k) => `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`;
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
export function dateLabel(key) {
  const d = new Date(toDash(key) + 'T00:00:00Z');
  const today = new Date(toDash(ymd(kstDate())) + 'T00:00:00Z');
  const diff = Math.round((d - today) / 86400000);
  const rel = ['오늘', '내일', '모레'][diff] ?? `${diff}일 후`;
  return { rel, short: `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEK[d.getUTCDay()]})` };
}
export const hourLabel = (t) => `${Number(t.slice(0, 2))}시`;

// ---------- 점수 계산 묶음 ----------
// 날짜별 미세먼지 등급: 오늘은 실측값, 이후는 예보 등급
export function dustGradeFor(air, regionId, dateKey) {
  const todayKey = ymd(kstDate());
  const cur = air.current?.[regionId]?.grade ?? null;
  if (dateKey <= todayKey) return cur;
  return air.forecast?.[toDash(dateKey)]?.[regionId] ?? cur;
}

// 한 지역의 날짜별 점수 (오늘부터 최대 3일)
export function regionDays(data, regionId) {
  const reg = data.weather.regions?.[regionId];
  if (!reg) return [];
  const todayKey = ymd(kstDate());
  const keys = Object.keys(reg.days).filter((k) => k >= todayKey).sort().slice(0, 3);
  return keys.map((date) => {
    const hours = reg.days[date];
    const dust = dustGradeFor(data.air, regionId, date);
    return {
      date, hours, dust, dustName: GRADE_NAMES[dust] ?? '정보없음',
      score: dayScore(hours, dust),
      best: bestWindow(hours, dust),
      label: dateLabel(date),
    };
  });
}

// ---------- 지역 선택 상태 (URL 파라미터 > localStorage > 서울) ----------
const STORE_KEY = 'nadri.region';
export function currentRegion() {
  const q = new URLSearchParams(location.search).get('region');
  let saved = null;
  try { saved = localStorage.getItem(STORE_KEY); } catch {}
  const id = [q, saved].find((v) => v && REGIONS.some((r) => r.id === v)) || 'seoul';
  return getRegion(id);
}
export function saveRegion(id) {
  try { localStorage.setItem(STORE_KEY, id); } catch {}
  const url = new URL(location.href);
  url.searchParams.set('region', id);
  history.replaceState(null, '', url);
  updateNavLinks(id);
}

export function regionSelect(selectedId, onChange) {
  const sel = document.createElement('select');
  sel.className = 'region-select';
  sel.setAttribute('aria-label', '지역 선택');
  sel.innerHTML = REGIONS.map((r) => `<option value="${r.id}" ${r.id === selectedId ? 'selected' : ''}>${r.full}</option>`).join('');
  sel.addEventListener('change', () => { saveRegion(sel.value); onChange(sel.value); });
  return sel;
}

// ---------- 레이아웃 ----------
const PAGES = [
  ['index.html', '오늘의 나들이'],
  ['detail.html', '시간대별 상세'],
  ['spots.html', '추천 장소'],
  ['about.html', '서비스 소개'],
];

function updateNavLinks(id) {
  document.querySelectorAll('[data-nav]').forEach((a) => {
    a.href = `${a.dataset.nav}?region=${id}`;
  });
}

export function renderLayout(active) {
  const header = document.getElementById('site-header');
  header.innerHTML = `
    <div class="wrap header-inner">
      <a class="logo" data-nav="index.html" href="index.html"><span class="logo-mark">☀</span>나들이 지수</a>
      <button class="menu-btn" aria-label="메뉴 열기" aria-expanded="false">☰</button>
      <nav class="nav">
        ${PAGES.map(([href, label]) => `<a data-nav="${href}" href="${href}" class="${href === active ? 'active' : ''}">${label}</a>`).join('')}
      </nav>
    </div>`;
  const btn = header.querySelector('.menu-btn');
  btn.addEventListener('click', () => {
    const open = header.classList.toggle('open');
    btn.setAttribute('aria-expanded', open);
  });
  updateNavLinks(currentRegion().id);

  document.getElementById('site-footer').innerHTML = `
    <div class="wrap footer-inner">
      <div id="meta-line">데이터 정보를 불러오는 중…</div>
      <div class="sources">출처: 기상청 단기예보 · 한국환경공단 에어코리아(환경부/한국환경공단) · 한국관광공사 TourAPI — 공공데이터포털(data.go.kr)</div>
    </div>`;
}

export function renderMeta(meta) {
  const el = document.getElementById('meta-line');
  if (!el) return;
  const t = meta.updatedAt ? new Date(meta.updatedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '-';
  el.innerHTML = `${meta.sample ? '<span class="badge-sample">샘플 데이터</span> ' : ''}마지막 갱신 ${t} · 예보 발표 ${meta.weatherBase ?? '-'}`;
}

export function showError(container, err) {
  container.innerHTML = `<div class="error-box">😵 데이터를 불러오지 못했어요.<br><small>${err.message}</small></div>`;
}

// 점수 → 색상 (CSS 변수와 동일한 4단계)
export const gradeColor = (key) => ({ best: '#1f9d6b', good: '#3d8bd9', soso: '#e3a008', bad: '#e0574f' }[key]);
