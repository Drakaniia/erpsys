const rightDots: Array<[number, number]> = [];
for (let r = 0; r < 6; r++)
  for (let c = 0; c < 14; c++) rightDots.push([1278 + c * 21.5, 31 + r * 22.5]);
for (let r = 0; r < 2; r++)
  for (let c = 6; c < 14; c++) rightDots.push([1278 + c * 21.5, 163 + r * 23]);

function hatch(x: number, y: number, w: number, h: number): string[] {
  const lines: string[] = [];
  for (let i = 0; x + i * 6 + h * 0.5 <= x + w; i++)
    lines.push(`M${x + i * 6} ${y + h}l${h * 0.5} ${-h}`);
  return lines;
}

const topHatch = hatch(1438, 172, 88, 18);
const bottomHatch = hatch(1438, 852, 114, 43);

const outer: Array<[number, number]> = [
  [0, 645],
  [50, 650],
  [100, 710],
  [140, 770],
  [175, 822],
  [218, 830],
  [226, 885],
  [233, 945],
  [120, 1090],
  [0, 1130],
];
const contours = Array.from({ length: 10 }, (_, i) => {
  const k = 1 - i * 0.085;
  const p = outer.map(([x, y]) => [
    (x * k).toFixed(1),
    (935 + (y - 935) * k).toFixed(1),
  ]);
  return `M${p[0]}C${p[1]} ${p[2]} ${p[3]}C${p[4]} ${p[5]} ${p[6]}C${p[7]} ${p[8]} ${p[9]}`;
});

const nodeXs = [271, 303, 334, 366, 397, 429];
const nodeYs = [861, 899, 937];

const line = "fill-none stroke-current [stroke-width:1]";
const thin = "fill-none stroke-current [stroke-width:0.8]";
const dot = "fill-current";

/** Drafting-sheet line work pinned to the corners of the auth page. */
export default function BlueprintBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden text-[#b4b1a8] [&>svg]:absolute [&>svg]:h-auto [&>svg]:overflow-visible"
    >
      <svg className="top-0 left-0 w-[22.7%]" viewBox="0 0 360 330">
        <g className={line}>
          <path d="M112 0A162 162 0 0 1 0 155" />
          <path d="M168 0A219.7 219.7 0 0 1 0 187" />
          <path d="M0 15L183 185" />
          <path d="M152 67H313" />
          <path d="M313 0V67" strokeDasharray="4 3" />
          <path d="M313 67H356" strokeDasharray="4 3" />
          <path d="M52 100V320" />
          <path d="M0 125H72" strokeDasharray="4 3" />
        </g>
        <g className={dot}>
          <circle cx="68" cy="67" r="2" />
          <circle cx="140" cy="92" r="2" />
          <circle cx="112" cy="126" r="2" />
          <circle cx="82" cy="154" r="2" />
          <circle cx="313" cy="67" r="2.5" />
          <circle cx="52" cy="272" r="2" />
          <path d="M52 98l-3 7h6zM52 322l-3-7h6zM357 67l-7-3v6zM72 125l-7-3v6z" />
        </g>
        <path className={thin} d="M20 95h14M27 88v14" />
        <path className={thin} d="M171 228h14M178 221v14" />
      </svg>

      <svg
        className="top-0 left-[37.8%] hidden w-[14.5%] sm:block"
        viewBox="600 0 230 175"
      >
        <g className={line}>
          <path d="M619 0A98 100 0 0 0 717 100A98 100 0 0 0 815 0" />
          <path d="M699 0V167" />
          <path d="M606 28Q620 108 700 112L818 115" strokeDasharray="4 3" />
        </g>
        <path className={dot} d="M604 24l-3 8l6-1zM819 115l-7-3v6z" />
        <path className={thin} d="M661 41h10M666 36v10" />
      </svg>

      <svg className="top-0 right-0 w-[21.8%]" viewBox="1240 0 346 335">
        <g className={`${dot} opacity-80`}>
          {rightDots.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="1.1" />
          ))}
        </g>
        <path className={line} d={topHatch.join("")} />
        <path className={thin} d="M1243 185h16M1251 177v16" />
        <path
          className={line}
          d="M1407 247H1527M1368 262H1526M1557 222V325M1538 247H1573"
        />
        <g className={dot}>
          <circle cx="1407" cy="247" r="2" />
          <circle cx="1557" cy="247" r="2" />
          <path d="M1367 262l7-3v6z" />
        </g>
      </svg>

      <svg className="bottom-0 left-0 w-[34.4%]" viewBox="0 620 545 372">
        <g className={`${line} opacity-90`}>
          {contours.map((d, i) => (
            <path key={i} d={d} />
          ))}
          <path d="M256 827H452" />
          {nodeXs.map((x) => (
            <path key={x} d={`M${x} 812V958`} />
          ))}
          {nodeYs.map((y) => (
            <path key={y} d={`M256 ${y}H445`} />
          ))}
          <path d="M429 803V958" />
          <path className="[stroke-width:0.8]" d="M421 829l3 6M431 829l3 6" />
          <path d="M430 861H540" strokeDasharray="4 3" />
        </g>
        <g className={`${dot} opacity-80`}>
          {nodeXs.flatMap((x) =>
            nodeYs.map((y) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="2.2" />
            )),
          )}
        </g>
        <path
          className={thin}
          d="M69 630h16M77 622v16M150 710h16M158 702v16M221 962h14M228 955v14"
        />
      </svg>

      <svg className="right-0 bottom-0 w-[37%]" viewBox="1000 470 586 522">
        <g className={line}>
          <path d="M1552 482V788M1408 563H1552" />
          <path d="M1552 770V788" strokeDasharray="3 3" />
          <circle cx="1255" cy="935" r="158" strokeDasharray="5 4" />
          <path d="M1277 770V992M1015 932H1586M1252 871H1428M1417 814V992" />
          <path d={bottomHatch.join("")} />
        </g>
        <g className={dot}>
          <circle cx="1552" cy="563" r="2.5" />
          <path d="M1552 480l-3 8h6zM1552 790l-3-8h6zM1407 563l7-3v6zM1015 932l7-3v6zM1417 812l-3 8h6z" />
        </g>
      </svg>
    </div>
  );
}
