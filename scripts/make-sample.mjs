// 서비스키 없이 화면을 확인하기 위한 샘플 데이터 생성기
// 실제 API 응답과 같은 구조로 data/ 폴더에 저장합니다. (GitHub Actions가 실데이터로 덮어씀)
import { writeFile, mkdir } from 'node:fs/promises';
import { REGIONS } from '../js/regions.js';
import { latLonToGrid } from '../js/grid.js';

const DATA = new URL('../data/', import.meta.url);
await mkdir(new URL('spots/', DATA), { recursive: true });

// 재현 가능한 의사난수
let seed = 20261102;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

const kst = new Date(Date.now() + 9 * 3600 * 1000);
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
const dash = (d) => d.toISOString().slice(0, 10);
const dates = [0, 1, 2].map((i) => { const d = new Date(kst); d.setUTCDate(d.getUTCDate() + i); return d; });

// ---------- weather.json ----------
const weather = { baseDate: ymd(kst), baseTime: '0500', regions: {} };
REGIONS.forEach((r, ri) => {
  const { nx, ny } = latLonToGrid(r.lat, r.lon);
  const baseTemp = 10 + (38 - r.lat) * 1.6; // 남쪽일수록 따뜻하게
  const days = {};
  dates.forEach((d, di) => {
    const dayShift = [0, -2.5, 1.5][di] + (rand() - 0.5) * 3;
    // 날짜·지역별로 비 오는 시간대를 하나 만들기
    const rainy = rand() < [0.25, 0.45, 0.3][di];
    const rainStart = 6 + Math.floor(rand() * 10);
    const rainLen = 2 + Math.floor(rand() * 6);
    const windBase = 1.5 + rand() * 3 + (r.id === 'jeju' || r.id === 'busan' ? 2 : 0);
    days[ymd(d)] = Array.from({ length: 24 }, (_, h) => {
      const tmp = Math.round(baseTemp + dayShift + 6 * Math.sin(((h - 9) / 24) * 2 * Math.PI));
      const inRain = rainy && h >= rainStart && h < rainStart + rainLen;
      const nearRain = rainy && h >= rainStart - 2 && h < rainStart + rainLen + 2;
      const pop = inRain ? 60 + Math.round(rand() * 30) : nearRain ? 30 + Math.round(rand() * 10) : Math.round(rand() * 20);
      const sky = pop >= 50 ? 4 : pop >= 25 ? 3 : rand() < 0.65 ? 1 : 3;
      return {
        time: String(h).padStart(2, '0') + '00',
        TMP: tmp, POP: pop, SKY: sky, PTY: inRain ? 1 : 0,
        WSD: Math.round((windBase + Math.sin(h / 4) * 1.2 + (inRain ? 2 : 0)) * 10) / 10,
        REH: Math.round(50 + pop * 0.4 + rand() * 10),
        PCP: inRain ? `${1 + Math.floor(rand() * 4)}mm` : '강수없음',
      };
    });
  });
  weather.regions[r.id] = { nx, ny, days };
});

// ---------- air.json ----------
const current = {}, forecast = { [dash(dates[0])]: {}, [dash(dates[1])]: {} };
const g10 = (v) => (v <= 30 ? 1 : v <= 80 ? 2 : v <= 150 ? 3 : 4);
const g25 = (v) => (v <= 15 ? 1 : v <= 35 ? 2 : v <= 75 ? 3 : 4);
for (const r of REGIONS) {
  const pm10 = Math.round(15 + rand() * 75);
  const pm25 = Math.round(pm10 * (0.35 + rand() * 0.25));
  const grade = Math.max(g10(pm10), g25(pm25));
  current[r.id] = { pm10, pm25, grade, stations: 5 + Math.floor(rand() * 30), dataTime: `${dash(kst)} ${String(kst.getUTCHours()).padStart(2, '0')}:00` };
  forecast[dash(dates[0])][r.id] = grade;
  forecast[dash(dates[1])][r.id] = Math.min(4, Math.max(1, grade + (rand() < 0.3 ? 1 : rand() < 0.5 ? -1 : 0)));
}

// ---------- spots/*.xml (관광공사 KorService2 응답 구조와 동일) ----------
// [이름, 콘텐츠타입(12 관광지/14 문화시설/28 레포츠), 위도, 경도]
const SPOTS = {
  seoul: [['경복궁', 12, 37.5796, 126.9770], ['국립중앙박물관', 14, 37.5240, 126.9804], ['남산서울타워', 12, 37.5512, 126.9882], ['북촌한옥마을', 12, 37.5826, 126.9830], ['서울숲', 12, 37.5444, 127.0374], ['국립현대미술관 서울', 14, 37.5788, 126.9800], ['뚝섬한강공원 수상레저', 28, 37.5296, 127.0700], ['동대문디자인플라자', 14, 37.5665, 127.0092]],
  busan: [['해운대해수욕장', 12, 35.1587, 129.1604], ['감천문화마을', 12, 35.0975, 129.0106], ['태종대', 12, 35.0533, 129.0870], ['부산시립미술관', 14, 35.1667, 129.1365], ['국립해양박물관', 14, 35.0790, 129.0800], ['송도해상케이블카', 28, 35.0763, 129.0237], ['광안리해수욕장', 12, 35.1532, 129.1186]],
  daegu: [['김광석다시그리기길', 12, 35.8604, 128.6066], ['국립대구박물관', 14, 35.8462, 128.6386], ['앞산공원', 12, 35.8270, 128.5850], ['이월드', 28, 35.8533, 128.5638], ['동화사', 12, 35.9933, 128.7020], ['대구미술관', 14, 35.8255, 128.6748]],
  incheon: [['인천 차이나타운', 12, 37.4757, 126.6178], ['월미도', 12, 37.4752, 126.5970], ['송도센트럴파크', 12, 37.3924, 126.6390], ['인천상륙작전기념관', 14, 37.4290, 126.6640], ['강화 전등사', 12, 37.6195, 126.4910], ['국립세계문자박물관', 14, 37.3935, 126.6340]],
  gwangju: [['국립아시아문화전당', 14, 35.1468, 126.9205], ['무등산국립공원', 12, 35.1340, 126.9888], ['양림동 역사문화마을', 12, 35.1385, 126.9150], ['광주시립미술관', 14, 35.1830, 126.8870], ['펭귄마을', 12, 35.1400, 126.9135]],
  daejeon: [['엑스포과학공원 한빛탑', 12, 36.3760, 127.3870], ['국립중앙과학관', 14, 36.3760, 127.3750], ['대전 오월드', 28, 36.2890, 127.3990], ['계족산 황톳길', 12, 36.3960, 127.4560], ['장태산자연휴양림', 12, 36.2190, 127.3410], ['대전시립미술관', 14, 36.3670, 127.3850]],
  ulsan: [['태화강 국가정원', 12, 35.5486, 129.2960], ['간절곶', 12, 35.3590, 129.3600], ['대왕암공원', 12, 35.4930, 129.4400], ['울산박물관', 14, 35.5230, 129.3220], ['영남알프스 복합웰컴센터', 28, 35.5640, 129.0400]],
  sejong: [['국립세종수목원', 12, 36.4980, 127.2890], ['세종호수공원', 12, 36.4990, 127.2770], ['대통령기록관', 14, 36.4870, 127.2670], ['국립세종도서관', 14, 36.4990, 127.2690], ['베어트리파크', 12, 36.6380, 127.2560]],
  gyeonggi: [['수원화성', 12, 37.2870, 127.0110], ['에버랜드', 28, 37.2940, 127.2020], ['한국민속촌', 12, 37.2590, 127.1180], ['경기도어린이박물관', 14, 37.2830, 127.1150], ['광명동굴', 12, 37.4260, 126.8660], ['헤이리예술마을', 14, 37.7900, 126.6990], ['화담숲', 12, 37.3430, 127.2850]],
  gangwon: [['남이섬', 12, 37.7910, 127.5250], ['설악산국립공원', 12, 38.1190, 128.4650], ['경포해변', 12, 37.8050, 128.9080], ['오죽헌', 14, 37.7790, 128.8780], ['삼척해양레일바이크', 28, 37.3380, 129.2850], ['강원도립화목원', 12, 37.8780, 127.7300]],
  chungbuk: [['청남대', 12, 36.4600, 127.4900], ['국립현대미술관 청주', 14, 36.6450, 127.4900], ['단양 도담삼봉', 12, 36.9990, 128.3440], ['단양 패러글라이딩', 28, 36.9740, 128.3600], ['수암골', 12, 36.6420, 127.4970], ['속리산 법주사', 12, 36.5420, 127.8330]],
  chungnam: [['공주 공산성', 12, 36.4650, 127.1260], ['부여 궁남지', 12, 36.2730, 126.9110], ['국립부여박물관', 14, 36.2770, 126.9150], ['독립기념관', 14, 36.7830, 127.2230], ['대천해수욕장', 12, 36.3060, 126.5130], ['외암민속마을', 12, 36.7370, 127.0180]],
  jeonbuk: [['전주한옥마을', 12, 35.8150, 127.1530], ['국립전주박물관', 14, 35.8000, 127.0890], ['내장산국립공원', 12, 35.4870, 126.8960], ['군산근대역사박물관', 14, 35.9910, 126.7110], ['새만금방조제', 12, 35.8000, 126.5300], ['마이산', 12, 35.7600, 127.4140]],
  jeonnam: [['순천만습지', 12, 34.8860, 127.5090], ['순천만국가정원', 12, 34.9300, 127.4980], ['여수해상케이블카', 28, 34.7440, 127.7550], ['담양 죽녹원', 12, 35.3270, 126.9860], ['목포근대역사관', 14, 34.7890, 126.3810], ['보성 대한다원', 12, 34.7160, 127.0830]],
  gyeongbuk: [['불국사', 12, 35.7900, 129.3320], ['경주 동궁과 월지', 12, 35.8340, 129.2270], ['국립경주박물관', 14, 35.8290, 129.2280], ['안동 하회마을', 12, 36.5390, 128.5180], ['경주월드', 28, 35.8370, 129.2830], ['포항 스페이스워크', 12, 36.0640, 129.3900]],
  gyeongnam: [['통영케이블카', 28, 34.8270, 128.4240], ['진주성', 12, 35.1890, 128.0790], ['남해 독일마을', 12, 34.8000, 128.0400], ['거제 바람의언덕', 12, 34.7410, 128.6620], ['국립진주박물관', 14, 35.1890, 128.0770], ['합천 해인사', 12, 35.8010, 128.0980]],
  jeju: [['성산일출봉', 12, 33.4590, 126.9420], ['한라산국립공원', 12, 33.3620, 126.5290], ['국립제주박물관', 14, 33.5130, 126.5490], ['우도', 12, 33.5060, 126.9530], ['9.81파크', 28, 33.3870, 126.3660], ['협재해수욕장', 12, 33.3940, 126.2400], ['본태박물관', 14, 33.3040, 126.3940]],
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
for (const r of REGIONS) {
  const items = SPOTS[r.id].map(([title, type, lat, lon], i) => `<item><addr1>${esc(r.full)}</addr1><addr2></addr2><areacode>${r.areaCode}</areacode><contentid>9${r.areaCode}${String(i).padStart(3, '0')}</contentid><contenttypeid>${type}</contenttypeid><firstimage></firstimage><firstimage2></firstimage2><mapx>${lon}</mapx><mapy>${lat}</mapy><tel></tel><title>${esc(title)}</title><lDongRegnCd>${r.lDong}</lDongRegnCd></item>`).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><response><header><resultCode>0000</resultCode><resultMsg>OK</resultMsg></header><body><items>${items}</items><numOfRows>${SPOTS[r.id].length}</numOfRows><pageNo>1</pageNo><totalCount>${SPOTS[r.id].length}</totalCount></body></response>`;
  await writeFile(new URL(`spots/${r.id}.xml`, DATA), xml);
}

const meta = { sample: true, updatedAt: new Date().toISOString(), weatherBase: `${weather.baseDate} 0500`, airTime: current.seoul.dataTime, tourUpdatedAt: new Date().toISOString(), errors: [] };
await writeFile(new URL('weather.json', DATA), JSON.stringify(weather));
await writeFile(new URL('air.json', DATA), JSON.stringify({ current, forecast }, null, 1));
await writeFile(new URL('meta.json', DATA), JSON.stringify(meta, null, 1));
console.log('✅ 샘플 데이터 생성 완료');
