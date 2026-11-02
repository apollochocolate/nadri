// 공공데이터포털 OpenAPI 수집 스크립트 (GitHub Actions에서 실행)
// 사용법: SERVICE_KEY=발급키 node scripts/fetch-data.mjs [--tour]
//   --tour 옵션이 있으면 관광정보(XML)도 함께 갱신합니다.
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { REGIONS } from '../js/regions.js';
import { latLonToGrid } from '../js/grid.js';

const ROOT = new URL('../', import.meta.url);
const DATA = new URL('data/', ROOT);

// Encoding 키를 넣어도 동작하도록 한 번 디코딩
let KEY = process.env.SERVICE_KEY || '';
if (!KEY) {
  console.error('❌ SERVICE_KEY 환경변수가 없습니다.');
  process.exit(1);
}
if (KEY.includes('%')) KEY = decodeURIComponent(KEY);

const WITH_TOUR = process.argv.includes('--tour');

// ---------- 공통 유틸 ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(base, params, { retries = 3 } = {}) {
  const qs = new URLSearchParams({ serviceKey: KEY, ...params });
  const url = `${base}?${qs}`;
  for (let i = 1; i <= retries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // 키 오류 등은 JSON을 요청해도 XML로 돌아오는 경우가 있음
      if (text.includes('<returnAuthMsg>') || text.includes('SERVICE_KEY_IS_NOT_REGISTERED')) {
        const msg = (text.match(/<returnAuthMsg>(.*?)<\/returnAuthMsg>/) || [])[1] || 'SERVICE KEY ERROR';
        throw new Error(msg);
      }
      return text;
    } catch (e) {
      console.warn(`  ⚠ 재시도 ${i}/${retries}: ${e.message}`);
      if (i === retries) throw e;
      await sleep(1000 * i);
    }
  }
}

async function requestJson(base, params) {
  const text = await request(base, params);
  const json = JSON.parse(text);
  const header = json.response?.header;
  if (header && header.resultCode !== '00') throw new Error(`${header.resultCode} ${header.resultMsg}`);
  const items = json.response?.body?.items;
  return Array.isArray(items) ? items : items?.item ?? [];
}

// 한국 시간(KST) 기준 날짜 도우미
function kstNow() {
  return new Date(Date.now() + 9 * 3600 * 1000); // UTC 메서드로 읽으면 KST 값
}
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
const ymdDash = (d) => d.toISOString().slice(0, 10);

async function readJson(name, fallback) {
  try { return JSON.parse(await readFile(new URL(name, DATA), 'utf8')); } catch { return fallback; }
}
async function saveJson(name, obj) {
  await writeFile(new URL(name, DATA), JSON.stringify(obj));
}

// ---------- 1. 기상청 단기예보 (JSON) ----------
const VILAGE_URL = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst';
const BASE_HOURS = [2, 5, 8, 11, 14, 17, 20, 23];

// 가장 최근 발표시각 계산 (발표 10분 뒤부터 조회 가능)
function latestBase() {
  const now = kstNow();
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  let base = null;
  for (const h of BASE_HOURS) if (minutes >= h * 60 + 10) base = h;
  const d = new Date(now);
  if (base === null) { d.setUTCDate(d.getUTCDate() - 1); base = 23; }
  return { date: ymd(d), time: String(base).padStart(2, '0') + '00' };
}

async function fetchVilage(nx, ny, base) {
  const items = await requestJson(VILAGE_URL, {
    pageNo: 1, numOfRows: 1000, dataType: 'JSON',
    base_date: base.date, base_time: base.time, nx, ny,
  });
  // { 날짜: { 시각: {TMP, POP, ...} } } 형태로 재구성
  const days = {};
  const KEEP = ['TMP', 'POP', 'SKY', 'PTY', 'WSD', 'REH', 'PCP'];
  for (const it of items) {
    if (!KEEP.includes(it.category)) continue;
    const day = (days[it.fcstDate] ??= {});
    const slot = (day[it.fcstTime] ??= { time: it.fcstTime });
    const v = it.fcstValue;
    slot[it.category] = it.category === 'PCP' ? v : Number(v);
  }
  return days;
}

async function collectWeather() {
  console.log('☁ 기상청 단기예보 수집');
  const latest = latestBase();
  const today = ymd(kstNow());
  // 오늘 0200 발표분을 먼저 받고 최신 발표분으로 덮어써서 오늘 하루 전체 시간대를 확보
  const bases = [];
  if (latest.date === today && latest.time !== '0200') bases.push({ date: today, time: '0200' });
  bases.push(latest);

  const out = { baseDate: latest.date, baseTime: latest.time, regions: {} };
  for (const r of REGIONS) {
    const { nx, ny } = latLonToGrid(r.lat, r.lon);
    const merged = {};
    for (const b of bases) {
      const days = await fetchVilage(nx, ny, b);
      for (const [d, slots] of Object.entries(days)) {
        merged[d] ??= {};
        for (const [t, v] of Object.entries(slots)) merged[d][t] = { ...merged[d][t], ...v };
      }
      await sleep(150);
    }
    const days = {};
    for (const d of Object.keys(merged).sort()) {
      days[d] = Object.values(merged[d]).sort((a, b) => a.time.localeCompare(b.time));
    }
    out.regions[r.id] = { nx, ny, days };
    console.log(`  ✓ ${r.name} (${nx},${ny}) ${Object.keys(days).length}일`);
  }
  return out;
}

// ---------- 2. 에어코리아 대기오염정보 (JSON) ----------
const AIR_BASE = 'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc';

const toNum = (v) => (v == null || v === '-' || v === '' || isNaN(Number(v)) ? null : Number(v));
const g10 = (v) => (v == null ? null : v <= 30 ? 1 : v <= 80 ? 2 : v <= 150 ? 3 : 4);
const g25 = (v) => (v == null ? null : v <= 15 ? 1 : v <= 35 ? 2 : v <= 75 ? 3 : 4);
const GRADE = { '좋음': 1, '보통': 2, '나쁨': 3, '매우나쁨': 4 };
// 예보 권역 → 시·도 매핑 (경기·강원은 권역이 둘로 나뉨)
const FORECAST_ALIAS = {
  '경기': ['경기북부', '경기남부', '경기'],
  '강원': ['영서', '영동', '강원영서', '강원영동', '강원'],
};

async function collectAir() {
  console.log('🌫 에어코리아 실시간 측정정보 수집');
  const items = await requestJson(`${AIR_BASE}/getCtprvnRltmMesureDnsty`, {
    sidoName: '전국', returnType: 'json', numOfRows: 1000, pageNo: 1, ver: '1.0',
  });
  // 시·도별 측정소 평균
  const current = {};
  for (const r of REGIONS) {
    const rows = items.filter((it) => it.sidoName === r.airName);
    const avg = (key) => {
      const vals = rows.map((x) => toNum(x[key])).filter((v) => v != null);
      return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    };
    const pm10 = avg('pm10Value');
    const pm25 = avg('pm25Value');
    const grade = Math.max(g10(pm10) ?? 0, g25(pm25) ?? 0) || null;
    current[r.id] = { pm10, pm25, grade, stations: rows.length, dataTime: rows[0]?.dataTime ?? null };
    console.log(`  ✓ ${r.name} PM10 ${pm10} / PM2.5 ${pm25} (${rows.length}개 측정소)`);
  }

  console.log('🌫 에어코리아 미세먼지 예보 수집');
  const forecast = {};
  const searchDate = ymdDash(kstNow());
  for (const code of ['PM10', 'PM25']) {
    const list = await requestJson(`${AIR_BASE}/getMinuDustFrcstDspth`, {
      searchDate, InformCode: code, returnType: 'json', numOfRows: 100, pageNo: 1, ver: '1.1',
    });
    // 예보 대상일(informData)별 가장 최근 발표만 사용
    const latestByDate = {};
    for (const it of list) {
      if (it.informCode !== code) continue;
      const prev = latestByDate[it.informData];
      if (!prev || it.dataTime > prev.dataTime) latestByDate[it.informData] = it;
    }
    for (const [date, it] of Object.entries(latestByDate)) {
      // "서울 : 보통,제주 : 좋음,..." 문자열 파싱
      const map = {};
      for (const part of (it.informGrade || '').split(',')) {
        const [k, v] = part.split(':').map((s) => s.trim());
        if (k && GRADE[v]) map[k] = GRADE[v];
      }
      const target = (forecast[date] ??= {});
      for (const r of REGIONS) {
        const keys = FORECAST_ALIAS[r.airName] || [r.airName];
        const g = Math.max(0, ...keys.map((k) => map[k] || 0)) || null;
        if (g) target[r.id] = Math.max(target[r.id] || 0, g); // PM10/PM2.5 중 나쁜 등급
      }
    }
    await sleep(200);
  }
  console.log(`  ✓ 예보 일자: ${Object.keys(forecast).join(', ') || '없음'}`);
  return { current, forecast };
}

// ---------- 3. 한국관광공사 관광정보 (XML 원문 저장) ----------
const TOUR_URL = 'https://apis.data.go.kr/B551011/KorService2/areaBasedList2';

async function collectTour() {
  console.log('🏞 관광정보(XML) 수집');
  await mkdir(new URL('spots/', DATA), { recursive: true });
  for (const r of REGIONS) {
    const common = { MobileOS: 'ETC', MobileApp: 'NadriIndex', numOfRows: 120, pageNo: 1, arrange: 'Q' };
    // _type을 지정하지 않으면 XML로 응답 → 브라우저에서 DOMParser로 파싱
    let xml = await request(TOUR_URL, { ...common, lDongRegnCd: r.lDong });
    let total = Number((xml.match(/<totalCount>(\d+)<\/totalCount>/) || [])[1] || 0);
    if (!total) {
      // 법정동 코드가 통하지 않으면 (구)지역코드로 재시도
      xml = await request(TOUR_URL, { ...common, areaCode: r.areaCode });
      total = Number((xml.match(/<totalCount>(\d+)<\/totalCount>/) || [])[1] || 0);
    }
    if (!total) { console.warn(`  ⚠ ${r.name}: 결과 없음 (기존 파일 유지)`); continue; }
    await writeFile(new URL(`spots/${r.id}.xml`, DATA), xml);
    console.log(`  ✓ ${r.name}: 전체 ${total}건 중 상위 ${common.numOfRows}건 저장`);
    await sleep(200);
  }
}

// ---------- 실행 ----------
const meta = await readJson('meta.json', {});
const errors = [];

try {
  const weather = await collectWeather();
  await saveJson('weather.json', weather);
  meta.weatherBase = `${weather.baseDate} ${weather.baseTime}`;
} catch (e) { errors.push('weather: ' + e.message); }

try {
  const air = await collectAir();
  await saveJson('air.json', air);
  meta.airTime = Object.values(air.current).find((x) => x.dataTime)?.dataTime ?? null;
} catch (e) { errors.push('air: ' + e.message); }

if (WITH_TOUR) {
  try { await collectTour(); meta.tourUpdatedAt = new Date().toISOString(); }
  catch (e) { errors.push('tour: ' + e.message); }
}

meta.sample = false;
meta.updatedAt = new Date().toISOString();
meta.errors = errors;
await saveJson('meta.json', meta);

if (errors.length) {
  console.error('❌ 일부 수집 실패:\n  ' + errors.join('\n  '));
  // 일부만 실패하면 성공한 데이터는 커밋되도록 0으로 종료, 전부 실패하면 1
  process.exit(errors.length >= (WITH_TOUR ? 3 : 2) ? 1 : 0);
}
console.log('✅ 수집 완료');
