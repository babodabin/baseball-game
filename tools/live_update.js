/* 실황 업데이트 자료 만들기 — 게임 페이지(localhost, 실황 새 게임을 막 시작한 상태)에서 실행. 결과 = window.LIVE_UPDATE_NEW
   쓰는 법(사용자 "실황 업데이트해" 때마다 · 실제 시즌 끝날 때):
     1) node tools/kbo_collect.js 2026          (기록)      2) node tools/kbo_collect.js roster      (지금 등록 명단)
     3) 게임에서 실황 새 게임 → 이 파일 실행 → LIVE_UPDATE_NEW.need 를 확인
     4) node tools/kbo_collect.js extra "<need>" 2026   (새 선수 투타 · 수비 포지션)  5) 이 파일 다시 실행 → index.html 의 LIVE_UPDATE 자리에 넣기
   규칙(사용자 2026-10-07): 실제 선수는 실제 자료로만 바뀜 — 이적은 옮기고, 실제 명단에 없으면 빼고, 올해 1군 기록이 있는데 게임에 없으면 넣음(많이 뛴 순서로 팀 45명까지).
   새 선수 능력치: 2026 기록의 리그 백분위 → 지금 게임 선수 능력치 분포의 같은 자리, 표본이 적으면 교체 선수 수준(25%)으로 당김. 기록 없는 칸(주루 · 수비 · 구속)은 포지션별 게임 중간값 */
(async function(){
  'use strict';
  const J = async f => (await fetch(f + '?' + Date.now())).json();
  const K = await J('data/kbo-records.json'), RO = (await J('data/kbo-roster.json')).rows;
  let EX = {}; try{ EX = (await J('data/kbo-extra.json')).players || {}; }catch(_){ }
  const S = 2026, CAP = 45;
  const clean = n => String(n).replace(/\s*\(.*\)$/, '');
  const TID = {LG:'LG', '한화':'HH', SSG:'SSG', '삼성':'SS', NC:'NC', KT:'KT', '롯데':'LT', KIA:'KIA', '두산':'DS', '키움':'KW', '고양':'KW'};
  const num = v => { const s = String(v == null ? '' : v); if(s.indexOf('/') >= 0){ let x = 0; s.split(' ').forEach(t => { if(t.indexOf('/') >= 0){ const q = t.split('/'); x += q[0] / q[1]; } else x += +t || 0; }); return x; } return +s || 0; };
  const hi = c => K.hit.cols.indexOf(c), pi = c => K.pit.cols.indexOf(c);
  const byName = {}; RO.forEach(r => (byName[r[2]] = byName[r[2]] || []).push(r));
  /* 게임 선수 ↔ KBO 명단(국내 = 이름, 외국인 = 같은 팀 + 이름 앞부분) */
  /* 외국인 표기 차이: 띄어쓰기(잭 로그 ↔ 잭로그) · 일본 이름 첫 글자(다무라 ↔ 타무라 · 도다 ↔ 토다 · 다케다 ↔ 타케다) */
  const norm = s => String(s).replace(/\s/g, '').replace(/^다/, '타').replace(/^도/, '토').replace(/^데/, '테').replace(/^디/, '티');
  function match(tid, p){
    const real = clean(p[1]); let c = byName[real] || [];
    if(!c.length) c = RO.filter(r => TID[r[3]] === tid && r[2] === real.replace(/\s/g, ''));
    if(!c.length){ const toks = real.split(' ').filter(x => x.length >= 2); c = RO.filter(r => TID[r[3]] === tid && toks.some(tk => r[2] === tk || r[2].indexOf(tk) === 0 || tk.indexOf(r[2]) === 0 || norm(r[2]) === norm(tk))); }
    if(c.length > 1){ const s = c.filter(r => TID[r[3]] === tid); if(s.length) c = s; }
    return c[0] || null;
  }
  const players = state.players, moves = [], gone = [], have = new Set(), size = {};
  Object.keys(players).forEach(tid => { size[tid] = 0; ['bat', 'pit'].forEach(k => (players[tid][k] || []).forEach(p => {
    size[tid]++; const m = match(tid, p); if(!m){ gone.push([tid, k, p[0], p[1]]); return; }
    have.add(m[0]); const to = TID[m[3]]; if(to && to !== tid) moves.push([tid, to, k, p[0], p[1], m[0]]);
  })); });
  gone.forEach(g => size[g[0]]--); moves.forEach(m => { size[m[0]]--; size[m[1]]++; });
  const roOf = id => RO.find(x => x[0] === id);
  const cand = [];
  Object.entries(K.hit[S] || {}).forEach(([id, r]) => { if(have.has(id)) return; const ro = roOf(id); if(!ro) return; const pa = num(r[hi('PA')]); if(pa >= 30) cand.push({id, kind:'bat', tid:TID[ro[3]], w:pa / 4, ro, r}); });
  Object.entries(K.pit[S] || {}).forEach(([id, r]) => { if(have.has(id)) return; const ro = roOf(id); if(!ro) return; const ip = num(r[pi('IP')]); if(ip >= 10) cand.push({id, kind:'pit', tid:TID[ro[3]], w:ip, ro, r}); });
  cand.sort((a, b) => b.w - a.w);
  /* 외국인: KBO 명단 출신교에 나라 이름 → 외국인(일본 · 대만 · 호주 = 아시아쿼터). 팀당 외국인 4명 규칙(사용자) — 실제로 떠난 외국인 자리만큼만 새로 넣음(올해 많이 뛴 순)
     (KBO 등록 명단엔 부상 대체 외국인처럼 잠깐 등록된 선수도 있어 다 넣으면 팀마다 5~7명이 됨) */
  const COUNTRY = /미국|일본|호주|대만|베네수엘라|도미니카|푸에르토리코|쿠바|멕시코|캐나다|파나마|콜롬비아|니카라과|네덜란드|중국/;
  const ASIA = /일본|대만|호주|중국|필리핀|인도네시아/;
  const fType = ro => { const s = String(ro[7] || ''); return COUNTRY.test(s) ? (ASIA.test(s.split('-')[0]) ? 'asia' : 'foreign') : null; };
  const isF = (p, kind) => { try{ return !!window.isForeignV1613(p, kind); }catch(_){ return false; } };
  const fSlots = {}; gone.forEach(g => { const t = players[g[0]], p = (t[g[1]] || []).find(q => q[0] === g[2]); if(p && isF(p, g[1])) fSlots[g[0]] = (fSlots[g[0]] || 0) + 1; });
  const add = []; cand.forEach(c => {
    if(!c.tid || size[c.tid] >= CAP) return;
    c.ftype = fType(c.ro);
    if(c.ftype){ if(!(fSlots[c.tid] > 0)) return; fSlots[c.tid]--; }
    size[c.tid]++; add.push(c);
  });
  const need = add.filter(c => !EX[c.id]).map(c => c.kind + ':' + c.id).join(',');

  /* ── 능력치: 리그 백분위 → 게임 분포 ── */
  function pct(list, f, x){ const v = list.map(f).sort((a, b) => a - b); let i = 0; while(i < v.length && v[i] < x) i++; return v.length > 1 ? i / (v.length - 1) : .5; }
  function gameDist(kind, idx, filt){ const v = []; Object.keys(players).forEach(tid => (players[tid][kind] || []).forEach(p => { if(!filt || filt(p)) v.push(+p[idx] || 0); })); return v.sort((a, b) => a - b); }
  const at = (v, q) => v.length ? v[Math.max(0, Math.min(v.length - 1, Math.round(q * (v.length - 1))))] : 60;
  const HQ = Object.values(K.hit[S]).filter(r => num(r[hi('PA')]) >= 50), PQ = Object.values(K.pit[S]).filter(r => num(r[pi('IP')]) >= 20);
  const hs = r => { const pa = num(r[hi('PA')]), ab = num(r[hi('AB')]) || 1, h = num(r[hi('H')]), d2 = num(r[hi('2B')]), d3 = num(r[hi('3B')]), hr = num(r[hi('HR')]), bb = num(r[hi('BB')]), so = num(r[hi('SO')]), avg = h / ab, slg = (h + d2 + 2 * d3 + 3 * hr) / ab, obp = num(r[hi('OBP')]);
    return {pa, avg, k:so / (pa || 1), iso:slg - avg, hrp:hr / (pa || 1), bbp:bb / (pa || 1), oa:obp - avg}; };
  const ps = r => { const ip = num(r[pi('IP')]) || 1, g = num(r[pi('G')]), gs = num(r[pi('GS')]);
    return {ip, g, gs, bb9:num(r[pi('BB')]) * 9 / ip, k9:num(r[pi('SO')]) * 9 / ip, h9:num(r[pi('H')]) * 9 / ip, hr9:num(r[pi('HR')]) * 9 / ip, ipgs:gs ? ip / gs : 0}; };
  const HQs = HQ.map(hs), PQs = PQ.map(ps);
  const POS = {'포수':'C', '1루수':'1B', '2루수':'2B', '3루수':'3B', '유격수':'SS', '좌익수':'LF', '중견수':'CF', '우익수':'RF', '지명타자':'DH'};
  const rows = {};
  add.forEach(c => {
    const ex = EX[c.id] || {}, hand = ex.hand || '', birth = +(String(c.ro[5] || '').slice(0, 4)) || 2000, age = S - birth;
    if(c.kind === 'bat'){
      const s = hs(c.r), conf = Math.min(1, s.pa / 400), q = (x, f) => .25 + (x - .25) * conf;
      const qc = q(pct(HQs, x => x.avg, s.avg) * .7 + (1 - pct(HQs, x => x.k, s.k)) * .3), qp = q(pct(HQs, x => x.iso, s.iso) * .5 + pct(HQs, x => x.hrp, s.hrp) * .5), qe = q(pct(HQs, x => x.bbp, s.bbp) * .5 + pct(HQs, x => x.oa, s.oa) * .5);
      const pos = POS[ex.field] || (/포수/.test(ex.pos) ? 'C' : /외야/.test(ex.pos) ? 'LF' : '2B');
      const same = p => p[2] === pos;
      const bats = (hand.match(/(우|좌|양)타/) || [, '우'])[1];
      rows[c.id] = {tid:c.tid, kind:'bat', name:c.ro[2], age, id:c.id,
        p:[c.ro[2], c.ro[2], pos, bats, at(gameDist('bat', 4), qc), at(gameDist('bat', 5), qp), at(gameDist('bat', 6, same), .5), at(gameDist('bat', 7, same), .5), at(gameDist('bat', 8), qe)]};
    } else {
      const s = ps(c.r), sp = s.gs >= Math.max(3, s.g / 2), conf = Math.min(1, s.ip / (sp ? 120 : 50)), q = x => .25 + (x - .25) * conf;
      const qc = q(1 - pct(PQs, x => x.bb9, s.bb9)), qb = q(pct(PQs, x => x.k9, s.k9) * .5 + (1 - pct(PQs, x => x.h9, s.h9)) * .3 + (1 - pct(PQs, x => x.hr9, s.hr9)) * .2);
      const SPQ = PQs.filter(x => x.gs >= 5), role = sp ? '선발' : '불펜', same = p => p[2] === role || (role === '불펜' && p[2] === '마무리');
      const qs = sp && SPQ.length ? q(pct(SPQ, x => x.ipgs, s.ipgs)) : .5;
      const thr = (hand.match(/(우|좌)(투|언)/) || [, '우'])[1];
      rows[c.id] = {tid:c.tid, kind:'pit', name:c.ro[2], age, id:c.id,
        p:[c.ro[2], c.ro[2], role, thr, at(gameDist('pit', 4, same), .5), at(gameDist('pit', 5), qc), at(gameDist('pit', 6), qb), at(gameDist('pit', 7, same), qs)]};
    }
  });
  /* 외국인 표시(게임 flagOf — 타자 10번째 · 투수 9번째 칸) */
  add.forEach(c => { const x = rows[c.id]; if(x && c.ftype){ x.p[c.kind === 'bat' ? 9 : 8] = c.ftype; x.ftype = c.ftype; } });
  /* 같은 팀에 같은 이름이 있으면(게임 선수 · 새 선수) 이름 뒤에 (등번호) — 예: 한화 박준영 두 명 */
  Object.values(rows).forEach(x => {
    const team = players[x.tid] || {}, inTeam = (team.bat || []).concat(team.pit || []).some(p => clean(p[1]) === x.name || p[0] === x.name);
    const twin = Object.values(rows).filter(y => y !== x && y.tid === x.tid && y.name === x.name).length;
    if(inTeam || twin){ const no = (roOf(x.id) || [])[1] || x.id.slice(-2); x.p[0] = x.name + '(' + no + ')'; x.p[1] = x.p[0]; }
  });
  window.LIVE_UPDATE_NEW = {ver:K.made || new Date().toISOString().slice(0, 10), date:new Date().toISOString().slice(0, 10), season:S,
    moves:moves.map(m => ({from:m[0], to:m[1], kind:m[2], alias:m[3], real:m[4], id:m[5]})),
    gone:gone.map(g => ({tid:g[0], kind:g[1], alias:g[2], real:g[3]})),
    add:Object.values(rows), need};
  console.log('LIVE_UPDATE_NEW', moves.length, gone.length, Object.keys(rows).length, 'need extra:', need ? need.split(',').length : 0);
})();
