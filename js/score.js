// 나들이 지수 산정 알고리즘
// 항목별 0~100점을 계산한 뒤 가중 평균
export const WEIGHTS = { temp: 0.25, rain: 0.30, dust: 0.25, sky: 0.10, wind: 0.10 };

const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v));

// 기온: 18~24℃는 만점, 벗어난 1℃마다 6점 감점
export function tempScore(t) {
  if (t == null || isNaN(t)) return 50;
  if (t >= 18 && t <= 24) return 100;
  const diff = t < 18 ? 18 - t : t - 24;
  return clamp(100 - diff * 6);
}

// 강수: 강수확률이 곧 감점, 실제 강수형태(PTY)가 있으면 0점
export function rainScore(pop, pty) {
  if (pty && Number(pty) > 0) return 0;
  return clamp(100 - (Number(pop) || 0));
}

// 미세먼지 등급 (환경부 기준)
export function pm10Grade(v) {
  if (v == null || isNaN(v)) return null;
  if (v <= 30) return 1;
  if (v <= 80) return 2;
  if (v <= 150) return 3;
  return 4;
}
export function pm25Grade(v) {
  if (v == null || isNaN(v)) return null;
  if (v <= 15) return 1;
  if (v <= 35) return 2;
  if (v <= 75) return 3;
  return 4;
}
export const GRADE_NAMES = { 1: '좋음', 2: '보통', 3: '나쁨', 4: '매우나쁨' };
export const GRADE_FROM_NAME = { '좋음': 1, '보통': 2, '나쁨': 3, '매우나쁨': 4 };
const DUST_POINTS = { 1: 100, 2: 75, 3: 35, 4: 0 };

// 미세먼지: PM10, PM2.5 중 나쁜 쪽 등급 기준
export function dustScore(grade) {
  return grade ? DUST_POINTS[grade] : 70;
}

// 하늘상태 SKY: 1 맑음, 3 구름많음, 4 흐림
export function skyScore(sky) {
  return { 1: 100, 3: 75, 4: 50 }[Number(sky)] ?? 70;
}
export const SKY_NAMES = { 1: '맑음', 3: '구름많음', 4: '흐림' };
export const PTY_NAMES = { 0: '없음', 1: '비', 2: '비/눈', 3: '눈', 4: '소나기' };

// 풍속: 4m/s까지 만점, 7m/s까지 60점으로 완만히, 이후 급감
export function windScore(w) {
  w = Number(w) || 0;
  if (w <= 4) return 100;
  if (w <= 7) return 100 - ((w - 4) / 3) * 40;
  return clamp(60 - (w - 7) * 15);
}

// 한 시간 단위 점수
export function hourScore(h, dustGrade) {
  const parts = {
    temp: tempScore(h.TMP),
    rain: rainScore(h.POP, h.PTY),
    dust: dustScore(dustGrade),
    sky: skyScore(h.SKY),
    wind: windScore(h.WSD),
  };
  let total = 0;
  for (const k in WEIGHTS) total += parts[k] * WEIGHTS[k];
  return { total: Math.round(total), parts };
}

// 하루 점수: 9~18시 평균 (활동 시간대)
export function dayScore(hours, dustGrade) {
  const active = hours.filter((h) => {
    const hr = Number(h.time.slice(0, 2));
    return hr >= 9 && hr <= 18;
  });
  const list = (active.length ? active : hours).map((h) => hourScore(h, dustGrade));
  if (!list.length) return null;
  const avg = (key) => Math.round(list.reduce((s, x) => s + (key ? x.parts[key] : x.total), 0) / list.length);
  return {
    total: avg(),
    parts: { temp: avg('temp'), rain: avg('rain'), dust: avg('dust'), sky: avg('sky'), wind: avg('wind') },
  };
}

// 연속 3시간 중 가장 좋은 시간대 (슬라이딩 윈도우)
export function bestWindow(hours, dustGrade, size = 3) {
  const day = hours.filter((h) => {
    const hr = Number(h.time.slice(0, 2));
    return hr >= 7 && hr <= 21;
  });
  if (day.length < size) return null;
  const scores = day.map((h) => hourScore(h, dustGrade).total);
  let best = -1, idx = 0;
  for (let i = 0; i + size <= scores.length; i++) {
    const s = scores.slice(i, i + size).reduce((a, b) => a + b, 0) / size;
    if (s > best) { best = s; idx = i; }
  }
  return { start: day[idx].time, end: day[idx + size - 1].time, score: Math.round(best) };
}

export function gradeOf(score) {
  if (score >= 80) return { key: 'best', label: '최고', emoji: '😆', msg: '나들이 가기 딱 좋은 날이에요!' };
  if (score >= 60) return { key: 'good', label: '좋음', emoji: '🙂', msg: '가볍게 외출하기 괜찮아요.' };
  if (score >= 40) return { key: 'soso', label: '보통', emoji: '😐', msg: '실외 활동은 짧게, 실내 위주로 추천해요.' };
  return { key: 'bad', label: '비추', emoji: '😣', msg: '오늘은 실내에서 쉬는 걸 추천해요.' };
}
