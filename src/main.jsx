import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

// ── Data ──────────────────────────────────────────────────────────────────────

const routes = [
  { id: "vanasthalipuram-madhapur", name: "Vanasthalipuram → Madhapur", start: { lng: 78.5746, lat: 17.3254 }, end: { lng: 78.3915, lat: 17.4483 }, baseline: 60, usualDeparture: "7:00am", shiftStart: "8:00am" },
  { id: "miyapur-gachibowli", name: "Miyapur → Gachibowli", start: { lng: 78.3496, lat: 17.4956 }, end: { lng: 78.3489, lat: 17.4401 }, baseline: 38, usualDeparture: "7:50am", shiftStart: "8:30am" },
  { id: "lb-nagar-secunderabad", name: "LB Nagar → Secunderabad", start: { lng: 78.5518, lat: 17.3469 }, end: { lng: 78.4983, lat: 17.4399 }, baseline: 39, usualDeparture: "7:05am", shiftStart: "7:45am" },
];

const scorecardRows = [
  ["Vanasthalipuram → Madhapur", "High", "+32 min"],
  ["Miyapur → Gachibowli", "Elevated", "+14 min"],
  ["LB Nagar → Secunderabad", "Normal", "+6 min"],
];

const navItems = [
  { label: "Dashboard", active: true },
  { label: "Routes", active: false },
  { label: "Alerts", active: false },
  { label: "Settings", active: false },
];

const shiftStartOptions = [
  { label: "7:00 AM", value: "7:00am" },
  { label: "8:00 AM", value: "8:00am" },
  { label: "9:00 AM", value: "9:00am" },
  { label: "5:00 PM", value: "5:00pm" },
  { label: "6:00 PM", value: "6:00pm" },
  { label: "10:00 PM", value: "10:00pm" },
];

const scenarios = [
  { id: "live", label: "Live Data" },
  { id: "rainy-friday", label: "Rainy Friday" },
  { id: "month-end", label: "Month-end Rush" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatToday(date = new Date()) {
  return new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
}
function formatTomorrow(date = new Date()) {
  const t = new Date(date); t.setDate(date.getDate() + 1); return formatToday(t);
}
function tomorrowDateKey(date = new Date()) {
  const t = new Date(date); t.setDate(date.getDate() + 1);
  return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`;
}
function parseClockToMinutes(time) {
  const m = time.match(/^(\d{1,2}):(\d{2})(am|pm)$/i); if (!m) return 0;
  let h = Number(m[1]); const min = Number(m[2]); const mer = m[3].toLowerCase();
  if (mer === "pm" && h !== 12) h += 12; if (mer === "am" && h === 12) h = 0;
  return h * 60 + min;
}
function formatMinutesAsClock(total) {
  const n = ((total % 1440) + 1440) % 1440;
  const h24 = Math.floor(n / 60); const min = n % 60;
  const mer = h24 >= 12 ? "PM" : "AM"; const h12 = h24 % 12 || 12;
  return `${h12}:${String(min).padStart(2,"0")} ${mer}`;
}
function roundToFive(m) { return Math.round(m / 5) * 5; }
function getRecMinutes(shiftStart, predicted) { return roundToFive(parseClockToMinutes(shiftStart) - predicted - 10); }
function getRecDeparture(shiftStart, predicted) { return formatMinutesAsClock(getRecMinutes(shiftStart, predicted)); }

async function readErr(res) {
  let body = ""; try { body = await res.text(); } catch(e) { body = e.message; }
  return { status: res.status, statusText: res.statusText, body };
}
function logErr(api, ctx, err) { console.error(`${api} API error`, { ctx, ...err }); }

async function fetchRouteEta(route) {
  const key = process.env.REACT_APP_ORS_KEY;
  if (!key) throw { status: "missing-key", body: "REACT_APP_ORS_KEY not set" };
  const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${key}&start=${route.start.lng},${route.start.lat}&end=${route.end.lng},${route.end.lat}`;
  const res = await fetch(url); if (!res.ok) throw await readErr(res);
  const data = await res.json();
  const sec = data?.features?.[0]?.properties?.summary?.duration;
  if (!Number.isFinite(sec)) throw { status: "invalid", body: JSON.stringify(data) };
  return Math.round((sec / 60) * 1.6);
}

async function fetchRainProbability() {
  const key = process.env.REACT_APP_OWM_KEY;
  if (!key) throw { status: "missing-key", body: "REACT_APP_OWM_KEY not set" };
  const url = `https://api.openweathermap.org/data/2.5/forecast?q=Hyderabad,IN&appid=${key}&units=metric`;
  const res = await fetch(url); if (!res.ok) throw await readErr(res);
  const data = await res.json();
  const dk = tomorrowDateKey();
  const forecasts = (data.list || []).filter(e => { const h = Number((e.dt_txt||"").slice(11,13)); return (e.dt_txt||"").includes(dk) && h >= 6 && h <= 9; });
  if (!forecasts.length) return 0;
  return forecasts.reduce((s,e) => s + Number(e.pop||0), 0) / forecasts.length;
}

function scoreRoute(route, predicted, rainProb, trafficOut, weatherOut, shiftStart, flags = {}) {
  let score = 0; const signals = [];
  const evening = shiftStart === "5:00pm" || shiftStart === "6:00pm";
  const night = shiftStart === "10:00pm";
  const friday = flags.forceFriday || new Date().getDay() === 4;
  const monthEnd = flags.forceMonthEnd || new Date().getDate() >= 25 || new Date().getDate() <= 2;
  if (!night && !trafficOut && predicted > route.baseline * 1.3) { score += 30; signals.push("Traffic above normal"); }
  if (!weatherOut && rainProb > 0.6) { score += 25; signals.push("Rain forecast"); }
  if (!evening && !night && friday) { score += 15; signals.push("Friday pattern"); }
  if (evening) { score += 15; signals.push("Evening peak hours"); }
  if (!night && monthEnd) { score += 10; signals.push("Month-end traffic"); }
  if (trafficOut) signals.push("Traffic data unavailable");
  return { signals, riskLevel: score <= 35 ? "Normal" : score <= 65 ? "Elevated" : "High" };
}

function applyScenario(rs, scenario) {
  if (scenario === "rainy-friday") return { ...rs, loading: false, predictedMinutes: Math.round(rs.route.baseline * 1.5), trafficUnavailable: false };
  if (scenario === "month-end") return { ...rs, loading: false, predictedMinutes: Math.round(rs.route.baseline * 1.45), trafficUnavailable: false };
  return rs;
}
function scenarioRain(rain, scenario) { return scenario === "rainy-friday" ? 0.85 : rain; }
function scenarioFlags(scenario) { return { forceFriday: scenario === "rainy-friday", forceMonthEnd: scenario === "month-end" }; }

// Risk only uses red/amber/green. Everything else is blue (#2563eb) or neutral.
function riskColor(level) {
  if (level === "High")     return { bar: "#ef4444", dot: "#ef4444", text: "#b91c1c", badge: "bg-red-50 text-red-700",     ring: "ring-red-200" };
  if (level === "Elevated") return { bar: "#f59e0b", dot: "#f59e0b", text: "#92400e", badge: "bg-amber-50 text-amber-700", ring: "ring-amber-200" };
  return                           { bar: "#10b981", dot: "#10b981", text: "#065f46", badge: "bg-emerald-50 text-emerald-700", ring: "ring-emerald-200" };
}

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  const [routeStates, setRouteStates] = useState(() => routes.map(r => ({ route: r, loading: true, predictedMinutes: null, trafficUnavailable: false })));
  const [rainProb, setRainProb] = useState(0);
  const [trafficFailed, setTrafficFailed] = useState(false);
  const [weatherFailed, setWeatherFailed] = useState(false);
  const [shiftStart, setShiftStart] = useState("8:00am");
  const [scenario, setScenario] = useState("live");

  useEffect(() => {
    let alive = true;
    fetchRainProbability().then(p => { if (alive) setRainProb(p); }).catch(e => { logErr("OWM","forecast",e); if (alive) { setWeatherFailed(true); setRainProb(0); } });
    Promise.all(routes.map(async r => {
      try { const m = await fetchRouteEta(r); return { route: r, loading: false, predictedMinutes: m, trafficUnavailable: false }; }
      catch(e) { logErr("ORS", r.name, e); if (alive) setTrafficFailed(true); return { route: r, loading: false, predictedMinutes: null, trafficUnavailable: true }; }
    })).then(results => { if (alive) setRouteStates(results); });
    return () => { alive = false; };
  }, []);

  const todayLabel     = useMemo(() => formatToday(), []);
  const tomorrowLabel  = useMemo(() => formatTomorrow(), []);
  const effStates      = useMemo(() => routeStates.map(rs => applyScenario(rs, scenario)), [routeStates, scenario]);
  const effRain        = scenarioRain(rainProb, scenario);
  const flags          = useMemo(() => scenarioFlags(scenario), [scenario]);

  const summaries = useMemo(() => effStates.filter(rs => !rs.loading).map(rs => {
    const mins = rs.trafficUnavailable ? rs.route.baseline : rs.predictedMinutes;
    const { riskLevel } = scoreRoute(rs.route, mins, effRain, rs.trafficUnavailable, weatherFailed, shiftStart, flags);
    return { riskLevel, depMins: getRecMinutes(shiftStart, mins) };
  }), [effStates, effRain, flags, shiftStart, weatherFailed]);

  return (
    <div className="min-h-screen bg-[#f0f2f5] text-gray-900" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Sidebar />
      <main className="min-h-screen lg:pl-[240px]">
        <Header todayLabel={todayLabel} shiftStart={shiftStart} setShiftStart={setShiftStart} />
        <div className="px-6 py-6 sm:px-8 lg:py-8">
          {(trafficFailed || weatherFailed) && <WarningBanners trafficFailed={trafficFailed} weatherFailed={weatherFailed} />}
          <ScenarioSelector scenario={scenario} setScenario={setScenario} />
          <SectionHeader label="Tomorrow's Route Risk" sub={tomorrowLabel} />
          <SummaryBar summaries={summaries} />
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {effStates.map(rs => rs.loading
              ? <RouteSkeleton key={rs.route.id} />
              : <RouteCard key={rs.route.id} rs={rs} rainProb={effRain} weatherOut={weatherFailed} shiftStart={shiftStart} flags={flags} />
            )}
          </div>
          <PerformanceTable />
        </div>
      </main>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar() {
  return (
    <aside className="w-full bg-[#0f172a] text-white lg:fixed lg:inset-y-0 lg:left-0 lg:w-[240px] lg:flex lg:flex-col">
      <div className="border-b border-white/10 px-6 py-5">
        <p className="text-[15px] font-bold tracking-tight text-white">Commute Intelligence</p>
        <p className="mt-0.5 text-[11px] text-slate-500 tracking-wide uppercase">Hyderabad Operations</p>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 py-3 lg:flex-col lg:overflow-visible">
        {navItems.map(({ label, active }) => (
          <a key={label} href="#" onClick={e => { if (!active) e.preventDefault(); }}
            className={`group flex items-center justify-between rounded-md px-3 py-2.5 text-[13px] font-medium transition-all ${
              active ? "bg-[#2563eb] text-white" : "text-slate-500 cursor-default"
            }`}>
            <span>{label}</span>
            {!active && <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-600">Soon</span>}
          </a>
        ))}
      </nav>
      <p className="mt-auto hidden px-6 pb-5 text-[11px] text-slate-600 lg:block">POC v1.0 · Hyderabad</p>
    </aside>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────

function Header({ todayLabel, shiftStart, setShiftStart }) {
  return (
    <header className="border-b border-gray-200 bg-white px-6 py-4 sm:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-[16px] font-semibold text-gray-900">Dashboard</h1>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[13px] text-gray-400">{todayLabel}</span>
          <label className="flex items-center gap-2 text-[13px] text-gray-500">
            Shift Start
            <select value={shiftStart} onChange={e => setShiftStart(e.target.value)}
              className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[13px] font-medium text-gray-700 outline-none transition hover:border-gray-300 focus:border-[#2563eb] focus:ring-2 focus:ring-blue-100">
              {shiftStartOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-semibold tracking-wide text-blue-700">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
            LIVE
          </span>
        </div>
      </div>
    </header>
  );
}

// ── Section Header ────────────────────────────────────────────────────────────

function SectionHeader({ label, sub }) {
  return (
    <div className="mb-4">
      <h2 className="text-[13px] font-semibold uppercase tracking-widest text-gray-400">{label}</h2>
      <p className="mt-0.5 text-[13px] text-gray-500">{sub}</p>
    </div>
  );
}

// ── Scenario Selector ─────────────────────────────────────────────────────────

function ScenarioSelector({ scenario, setScenario }) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap gap-2">
        {scenarios.map(s => (
          <button key={s.id} type="button" onClick={() => setScenario(s.id)}
            className={`rounded-md px-3.5 py-1.5 text-[13px] font-semibold transition-all ${
              s.id === scenario
                ? "bg-[#2563eb] text-white shadow-sm"
                : "border border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700"
            }`}>
            {s.label}
          </button>
        ))}
      </div>
      {scenario !== "live" && <p className="mt-2 text-[12px] text-gray-400">Demo mode — simulated conditions</p>}
    </div>
  );
}

// ── Summary Bar ───────────────────────────────────────────────────────────────

function SummaryBar({ summaries }) {
  if (!summaries.length) return null;
  const highCount = summaries.filter(s => s.riskLevel === "High").length;
  const elevCount = summaries.filter(s => s.riskLevel !== "Normal").length;
  const earliest  = Math.min(...summaries.map(s => s.depMins));

  let msg, cls;
  if (highCount > 0) {
    msg = `${highCount} route${highCount > 1 ? "s" : ""} at high risk tomorrow — check recommendations below`;
    cls = "border-l-4 border-red-400 bg-white text-red-700";
  } else if (elevCount > 0) {
    msg = `${elevCount} route${elevCount > 1 ? "s" : ""} need earlier dispatch tomorrow`;
    cls = "border-l-4 border-amber-400 bg-white text-amber-700";
  } else {
    msg = `All 3 routes clear for tomorrow · Earliest departure ${formatMinutesAsClock(earliest)}`;
    cls = "border-l-4 border-emerald-400 bg-white text-emerald-700";
  }

  return <div className={`mb-4 rounded-lg px-4 py-3 text-[13px] font-semibold shadow-sm ${cls}`}>{msg}</div>;
}

// ── Warning Banners ───────────────────────────────────────────────────────────

function WarningBanners({ trafficFailed, weatherFailed }) {
  return (
    <div className="mb-5 space-y-2">
      {trafficFailed && <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] font-medium text-amber-700">Traffic API unavailable — travel times estimated from baseline data</div>}
      {weatherFailed && <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] font-medium text-amber-700">Weather API unavailable — rain signal excluded from scoring</div>}
    </div>
  );
}

// ── Route Skeleton ────────────────────────────────────────────────────────────

function RouteSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="animate-pulse space-y-4">
        <div className="flex items-center justify-between"><div className="h-3 w-2/3 rounded bg-gray-100" /><div className="h-5 w-16 rounded bg-gray-100" /></div>
        <div className="h-6 w-40 rounded bg-gray-100" />
        <div className="h-3 w-28 rounded bg-gray-100" />
        <div className="flex gap-2"><div className="h-5 w-24 rounded bg-gray-100" /><div className="h-5 w-20 rounded bg-gray-100" /></div>
      </div>
    </div>
  );
}

// ── Route Card ────────────────────────────────────────────────────────────────

function RouteCard({ rs, rainProb, weatherOut, shiftStart, flags }) {
  const { route, predictedMinutes, trafficUnavailable } = rs;
  const mins = trafficUnavailable ? route.baseline : predictedMinutes;
  const { signals, riskLevel } = scoreRoute(route, mins, rainProb, trafficUnavailable, weatherOut, shiftStart, flags);
  const departure = getRecDeparture(shiftStart, mins);
  const rc = riskColor(riskLevel);
  const over = mins > route.baseline;

  return (
    <article className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow duration-150 hover:shadow-md">
      {/* thin colored top bar — risk only */}
      <div style={{ height: 3, background: rc.bar }} />
      <div className="p-5">
        {/* Route name + risk badge */}
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[13px] font-semibold leading-snug text-gray-700">{route.name}</h3>
          <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-bold ring-1 ${rc.badge} ${rc.ring}`}>
            {riskLevel.toUpperCase()}
          </span>
        </div>

        {/* Departure */}
        <div className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Depart by</p>
          <p className="mt-1 text-[24px] font-bold leading-none tracking-tight text-gray-900">{departure}</p>
          <p className="mt-1 text-[12px] text-gray-400">
            usual {route.usualDeparture.replace("am"," AM").replace("pm"," PM")}
          </p>
        </div>

        {/* Travel time */}
        <div className="mt-4 flex items-center gap-1.5 text-[12px]">
          <span className={over && !trafficUnavailable ? "font-semibold" : "text-gray-400"} style={over && !trafficUnavailable ? { color: rc.text } : {}}>
            {trafficUnavailable ? "—" : `${mins} min`}
          </span>
          {!trafficUnavailable && (
            <>
              <span className="text-gray-300">·</span>
              <span className="text-gray-400">{route.baseline} min usual</span>
              {over && <span className="font-semibold" style={{ color: rc.text }}>(+{mins - route.baseline} min)</span>}
            </>
          )}
        </div>

        {/* Signals — no emojis, plain text tags */}
        {signals.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {signals.map(sig => (
              <span key={sig} className="rounded bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-500">{sig}</span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

// ── Performance Table ─────────────────────────────────────────────────────────

function PerformanceTable() {
  return (
    <section className="mt-8">
      <SectionHeader label="30-Day Route Performance" sub="Based on operator trip logs · Updates weekly" />
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100 text-left text-[13px]">
          <thead className="bg-gray-50">
            <tr>
              {["Route","Risk (30d)","Avg Extra Time"].map(h => (
                <th key={h} className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {scorecardRows.map(([route, risk, extra]) => {
              const rc = riskColor(risk);
              return (
                <tr key={route} className="transition-colors hover:bg-gray-50">
                  <td className="px-5 py-3.5 font-medium text-gray-800">{route}</td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-2 text-gray-600">
                      <span className="h-2 w-2 rounded-full" style={{ background: rc.dot }} />
                      {risk}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 font-semibold text-gray-700">{extra}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

createRoot(document.getElementById("root")).render(<App />);