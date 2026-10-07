/* KBO 공식 기록 모으기 — 실황 업데이트 · 3년 능력치 보정에 씀(사용자 2026-10-07: 원래 자료를 저장소에 남기기)
   쓰는 법:  node tools/kbo_collect.js 2024 2025 2026   → data/kbo-records.json
   koreabaseball.com 기록실(ASP.NET)을 시즌 · 팀별로 불러옴. 사이트가 동률 선수 순서를 그때그때 바꿔서 1쪽 · 2쪽을 따로 받으면
   겹치거나 빠지는 선수가 생김 → 팀마다 기본 순서 + 여러 정렬(많은 순 · 적은 순)을 받아 선수 ID 로 합치고, 인원이 3번 연속 같을 때까지 되풀이. */
'use strict';
const fs = require('fs'), path = require('path');
const BASE = 'https://www.koreabaseball.com';
const P = 'ctl00$ctl00$ctl00$cphContents$cphContents$cphContents$';
let cookie = '';

async function get(url){
  const r = await fetch(url, {headers:{cookie}});
  take(r); return await r.text();
}
function take(r){ const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : []; sc.forEach(c => { const kv = c.split(';')[0]; const k = kv.split('=')[0]; cookie = cookie.split('; ').filter(x => x && x.split('=')[0] !== k).concat([kv]).join('; '); }); }
function decode(s){ return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' '); }
function strip(s){ return decode(s.replace(/<[^>]+>/g, '')).trim(); }
function form(html){
  const f = new URLSearchParams();
  for(const m of html.matchAll(/<input[^>]*type="hidden"[^>]*>/g)){ const n = (m[0].match(/name="([^"]+)"/) || [])[1], v = (m[0].match(/value="([^"]*)"/) || [, ''])[1]; if(n) f.set(n, decode(v)); }
  for(const m of html.matchAll(/<input[^>]*type="text"[^>]*>/g)){ const n = (m[0].match(/name="([^"]+)"/) || [])[1]; if(n) f.set(n, decode((m[0].match(/value="([^"]*)"/) || [, ''])[1])); }
  for(const m of html.matchAll(/<select[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)){
    const sel = (m[2].match(/<option[^>]*selected[^>]*value="([^"]*)"/) || m[2].match(/<option[^>]*value="([^"]*)"[^>]*selected/) || m[2].match(/<option[^>]*value="([^"]*)"/) || [, ''])[1];
    f.set(m[1], decode(sel));
  }
  return f;
}
async function post(url, html, sets, target){
  const f = form(html); Object.entries(sets).forEach(([k, v]) => f.set(k, v));
  f.set('__EVENTTARGET', target || ''); f.set('__EVENTARGUMENT', '');
  const r = await fetch(url, {method:'POST', body:f, headers:{'Content-Type':'application/x-www-form-urlencoded', cookie}});
  take(r); return await r.text();
}
function rows(html){
  const t = (html.match(/<table[^>]*class="tData01[^"]*"[^>]*>([\s\S]*?)<\/table>/) || html.match(/<table[^>]*>([\s\S]*?)<\/table>/) || [, ''])[1];
  const th = [...((t.match(/<thead>([\s\S]*?)<\/thead>/) || [, ''])[1]).matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(m => strip(m[1]));
  const body = (t.match(/<tbody>([\s\S]*?)<\/tbody>/) || [, ''])[1];
  const out = [];
  for(const tr of body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)){
    const id = (tr[1].match(/playerId=(\d+)/) || [])[1]; if(!id) continue;
    out.push([id].concat([...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => strip(m[1]))));
  }
  const pages = [...html.matchAll(/<a[^>]*href="javascript:__doPostBack\('([^']+btnNo(\d+))'[^>]*>/g)].map(m => ({tg:m[1], n:m[2]})).filter(p => p.n !== '1');
  return {th, rows:out, pages};
}
function teamsOf(html){ const m = html.match(/<select[^>]*name="[^"]*ddlTeam\$ddlTeam"[^>]*>([\s\S]*?)<\/select>/); return m ? [...m[1].matchAll(/value="([^"]*)"/g)].map(x => x[1]).filter(Boolean) : []; }

async function once(page, season, cols, U){
  const url = BASE + page;
  let base = await get(url);
  base = await post(url, base, {[P + 'ddlSeason$ddlSeason']:String(season)}, P + 'ddlSeason$ddlSeason');
  const add = h => { const r = rows(h); if(r.th.length) U.th = r.th; r.rows.forEach(x => { U.rows[x[0]] = x; }); return r; };
  for(const tm of teamsOf(base)){
    const sets = {[P + 'ddlSeason$ddlSeason']:String(season), [P + 'ddlTeam$ddlTeam']:tm};
    const h = await post(url, base, sets, P + 'ddlTeam$ddlTeam');
    const r0 = add(h); for(const pg of r0.pages) add(await post(url, h, sets, pg.tg));
    for(const [c, o] of cols){
      const s2 = {...sets, [P + 'hfOrderByCol']:c, [P + 'hfOrderBy']:o};
      const h1 = await post(url, h, s2, P + 'lbtnOrderBy'); const r = add(h1);
      for(const pg of r.pages) add(await post(url, h1, s2, pg.tg));
    }
  }
}
async function all(page, season, cols){
  const U = {th:[], rows:{}}, hist = [];
  for(let i = 0; i < 6; i++){
    await once(page, season, cols, U); hist.push(Object.keys(U.rows).length);
    if(i >= 2 && hist[i] === hist[i - 1] && hist[i - 1] === hist[i - 2]) break;
  }
  console.log(page, season, hist.join(' → '));
  return U;
}
function pick(U, cols){
  const idx = cols.map(c => { const i = U.th.indexOf(c); if(i < 0) throw new Error('no column ' + c + ' in ' + U.th.join(',')); return i + 1; });
  const o = {}; Object.values(U.rows).forEach(x => { o[x[0]] = {n:x[2], t:x[3], v:idx.map(i => x[i])}; }); return o;
}

/* 지금 등록 선수 명단(선수 조회) — 팀마다 모든 쪽 · 3번 연속 같을 때까지. [id, 등번호, 이름, 팀, 포지션, 생년월일, 체격, 출신교] */
async function roster(){
  const url = BASE + '/Player/Search.aspx', out = {};
  for(let pass = 0, hist = []; pass < 6; pass++){
    let base = await get(url);
    const teams = (base.match(/<select[^>]*name="([^"]*ddlTeam)"[^>]*>([\s\S]*?)<\/select>/) || []);
    const tn = teams[1], codes = teams[2] ? [...teams[2].matchAll(/value="([^"]*)"/g)].map(x => x[1]).filter(Boolean) : [];
    for(const tm of codes){
      let h = await post(url, base, {[tn]:tm}, tn), seen = new Set(), guard = 0;
      while(guard++ < 30){
        const body = (h.match(/<tbody>([\s\S]*?)<\/tbody>/) || [, ''])[1];
        for(const tr of body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)){ const id = (tr[1].match(/playerId=(\d+)/) || [])[1]; if(!id) continue; out[id] = [id].concat([...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => strip(m[1]))); }
        const hd = decode(h);   /* 쪽 버튼 href 의 따옴표가 &#39; 로 옴 */
        const pg = [...hd.matchAll(/__doPostBack\('([^']+btnNo(\d+))'/g)].map(m => ({tg:m[1], n:+m[2]})).filter(p => !seen.has(p.n));
        const cur = +((hd.match(/<a[^>]*class="on"[^>]*>(\d+)<\/a>/) || [])[1] || 1); seen.add(cur);
        let nx = pg.find(p => p.n === cur + 1);
        if(!nx){ const nb = (hd.match(/__doPostBack\('([^']+btnNext)'/) || [])[1]; if(nb && !seen.has(cur + 1)){ h = await post(url, h, {[tn]:tm}, nb); continue; } break; }
        h = await post(url, h, {[tn]:tm}, nx.tg);
      }
    }
    hist.push(Object.keys(out).length); console.log('roster', hist.join(' → '));
    if(pass >= 2 && hist[pass] === hist[pass - 1] && hist[pass - 1] === hist[pass - 2]) break;
  }
  return out;
}

(async function(){
  if(process.argv[2] === 'roster'){
    const R = await roster(), out = path.join(__dirname, '..', 'data', 'kbo-roster.json');
    fs.mkdirSync(path.dirname(out), {recursive:true});
    fs.writeFileSync(out, JSON.stringify({src:'koreabaseball.com 선수 조회', made:new Date().toISOString().slice(0, 10), cols:['id', '등번호', '이름', '팀', '포지션', '생년월일', '체격', '출신교'], rows:Object.values(R)}));
    const per = {}; Object.values(R).forEach(x => { per[x[3]] = (per[x[3]] || 0) + 1; }); console.log('saved', out, Object.keys(R).length, JSON.stringify(per)); return;
  }
  const seasons = process.argv.slice(2).map(Number).filter(Boolean);
  if(!seasons.length){ console.log('node tools/kbo_collect.js 2024 2025 2026'); return; }
  const HB1 = ['G', 'PA', 'AB', 'H', '2B', '3B', 'HR', 'RBI', 'SF'], HB2 = ['BB', 'IBB', 'HBP', 'SO', 'SLG', 'OBP'];
  const PB1 = ['G', 'W', 'L', 'SV', 'HLD', 'IP', 'H', 'HR', 'BB', 'HBP', 'SO', 'ER'], PB2 = ['QS', 'TBF'], PD1 = ['GS'];
  const D = {src:'koreabaseball.com 정규시즌 기록', made:new Date().toISOString().slice(0, 10),
    hit:{cols:['이름', '팀'].concat(HB1, HB2)}, pit:{cols:['이름', '팀'].concat(PB1, PB2, PD1)}};
  for(const s of seasons){
    const a = pick(await all('/Record/Player/HitterBasic/Basic1.aspx', s, [['PA_CN', 'DESC'], ['PA_CN', 'ASC'], ['GAME_CN', 'DESC'], ['GAME_CN', 'ASC']]), HB1);
    const b = pick(await all('/Record/Player/HitterBasic/Basic2.aspx', s, [['BB_CN', 'DESC'], ['BB_CN', 'ASC'], ['SO_CN', 'DESC'], ['SO_CN', 'ASC']]), HB2);
    D.hit[s] = {}; Object.keys(a).forEach(id => { D.hit[s][id] = [a[id].n, a[id].t].concat(a[id].v, b[id] ? b[id].v : HB2.map(() => '')); });
    const p = pick(await all('/Record/Player/PitcherBasic/Basic1.aspx', s, [['INN2_CN', 'DESC'], ['INN2_CN', 'ASC'], ['GAME_CN', 'DESC'], ['GAME_CN', 'ASC']]), PB1);
    const q = pick(await all('/Record/Player/PitcherBasic/Basic2.aspx', s, [['PA_CN', 'DESC'], ['PA_CN', 'ASC'], ['PIT_CN', 'DESC'], ['PIT_CN', 'ASC']]), PB2);
    const r = pick(await all('/Record/Player/PitcherBasic/Detail1.aspx', s, [['START_CN', 'DESC'], ['START_CN', 'ASC'], ['GO_CN', 'DESC'], ['GO_CN', 'ASC']]), PD1);
    D.pit[s] = {}; Object.keys(p).forEach(id => { D.pit[s][id] = [p[id].n, p[id].t].concat(p[id].v, q[id] ? q[id].v : ['', ''], r[id] ? r[id].v : ['']); });
    console.log(s, '타자', Object.keys(D.hit[s]).length, '투수', Object.keys(D.pit[s]).length);
  }
  const out = path.join(__dirname, '..', 'data', 'kbo-records.json');
  let old = {}; try{ old = JSON.parse(fs.readFileSync(out, 'utf8')); }catch(_){ }
  seasons.forEach(s => { old.hit = old.hit || {}; old.pit = old.pit || {}; });
  const merged = Object.assign({}, old, {src:D.src, made:D.made, hit:Object.assign({}, old.hit || {}, D.hit), pit:Object.assign({}, old.pit || {}, D.pit)});
  fs.mkdirSync(path.dirname(out), {recursive:true});
  fs.writeFileSync(out, JSON.stringify(merged));
  console.log('saved', out, Math.round(fs.statSync(out).size / 1024) + 'KB');
})().catch(e => { console.error(e); process.exit(1); });
