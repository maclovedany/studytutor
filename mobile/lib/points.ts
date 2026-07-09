/** 포인트 이벤트 목록의 합계 = 총 포인트. (웹 lib/points.ts 와 동일 규칙, 잔액 컬럼 없음) */
export function sumPoints(events: { points: number }[]): number {
  return events.reduce((total, e) => total + e.points, 0);
}
