// cards.json 행 구조 확인
import { readFileSync } from 'node:fs';
const j = JSON.parse(readFileSync(new URL('../public/data/cards.json', import.meta.url), 'utf8'));
const rows = j.cards;
console.log('cards:', rows.length);
const withSet = rows.filter((r) => Array.isArray(r[12]) && r[12].length);
console.log('setcodes 배열 있는 행:', withSet.length);
console.log('샘플 길이:', rows.slice(0, 3).map((r) => r.length));
console.log('샘플:', JSON.stringify(rows.find((r) => r[0] === 89631139))?.slice(0, 300));
// 바닐라 몬스터 후보
const vanilla = rows.filter((r) => (r[2] & 0x1) && !(r[2] & (0x40 | 0x2000 | 0x800000 | 0x4000000 | 0x80000 | 0x2 | 0x4)) && r[5] > 0 && r[5] <= 4);
console.log('바닐라 후보:', vanilla.length, vanilla.slice(0, 5).map((r) => `${r[0]}:${r[1]}`).join(' | '));
