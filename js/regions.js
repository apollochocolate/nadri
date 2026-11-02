// 17개 시·도 기본 정보 (브라우저와 수집 스크립트가 함께 사용)
// lat/lon: 대표 지점(시·도청 부근), airName: 에어코리아 sidoName,
// areaCode: 관광공사 (구)지역코드, lDong: 법정동 시·도 코드
export const REGIONS = [
  { id: 'seoul',     name: '서울', full: '서울특별시',       lat: 37.5665, lon: 126.9780, airName: '서울', areaCode: 1,  lDong: '11' },
  { id: 'busan',     name: '부산', full: '부산광역시',       lat: 35.1796, lon: 129.0756, airName: '부산', areaCode: 6,  lDong: '26' },
  { id: 'daegu',     name: '대구', full: '대구광역시',       lat: 35.8714, lon: 128.6014, airName: '대구', areaCode: 4,  lDong: '27' },
  { id: 'incheon',   name: '인천', full: '인천광역시',       lat: 37.4563, lon: 126.7052, airName: '인천', areaCode: 2,  lDong: '28' },
  { id: 'gwangju',   name: '광주', full: '광주광역시',       lat: 35.1595, lon: 126.8526, airName: '광주', areaCode: 5,  lDong: '29' },
  { id: 'daejeon',   name: '대전', full: '대전광역시',       lat: 36.3504, lon: 127.3845, airName: '대전', areaCode: 3,  lDong: '30' },
  { id: 'ulsan',     name: '울산', full: '울산광역시',       lat: 35.5384, lon: 129.3114, airName: '울산', areaCode: 7,  lDong: '31' },
  { id: 'sejong',    name: '세종', full: '세종특별자치시',   lat: 36.4800, lon: 127.2890, airName: '세종', areaCode: 8,  lDong: '36' },
  { id: 'gyeonggi',  name: '경기', full: '경기도',           lat: 37.2636, lon: 127.0286, airName: '경기', areaCode: 31, lDong: '41' },
  { id: 'gangwon',   name: '강원', full: '강원특별자치도',   lat: 37.8813, lon: 127.7298, airName: '강원', areaCode: 32, lDong: '51' },
  { id: 'chungbuk',  name: '충북', full: '충청북도',         lat: 36.6424, lon: 127.4890, airName: '충북', areaCode: 33, lDong: '43' },
  { id: 'chungnam',  name: '충남', full: '충청남도',         lat: 36.6588, lon: 126.6728, airName: '충남', areaCode: 34, lDong: '44' },
  { id: 'jeonbuk',   name: '전북', full: '전북특별자치도',   lat: 35.8242, lon: 127.1480, airName: '전북', areaCode: 37, lDong: '52' },
  { id: 'jeonnam',   name: '전남', full: '전라남도',         lat: 34.8161, lon: 126.4629, airName: '전남', areaCode: 38, lDong: '46' },
  { id: 'gyeongbuk', name: '경북', full: '경상북도',         lat: 36.5760, lon: 128.5056, airName: '경북', areaCode: 35, lDong: '47' },
  { id: 'gyeongnam', name: '경남', full: '경상남도',         lat: 35.2280, lon: 128.6811, airName: '경남', areaCode: 36, lDong: '48' },
  { id: 'jeju',      name: '제주', full: '제주특별자치도',   lat: 33.4996, lon: 126.5312, airName: '제주', areaCode: 39, lDong: '50' },
];

export const getRegion = (id) => REGIONS.find((r) => r.id === id) || REGIONS[0];
