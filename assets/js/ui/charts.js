// ECharts setup that follows the Jo-CHF design tokens (light and dark).
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
export function palette() {
  return {
    s: [1, 2, 3, 4, 5, 6, 7, 8].map(i => css('--s' + i)),
    ink: css('--ink'), ink2: css('--ink-2'), muted: css('--muted'), grid: css('--chart-grid'), axis: css('--chart-axis'),
    surface: css('--surface'), trace: css('--trace'), navy: css('--navy'), line: css('--line'), good: css('--good'), bad: css('--bad'),
    dark: (document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark',
  };
}
// sequential blue steps (from the validated reference palette)
export const BLUE = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
export function ordinal(n, dark) {
  const light = ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281'];
  const dk = ['#1c5cab', '#2a78d6', '#3987e5', '#6da7ec', '#9ec5f4'];
  const src = dark ? dk : light;
  if (n === 5) return src;
  if (n === 3) return [src[0], src[2], src[4]];
  if (n === 4) return [src[0], src[1], src[3], src[4]];
  return src.slice(0, n);
}
export function base(P) {
  return {
    animationDuration: 1100, animationEasing: 'cubicOut', animationDurationUpdate: 600,
    textStyle: { fontFamily: '"IBM Plex Sans", system-ui, sans-serif', color: P.ink2, fontSize: 12 },
    grid: { left: 8, right: 16, top: 30, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis', backgroundColor: P.surface, borderColor: P.line, borderWidth: 1, padding: [8, 12],
      textStyle: { color: P.ink, fontSize: 12.5 }, extraCssText: 'box-shadow:0 10px 30px -10px rgba(0,0,0,.35);border-radius:10px;',
      axisPointer: { type: 'line', lineStyle: { color: P.axis }, shadowStyle: { color: P.dark ? 'rgba(255,255,255,.04)' : 'rgba(20,24,43,.04)' } },
    },
    legend: { top: 0, left: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, itemGap: 14, textStyle: { color: P.ink2, fontSize: 12 } },
  };
}
export function axisCat(P, data, extra = {}) {
  return { type: 'category', data, axisLine: { lineStyle: { color: P.axis } }, axisTick: { show: false }, axisLabel: { color: P.muted, fontSize: 11.5 }, ...extra };
}
export function axisVal(P, extra = {}) {
  return { type: 'value', splitLine: { lineStyle: { color: P.grid } }, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: P.muted, fontSize: 11.5 }, ...extra };
}
export const barEnd = r => ({ borderRadius: r });
