/*
 * ShiftData — データの読み書きはすべてこのファイルの `repo` を経由する。
 * Supabase 移行時は repo の各メソッド本体を supabase.from(...) 呼び出しに置き換える。
 *
 * 予定テーブル: history / facilities / facility_slots / staff / staff_facilities / shift_requests / request_submissions / shifts / min_overrides / payroll_settings
 *
 * @typedef {{key:string,label:string,start:string,end:string,min:number}} Slot      施設ごとの標準枠
 * @typedef {{id:string,name:string,slots:Slot[]}} Facility
 * @typedef {{id:string,name:string,facilityIds:string[],hourlyWage:number,transportType:'per_shift'|'monthly',transportAmount:number,hireDate:string,cumDays:number}} Staff
 *          facilityIds[0] が主な所属施設（人件費の計上先）。cumDays は累計勤務日数の初期値（手入力）。
 * @typedef {{id:string,facilityId:string,staffId:string,date:string,start:string,end:string,kind:string,source:'staff_request'|'admin'|'ai_draft',status:'draft'|'confirmed'}} Shift
 *          kind は枠の key または 'custom'。start/end は "HH:MM"、end <= start は翌日終了。同一施設・同一日は1件。
 * @typedef {{id:string,staffId:string,date:string,type:string,start?:string,end?:string}} ShiftRequest   施設は指定しない
 * @typedef {{staffId:string,month:string,submittedAt:string|null,extendedUntil:string|null}} RequestSubmission
 * @typedef {{id:string,at:string,actor:string,category:'shift'|'confirm'|'setting'|'request',action:string,facilityId:string|null,staffId:string|null,date:string|null,before:string|null,after:string|null}} HistoryEntry
 *          変更履歴（追記のみ）。Supabase では各テーブルのトリガーで history テーブルに自動記録する。
 */
(function () {
  const MONTH = { year: 2026, month: 11, days: 30, key: '2026-11' };
  const TODAY = '2026-10-20';
  const DEADLINE = '2026-10-15';
  const INTERVAL_MIN = 480;
  const LABEL = { morning: '朝', evening: '夕', both: '朝夕', night: '夜', base: '基本', off: '休', custom: '時間' };
  const S3 = (m, e) => [
    { key: 'morning', label: '朝', start: m[0], end: m[1], min: 1 },
    { key: 'evening', label: '夕', start: e[0], end: e[1], min: 1 },
    { key: 'night', label: '夜', start: '22:00', end: '08:00', min: 1 },
  ];
  const FACILITIES = [
    { id: 'BHJ', name: 'BHJ', slots: S3(['08:00', '16:00'], ['14:00', '22:00']) },
    { id: 'BHKK', name: 'BHKK', slots: S3(['08:00', '16:00'], ['14:00', '22:00']) },
    { id: 'MAHB', name: 'MAHB', slots: S3(['10:00', '19:00'], ['13:00', '22:00']) },
    { id: 'MAHT', name: 'MAHT', slots: [{ key: 'base', label: '基本', start: '10:00', end: '18:00', min: 1 }] },
    { id: 'MAHNM', name: 'MAHNM', slots: S3(['08:00', '16:00'], ['14:00', '22:00']) },
  ];
  const pad = (n) => String(n).padStart(2, '0');
  const dateKey = (d) => `${MONTH.key}-${pad(d)}`;
  const dayOf = (date) => Number(date.slice(8, 10));
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const fromMin = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
  const span = (s) => { const a = toMin(s.start); let b = toMin(s.end); if (b <= a) b += 1440; return [a, b]; };
  const abs = (s) => { const [a, b] = span(s); const o = (dayOf(s.date) - 1) * 1440; return [a + o, b + o]; };
  const overlap = (a, b) => a[0] < b[1] && b[0] < a[1];
  const covers = (a, b) => a[0] <= b[0] && a[1] >= b[1];
  const dow = (d) => new Date(MONTH.year, MONTH.month - 1, d).getDay();
  const slotOf = (fid, key) => { const f = FACILITIES.find((x) => x.id === fid); return f && f.slots.find((s) => s.key === key); };

  const P = { d: ['10:00-16:00', '09:00-13:30'], nc: ['night', '20:00-02:00'] };
  const R = (id, facilityIds, name, hourlyWage, transportType, transportAmount, pref, off, hireDate, cumDays) =>
    ({ id, facilityIds, name, hourlyWage, transportType, transportAmount, hireDate, cumDays, _pref: pref, _off: off });
  const STAFF = [
    R('s1', ['BHJ', 'MAHT'], '佐藤 美咲', 1250, 'per_shift', 480, ['morning', 'morning', 'evening', 'both'], 0.3, '2023-04-01', 520),
    R('s2', ['BHJ'], '鈴木 健太', 1300, 'monthly', 12000, ['night'], 0.45, '2022-09-01', 610),
    R('s3', ['BHJ', 'MAHT'], '高橋 由衣', 1150, 'per_shift', 1380, ['evening', 'evening', 'both', 'morning'], 0.35, '2026-03-01', 95),
    R('s4', ['BHJ'], '田中 翔', 1200, 'per_shift', 620, P.nc, 0.55, '2025-01-15', 180),
    R('s5', ['BHJ'], '伊藤 さくら', 1100, 'per_shift', 300, P.d, 0.5, '2026-07-01', 40),
    R('s6', ['BHJ', 'MAHB'], '渡辺 大輔', 1350, 'monthly', 15000, ['morning', 'evening'], 0.3, '2021-06-01', 900),
    R('s7', ['BHJ'], '山本 葵', 1150, 'per_shift', 1600, ['evening', 'evening', '16:00-21:00'], 0.35, '2023-11-01', 400),
    R('BHKK-1', ['BHKK'], '中村 優斗', 1250, 'per_shift', 520, ['morning'], 0.35, '2024-02-01', 300),
    R('BHKK-2', ['BHKK'], '小林 真由', 1150, 'per_shift', 340, ['evening', 'evening', '16:00-21:00'], 0.4, '2025-08-01', 150),
    R('BHKK-3', ['BHKK'], '加藤 拓海', 1300, 'monthly', 11000, ['night'], 0.45, '2022-04-01', 700),
    R('BHKK-4', ['BHKK'], '吉田 彩', 1100, 'per_shift', 280, P.d, 0.5, '2026-06-01', 35),
    R('BHKK-5', ['BHKK'], '山田 蓮', 1200, 'per_shift', 460, ['morning', 'evening'], 0.35, '2024-10-01', 260),
    R('MAHB-1', ['MAHB'], '佐々木 結衣', 1200, 'per_shift', 400, ['morning'], 0.35, '2023-07-01', 420),
    R('MAHB-2', ['MAHB'], '山口 陽太', 1300, 'monthly', 13000, P.nc, 0.5, '2022-11-01', 560),
    R('MAHB-3', ['MAHB'], '松本 美月', 1150, 'per_shift', 380, ['evening'], 0.35, '2025-05-01', 190),
    R('MAHB-4', ['MAHB', 'BHJ'], '井上 隼', 1250, 'per_shift', 1120, ['morning', 'evening'], 0.3, '2024-01-01', 330),
    R('MAHB-5', ['MAHB'], '木村 七海', 1100, 'per_shift', 300, P.d, 0.5, '2026-08-01', 20),
    R('MAHB-6', ['MAHB'], '林 健', 1350, 'monthly', 14000, ['night'], 0.45, '2021-03-01', 980),
    R('MAHT-1', ['MAHT', 'MAHB'], '清水 海斗', 1300, 'per_shift', 640, ['both', 'both', '10:00-15:00'], 0.4, '2024-05-01', 280),
    R('MAHT-2', ['MAHT'], '山崎 莉子', 1200, 'per_shift', 420, ['both'], 0.35, '2025-02-01', 200),
    R('MAHT-3', ['MAHT', 'BHJ'], '森 悠真', 1150, 'per_shift', 360, ['both', '12:00-18:00', 'evening'], 0.4, '2025-10-01', 120),
    R('MAHT-4', ['MAHT'], '池田 千尋', 1100, 'per_shift', 300, ['10:00-15:00', '12:00-18:00'], 0.5, '2026-04-01', 60),
    R('MAHNM-1', ['MAHNM'], '橋本 光', 1250, 'monthly', 12000, ['morning'], 0.35, '2023-01-01', 500),
    R('MAHNM-2', ['MAHNM'], '阿部 菜摘', 1150, 'per_shift', 340, ['evening'], 0.35, '2025-04-01', 210),
    R('MAHNM-3', ['MAHNM'], '石川 涼', 1300, 'per_shift', 700, P.nc, 0.45, '2022-12-01', 640),
    R('MAHNM-4', ['MAHNM'], '前田 真央', 1100, 'per_shift', 300, P.d, 0.5, '2026-05-01', 50),
    R('MAHNM-5', ['MAHNM'], '藤田 航', 1200, 'per_shift', 480, ['morning', 'evening'], 0.35, '2024-08-01', 270),
  ];
  const GAPS = { BHJ: ['14:night', '22:evening', '27:morning'], BHKK: ['5:night', '18:morning'], MAHB: [], MAHT: ['3:base', '12:base'], MAHNM: ['20:morning'] };

  let uid = 1;
  const id = (p) => `${p}_${uid++}`;

  function seed() {
    let r = 7;
    const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
    const requests = [];
    for (const st of STAFF) for (let d = 1; d <= MONTH.days; d++) {
      if (rnd() < st._off) { requests.push({ id: id('rq'), staffId: st.id, date: dateKey(d), type: 'off' }); continue; }
      const p = st._pref[Math.floor(rnd() * st._pref.length)];
      if (p.includes(':')) { const [start, end] = p.split('-'); requests.push({ id: id('rq'), staffId: st.id, date: dateKey(d), type: 'custom', start, end }); }
      else requests.push({ id: id('rq'), staffId: st.id, date: dateKey(d), type: p });
    }
    for (let i = requests.length - 1; i >= 0; i--) if (requests[i].staffId === 's3' && dayOf(requests[i].date) > 8) requests.splice(i, 1); // 未提出デモ：入力途中
    let shifts = [];
    const mk = (staffId, date, facilityId, kind, start, end, source) => {
      const sl = slotOf(facilityId, kind);
      return { id: id('sh'), facilityId, staffId, date, kind, start: sl ? sl.start : start, end: sl ? sl.end : end, source, status: 'confirmed' };
    };
    const fits = (sid, cand) => { const c = abs(cand);
      return !shifts.some((s) => { if (s.staffId !== sid) return false; const a = abs(s);
        return overlap(a, c) || (c[0] >= a[1] && c[0] - a[1] < INTERVAL_MIN) || (a[0] >= c[1] && a[0] - c[1] < INTERVAL_MIN); }); };
    const isOff = (sid, date) => requests.some((q) => q.staffId === sid && q.date === date && q.type === 'off');
    for (let d = 1; d <= MONTH.days; d++) for (const q of requests.filter((x) => x.date === dateKey(d) && x.type !== 'off')) {
      const st = STAFF.find((s) => s.id === q.staffId);
      let kind = q.type, fid = q.type === 'custom' ? st.facilityIds[0] : st.facilityIds.find((f) => slotOf(f, q.type));
      if (q.type === 'both') { fid = st.facilityIds[0]; const ks = ['morning', 'evening', 'base'].filter((k) => slotOf(fid, k)); kind = ks[Math.floor(rnd() * ks.length)]; }
      if (!fid || !kind) continue;
      const cand = mk(q.staffId, q.date, fid, kind, q.start, q.end, 'staff_request');
      if (fits(q.staffId, cand)) shifts.push(cand);
    }
    for (let d = 1; d <= MONTH.days; d++) for (const f of FACILITIES) for (const sl of f.slots) {
      if (GAPS[f.id].includes(`${d}:${sl.key}`)) continue;
      const dk = dateKey(d);
      if (shifts.some((s) => s.facilityId === f.id && s.date === dk && overlap(span(s), span(sl)))) continue;
      const mem = STAFF.filter((st) => st.facilityIds.includes(f.id) && !shifts.some((s) => s.staffId === st.id && s.date === dk));
      const ok = (st) => fits(st.id, mk(st.id, dk, f.id, sl.key, null, null, 'admin'));
      const pick = mem.find((st) => !isOff(st.id, dk) && ok(st)) || mem.find(ok);
      if (pick) shifts.push(mk(pick.id, dk, f.id, sl.key, null, null, 'admin'));
    }
    for (const f of FACILITIES) for (const g of GAPS[f.id]) {
      const [d, k] = g.split(':'), sl = slotOf(f.id, k);
      shifts = shifts.filter((s) => !(s.facilityId === f.id && dayOf(s.date) === +d && overlap(span(s), span(sl))));
    }
    const clear = (sid, d) => { shifts = shifts.filter((s) => !(s.staffId === sid && dayOf(s.date) === d)); };
    const put = (sid, d, fid, kind, start, end) => shifts.push(mk(sid, dateKey(d), fid, kind, start, end, 'admin'));
    clear('s2', 9); clear('s2', 10); put('s2', 9, 'BHJ', 'night'); put('s2', 10, 'BHJ', 'morning');            // インターバル0h
    clear('s1', 15); clear('s1', 16); put('s1', 15, 'BHJ', 'night'); put('s1', 16, 'MAHT', 'base');           // 施設をまたぐインターバル2h
    clear('MAHB-4', 20); put('MAHB-4', 20, 'MAHB', 'morning'); put('MAHB-4', 20, 'BHJ', 'custom', '08:00', '14:00'); // 重複
    const submissions = STAFF.map((s, i) => ({ staffId: s.id, month: MONTH.key,
      submittedAt: s.id === 's3' || s.id === 'MAHB-5' ? null : `2026-10-${pad(3 + (i % 10))}T21:14:00+09:00`,
      extendedUntil: s.id === 's3' ? '2026-10-25' : null }));
    const staff = STAFF.map(({ _pref, _off, ...s }) => ({ ...s }));
    const H = (at, actor, category, action, facilityId, staffId, date, before, after) => ({ id: id('h'), at: at + ':00+09:00', actor, category, action, facilityId, staffId, date, before, after });
    const history = [
      H('2026-10-03T21:14', '佐藤 美咲', 'request', '希望を提出', null, 's1', null, null, '11月分'),
      H('2026-10-08T09:30', '小川（管理者）', 'setting', '時給を変更', 'BHJ', 's6', null, '¥1,300', '¥1,350'),
      H('2026-10-12T22:41', '鈴木 健太', 'request', '希望を提出', null, 's2', null, null, '11月分'),
      H('2026-10-16T10:05', '山下（管理者）', 'setting', '提出期限を延長', 'BHJ', 's3', null, '10/15', '10/25'),
      H('2026-10-17T13:20', '小川（管理者）', 'setting', '最低人数を変更（この日のみ）', 'BHJ', null, '2026-11-21', '夕 1名', '夕 2名'),
      H('2026-10-18T15:02', '山下（管理者）', 'shift', 'シフトを変更', 'BHJ', 's2', '2026-11-10', '休', '朝 08:00–16:00'),
      H('2026-10-18T15:04', '山下（管理者）', 'shift', 'シフトを変更', 'BHJ', 's1', '2026-11-15', '朝 08:00–16:00', '夜 22:00–翌08:00'),
      H('2026-10-18T15:09', '山下（管理者）', 'shift', 'シフトを配置', 'MAHT', 's1', '2026-11-16', null, '基本 10:00–18:00'),
      H('2026-10-19T11:30', '小川（管理者）', 'shift', 'シフトを配置', 'BHJ', 'MAHB-4', '2026-11-20', null, '時間 08:00–14:00'),
      H('2026-10-19T18:00', '小川（管理者）', 'confirm', '確定して公開', 'BHJ', null, null, null, '未確定 12件を確定 · 6名に通知'),
      H('2026-10-19T18:03', '小川（管理者）', 'confirm', '確定して公開', 'MAHT', null, null, null, '未確定 7件を確定 · 4名に通知'),
    ];
    return { history, facilities: JSON.parse(JSON.stringify(FACILITIES)), staff, requests, submissions, shifts,
      minOverrides: { 'BHJ|2026-11-21|evening': 2 }, settings: { breakDeduction: true, nightPremium: true, nightPremiumRate: 0.25 } };
  }

  /** 施設で絞り込んだビュー（facilityId=null で全体）。兼任者は所属する全施設に含まれる */
  function scope(db, facilityId) {
    if (!facilityId) return db;
    const staff = db.staff.filter((s) => s.facilityIds.includes(facilityId)), ids = new Set(staff.map((s) => s.id));
    return { ...db, staff, shifts: db.shifts.filter((s) => s.facilityId === facilityId), requests: db.requests.filter((r) => ids.has(r.staffId)), submissions: db.submissions.filter((r) => ids.has(r.staffId)) };
  }

  /** 施設をまたいだチェック：同じ時間の重複／勤務間インターバル8時間未満。{ [shiftId]: {type, msg} } */
  function violations(db) {
    const out = {}, by = {};
    db.shifts.forEach((s) => (by[s.staffId] = by[s.staffId] || []).push(s));
    const desc = (s) => `${s.facilityId} ${dayOf(s.date)}日 ${s.start}–${toMin(s.end) <= toMin(s.start) ? '翌' : ''}${s.end}`;
    for (const list of Object.values(by)) {
      list.sort((a, b) => abs(a)[0] - abs(b)[0]);
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const A = list[i], B = list[j], a = abs(A), b = abs(B);
        if (b[0] - a[1] >= INTERVAL_MIN) break;
        if (overlap(a, b)) {
          out[A.id] = { type: 'overlap', msg: `重複：${desc(B)} と時間が重なっています` };
          out[B.id] = { type: 'overlap', msg: `重複：${desc(A)} と時間が重なっています` };
        } else {
          const g = b[0] - a[1], m = `インターバル ${Math.floor(g / 60)}時間${g % 60 ? (g % 60) + '分' : ''}：${desc(A)} → ${desc(B)}（8時間以上必要）`;
          if (!out[A.id]) out[A.id] = { type: 'interval', msg: m };
          if (!out[B.id]) out[B.id] = { type: 'interval', msg: m };
        }
      }
    }
    return out;
  }
  /** 配置前のプレビュー用。cand={start,end} */
  function checkCandidate(db, staffId, date, facilityId, cand) {
    if (!cand) return '';
    const tmp = { id: '__cand', staffId, date, facilityId, start: cand.start, end: cand.end };
    const v = violations({ shifts: db.shifts.filter((s) => s.staffId === staffId && !(s.date === date && s.facilityId === facilityId)).concat(tmp) });
    return v.__cand ? v.__cand.msg + '。保存はできます。' : '';
  }
  const minFor = (db, fid, date, key) => {
    const o = (db.minOverrides || {})[`${fid}|${date}|${key}`];
    if (o != null) return o;
    const f = db.facilities.find((x) => x.id === fid), s = f && f.slots.find((x) => x.key === key);
    return s ? s.min : 1;
  };
  const deadlineFor = (db, staffId) => { const s = db.submissions.find((x) => x.staffId === staffId); return (s && s.extendedUntil) || DEADLINE; };

  /** 交通費上限：〜6か月目 1,000円／7か月目〜 1,200円／勤続18か月以上かつ累計216日以上 1,500円 */
  function transportCap(staff) {
    const [hy, hm] = staff.hireDate.split('-').map(Number);
    const monthIdx = MONTH.year * 12 + MONTH.month - (hy * 12 + hm) + 1;
    const cum = staff.cumDays;
    const cap = monthIdx - 1 >= 18 && cum >= 216 ? 1500 : monthIdx >= 7 ? 1200 : 1000;
    return { monthIdx, cum, cap };
  }

  /** 給与計算。shifts は全施設分を渡す（兼任先の勤務も含めて主な所属施設に計上）
   *  休憩：夜勤（日をまたぐ8時間以上）3時間／8時間以上60分／6時間以上45分。深夜：22:00-05:00 */
  function payroll(staff, shifts, settings) {
    const mine = shifts.filter((s) => s.staffId === staff.id);
    const days = new Set(mine.map((s) => s.date)).size;
    let workMin = 0, nightMin = 0;
    for (const s of mine) {
      const [a, b] = span(s), dur = b - a;
      const brk = !settings.breakDeduction ? 0 : b > 1440 && dur >= 480 ? 180 : dur >= 480 ? 60 : dur >= 360 ? 45 : 0;
      workMin += dur - brk;
      if (settings.nightPremium) for (const w of [[0, 300], [1320, 1740], [2760, 3180]]) nightMin += Math.max(0, Math.min(b, w[1]) - Math.max(a, w[0]));
    }
    const tc = transportCap(staff);
    const pay = Math.round((staff.hourlyWage * workMin) / 60 + (staff.hourlyWage * settings.nightPremiumRate * nightMin) / 60);
    const transport = staff.transportType === 'per_shift' ? Math.min(staff.transportAmount, tc.cap) * days : days > 0 ? staff.transportAmount : 0;
    return { days, workMin, nightMin, pay, transport, total: pay + transport, cap: tc };
  }

  let db = null;
  let actor = '山下（管理者）';
  const desc = (s) => (s ? `${LABEL[s.kind] || '時間'} ${s.start}–${toMin(s.end) <= toMin(s.start) ? '翌' : ''}${s.end}` : '休');
  const nowIso = () => new Date().toISOString();
  const log = (e) => { db.history = [{ id: id('h'), at: nowIso(), actor, facilityId: null, staffId: null, date: null, before: null, after: null, ...e }, ...db.history]; };
  const md = (iso) => iso ? `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}` : '—';
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const listeners = new Set();
  const emit = () => { const snap = clone(db); listeners.forEach((fn) => fn(clone(snap))); return snap; };
  const repo = {
    /** Supabase では realtime チャンネルの購読に置き換え */
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async load() { if (!db) db = seed(); return clone(db); },
    /** 操作する人。Supabase ではログイン中のユーザー（auth.uid）から自動で決まる */
    setActor(name) { actor = name; },
    async saveRequests(staffId, list, submit) {
      const st = db.staff.find((s) => s.id === staffId);
      if (submit) log({ actor: st ? st.name : actor, category: 'request', action: '希望を提出', staffId, after: '11月分 · ' + list.length + '日' });
      db.requests = db.requests.filter((r) => r.staffId !== staffId).concat(list.map((r) => ({ id: r.id || id('rq'), ...r, staffId })));
      if (submit) db.submissions = db.submissions.map((s) => (s.staffId === staffId ? { ...s, submittedAt: new Date().toISOString() } : s));
      return emit();
    },
    /** 施設・スタッフ・日付で1件。shift=null で削除 */
    async setShift(staffId, date, facilityId, shift) {
      const prev = db.shifts.find((s) => s.staffId === staffId && s.date === date && s.facilityId === facilityId);
      const b = prev ? desc(prev) : null, a = shift ? desc(shift) : null;
      if (b !== a) log({ category: 'shift', action: !prev ? 'シフトを配置' : !shift ? 'シフトを外す' : 'シフトを変更', facilityId, staffId, date, before: b, after: a || '休' });
      db.shifts = db.shifts.filter((s) => !(s.staffId === staffId && s.date === date && s.facilityId === facilityId));
      if (shift) db.shifts.push({ id: id('sh'), ...shift, facilityId, staffId, date });
      return emit();
    },
    /** facilityId=null で全施設。変更のあったスタッフにメール通知（モックでは件数のみ） */
    async confirmAll(facilityId) {
      const tgt = db.shifts.filter((s) => s.status === 'draft' && (!facilityId || s.facilityId === facilityId));
      const notified = new Set(tgt.map((s) => s.staffId)).size;
      const facs = facilityId ? [facilityId] : [...new Set(tgt.map((s) => s.facilityId))];
      facs.forEach((f) => { const t = tgt.filter((s) => s.facilityId === f);
        log({ category: 'confirm', action: '確定して公開', facilityId: f, after: `未確定 ${t.length}件を確定 · ${new Set(t.map((s) => s.staffId)).size}名に通知` }); });
      db.shifts = db.shifts.map((s) => (!facilityId || s.facilityId === facilityId ? { ...s, status: 'confirmed' } : s));
      emit();
      return { notified };
    },
    async setSlotMin(facilityId, key, min) {
      const f0 = db.facilities.find((f) => f.id === facilityId), s0 = f0.slots.find((s) => s.key === key);
      log({ category: 'setting', action: '最低人数を変更（標準）', facilityId, before: `${s0.label} ${s0.min}名`, after: `${s0.label} ${min}名` });
      db.facilities = db.facilities.map((f) => (f.id !== facilityId ? f : { ...f, slots: f.slots.map((s) => (s.key === key ? { ...s, min } : s)) }));
      return emit();
    },
    /** 特定の日だけ最低人数を変える。min=null で標準に戻す */
    async setDayMin(facilityId, date, key, min) {
      const k = `${facilityId}|${date}|${key}`;
      const sl = FACILITIES.find((f) => f.id === facilityId).slots.find((s) => s.key === key), base = db.facilities.find((f) => f.id === facilityId).slots.find((s) => s.key === key).min;
      const cur = db.minOverrides[k] != null ? db.minOverrides[k] : base;
      log({ category: 'setting', action: '最低人数を変更（この日のみ）', facilityId, date, before: `${sl.label} ${cur}名`, after: `${sl.label} ${min == null ? base : min}名${min == null ? '（標準に戻す）' : ''}` });
      db.minOverrides = { ...db.minOverrides };
      if (min == null) delete db.minOverrides[k]; else db.minOverrides[k] = min;
      return emit();
    },
    async extendDeadline(staffId, until) {
      const st = db.staff.find((s) => s.id === staffId), sub = db.submissions.find((s) => s.staffId === staffId);
      log({ category: 'setting', action: until ? '提出期限を延長' : '期限の延長を取り消す', facilityId: st.facilityIds[0], staffId, before: md(sub.extendedUntil || DEADLINE), after: md(until || DEADLINE) });
      db.submissions = db.submissions.map((s) => (s.staffId === staffId ? { ...s, extendedUntil: until } : s)); return emit(); },
    async updateStaff(staffId, patch) {
      const st = db.staff.find((s) => s.id === staffId), yen = (n) => '¥' + Number(n).toLocaleString('ja-JP');
      const TT = { per_shift: '1出勤ごと', monthly: '月額' };
      if (patch.hourlyWage != null && patch.hourlyWage !== st.hourlyWage) log({ category: 'setting', action: '時給を変更', facilityId: st.facilityIds[0], staffId, before: yen(st.hourlyWage), after: yen(patch.hourlyWage) });
      if (patch.transportAmount != null && patch.transportAmount !== st.transportAmount) log({ category: 'setting', action: '交通費を変更', facilityId: st.facilityIds[0], staffId, before: yen(st.transportAmount), after: yen(patch.transportAmount) });
      if (patch.transportType && patch.transportType !== st.transportType) log({ category: 'setting', action: '交通費の種別を変更', facilityId: st.facilityIds[0], staffId, before: TT[st.transportType], after: TT[patch.transportType] });
      db.staff = db.staff.map((s) => (s.id === staffId ? { ...s, ...patch } : s)); return emit(); },
    async updateSettings(patch) {
      const N = { breakDeduction: '休憩時間の差し引き', nightPremium: '深夜割増' };
      Object.keys(patch).forEach((k) => { if (N[k] && patch[k] !== db.settings[k]) log({ category: 'setting', action: N[k] + 'を変更', before: db.settings[k] ? 'あり' : 'なし', after: patch[k] ? 'あり' : 'なし' }); });
      db.settings = { ...db.settings, ...patch }; return emit(); },
    async generateAiDraft() { throw new Error('近日公開'); },
  };

  window.ShiftData = { MONTH, TODAY, DEADLINE, LABEL, FACILITIES, repo, payroll, scope, violations, checkCandidate, minFor, deadlineFor, transportCap, slotOf,
    util: { pad, dateKey, dayOf, toMin, fromMin, span, abs, overlap, covers, dow } };
})();
