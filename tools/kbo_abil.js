/* 3년 기록 능력치 보정값 만들기 — 게임 페이지(TEAMS 가 있는 곳)에서 실행. 결과 = window.KBO_ABIL_NEW {sim, live}
   (사용자 2026-10-07) 시즌 비중 3:2:1(2026:2025:2024)에 타석 · 이닝을 곱함 — 예전엔 시즌마다 같은 비중이라 짧은 부상 시즌이 크게 반영됐다(홍창기 2025 51경기).
   계산은 v1.6.3 과 같은 틀: 기록 순위대로 "지금 게임 능력치 분포"에서 값을 고르고(전체가 오르내리지 않음), 표본이 많아도 최대 70% 만 반영.
     타자(가중 150타석+): 정확 = 타율 70% · 삼진율 30% / 파워 = 순수장타율 50% · 타석당 홈런 50% / 선구 = 볼넷률 50% · (출루율−타율) 50% · 주루 · 수비 그대로
     투수(가중 40이닝+): 제구 = 9이닝당 볼넷 / 변화 = 9이닝당 삼진 50% · 피안타 30% · 피홈런 20% / 체력 = 선발 경기당 이닝(선발 5경기+) · 구속 그대로
   값 = [정확, 파워, 주루, 수비, 선구] / [구속, 제구, 변화, 체력] 의 "바뀌는 양". 실황(live) = 2026 기록만 */
(async function(){
  'use strict';
  const D = await (await fetch('data/kbo-records.json?' + Date.now())).json();
  const TEAM = {LG:'LG', HH:'한화', SSG:'SSG', SS:'삼성', NC:'NC', KT:'KT', LT:'롯데', KIA:'KIA', DS:'두산', KW:'키움'};
  const num = v => { if(v == null || v === '') return 0; const s = String(v); if(s.indexOf('/') >= 0){ const p = s.split(' '); let x = 0; p.forEach(t => { if(t.indexOf('/') >= 0){ const q = t.split('/'); x += (+q[0]) / (+q[1]); } else x += +t; }); return x; } return +s || 0; };
  const H = D.hit.cols, PC = D.pit.cols, hi = c => H.indexOf(c), pi = c => PC.indexOf(c);
  /* 선수 찾기: 이름 + 팀(2026 우선) → KBO 기록 */
  function rec(kind, name, team, seasons){
    const out = {};
    seasons.forEach(s => {
      const T = (kind === 'bat' ? D.hit : D.pit)[s]; if(!T) return;
      let rows = Object.values(T).filter(r => r[0] === name);
      if(rows.length > 1){ const same = rows.filter(r => r[1] === team); if(same.length) rows = same; }
      if(rows.length === 1) out[s] = rows[0];
    });
    return out;
  }
  const W = {2026:3, 2025:2, 2024:1};
  function bat(R, seasons){
    let pa = 0, ab = 0, h = 0, d2 = 0, d3 = 0, hr = 0, bb = 0, hbp = 0, so = 0, sf = 0, raw = 0;
    seasons.forEach(s => { const r = R[s]; if(!r) return; const w = W[s] || 1, g = c => num(r[hi(c)]) * w;
      pa += g('PA'); ab += g('AB'); h += g('H'); d2 += g('2B'); d3 += g('3B'); hr += g('HR'); bb += g('BB'); hbp += g('HBP'); so += g('SO'); sf += g('SF'); raw += num(r[hi('PA')]); });
    if(!pa || !ab) return null;
    const avg = h / ab, slg = (h + d2 + 2 * d3 + 3 * hr) / ab, obp = (h + bb + hbp) / Math.max(1, ab + bb + hbp + sf);
    return {raw, avg, k:so / pa, iso:slg - avg, hrp:hr / pa, bbp:bb / pa, oa:obp - avg};
  }
  function pit(R, seasons){
    let ip = 0, h = 0, hr = 0, bb = 0, so = 0, gs = 0, gsIp = 0, raw = 0, rawGs = 0;
    seasons.forEach(s => { const r = R[s]; if(!r) return; const w = W[s] || 1, I = num(r[pi('IP')]), G = num(r[pi('GS')]), GG = num(r[pi('G')]);
      ip += I * w; h += num(r[pi('H')]) * w; hr += num(r[pi('HR')]) * w; bb += num(r[pi('BB')]) * w; so += num(r[pi('SO')]) * w; raw += I; rawGs += G;
      if(G >= 1 && GG > 0){ const share = G / GG; gs += G * w; gsIp += I * share * w; } });   /* 선발 이닝 ≈ 이닝 × 선발 비율(구원 몫 뺌) */
    if(!ip) return null;
    return {raw, rawGs, bb9:bb * 9 / ip, k9:so * 9 / ip, h9:h * 9 / ip, hr9:hr * 9 / ip, ipgs:gs ? gsIp / gs : null};
  }
  function z(list, f){ const v = list.map(f), m = v.reduce((a, b) => a + b, 0) / v.length, sd = Math.sqrt(v.reduce((a, b) => a + (b - m) * (b - m), 0) / v.length) || 1; return v.map(x => (x - m) / sd); }
  /* 순위대로 지금 분포에서 값 고르기 */
  function remap(list, idx, score, conf){
    const cur = list.map(x => +x.p[idx] || 0).slice().sort((a, b) => b - a);
    const order = list.map((x, i) => i).sort((a, b) => score[b] - score[a]);
    const out = new Array(list.length);
    order.forEach((li, rank) => { const x = list[li], t = cur[rank]; out[li] = Math.round((t - (+x.p[idx] || 0)) * conf(x)); });
    return out;
  }
  function build(seasons){
    const B = [], P = [];
    TEAMS.forEach(t => {
      const tn = TEAM[t.id]; if(!tn) return;
      (t.bat || []).forEach(p => { if(!p || !p[1] || p[1] === '가상 선수') return; const s = bat(rec('bat', p[1], tn, seasons), seasons); if(s && s.raw >= 150) B.push({p, s}); });
      (t.pit || []).forEach(p => { if(!p || !p[1] || p[1] === '가상 선수') return; const s = pit(rec('pit', p[1], tn, seasons), seasons); if(s && s.raw >= 40) P.push({p, s}); });
    });
    const out = {};
    if(B.length){
      const zc = z(B, x => x.s.avg), zk = z(B, x => -x.s.k), zi = z(B, x => x.s.iso), zh = z(B, x => x.s.hrp), zb = z(B, x => x.s.bbp), zo = z(B, x => x.s.oa);
      const conf = x => Math.min(.7, x.s.raw / 1200);
      const c = remap(B, 4, B.map((_, i) => zc[i] * .7 + zk[i] * .3), conf), pw = remap(B, 5, B.map((_, i) => zi[i] * .5 + zh[i] * .5), conf), e = remap(B, 8, B.map((_, i) => zb[i] * .5 + zo[i] * .5), conf);
      B.forEach((x, i) => { out['bat:' + x.p[0]] = [c[i], pw[i], 0, 0, e[i]]; });
    }
    if(P.length){
      const zbb = z(P, x => -x.s.bb9), zk = z(P, x => x.s.k9), zh = z(P, x => -x.s.h9), zhr = z(P, x => -x.s.hr9);
      const conf = x => Math.min(.7, x.s.raw / 250);
      const ctl = remap(P, 5, zbb, conf), brk = remap(P, 6, P.map((_, i) => zk[i] * .5 + zh[i] * .3 + zhr[i] * .2), conf);
      const SP = P.filter(x => x.s.ipgs != null && x.s.rawGs >= 5);
      const st = SP.length ? remap(SP, 7, z(SP, x => x.s.ipgs), x => Math.min(.7, x.s.rawGs / 40)) : [];
      P.forEach((x, i) => { const j = SP.indexOf(x); out['pit:' + x.p[0]] = [0, ctl[i], brk[i], j >= 0 ? st[j] : 0]; });
    }
    return out;
  }
  window.KBO_ABIL_NEW = {sim:build([2024, 2025, 2026]), live:build([2026])};
  console.log('KBO_ABIL_NEW', Object.keys(window.KBO_ABIL_NEW.sim).length, Object.keys(window.KBO_ABIL_NEW.live).length);
})();
