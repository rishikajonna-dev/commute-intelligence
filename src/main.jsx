import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

const routes = [
  {
    id: "vanasthalipuram-madhapur",
    name: "Vanasthalipuram → Madhapur",
    start: { lng: 78.5746, lat: 17.3254 },
    end: { lng: 78.3915, lat: 17.4483 },
    baseline: 60,
    usualDeparture: "7:00am",
    shiftStart: "8:00am",
  },
  {
    id: "miyapur-gachibowli",
    name: "Miyapur → Gachibowli",
    start: { lng: 78.3496, lat: 17.4956 },
    end: { lng: 78.3489, lat: 17.4401 },
    baseline: 38,
    usualDeparture: "7:50am",
    shiftStart: "8:30am",
  },
  {
    id: "lb-nagar-secunderabad",
    name: "LB Nagar → Secunderabad",
    start: { lng: 78.5518, lat: 17.3469 },
    end: { lng: 78.4983, lat: 17.4399 },
    baseline: 39,
    usualDeparture: "7:05am",
    shiftStart: "7:45am",
  },
];

const scorecardRows = [
  ["Vanasthalipuram → Madhapur", "High", "+32 min"],
  ["Miyapur → Gachibowli", "Elevated", "+14 min"],
  ["LB Nagar → Secunderabad", "Normal", "+6 min"],
];

const navItems = ["Dashboard", "Routes", "Alerts", "Settings"];

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
  { id: "rainy-friday", label: "🌧 Rainy Friday" },
  { id: "month-end", label: "📅 Month-end Rush" },
];

function formatToday(date = new Date()) {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatTomorrow(date = new Date()) {
  const tomorrow = new Date(date);
  tomorrow.setDate(date.getDate() + 1);
  return formatToday(tomorrow);
}

function tomorrowDateKey(date = new Date()) {
  const tomorrow = new Date(date);
  tomorrow.setDate(date.getDate() + 1);
  const year = tomorrow.getFullYear();
  const month = String(tomorrow.getMonth() + 1).padStart(2, "0");
  const day = String(tomorrow.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseClockToMinutes(time) {
  const match = time.match(/^(\d{1,2}):(\d{2})(am|pm)$/i);
  if (!match) return 0;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridian = match[3].toLowerCase();

  if (meridian === "pm" && hours !== 12) hours += 12;
  if (meridian === "am" && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

function formatMinutesAsClock(totalMinutes) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours24 = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const meridian = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;

  return `${hours12}:${String(minutes).padStart(2, "0")} ${meridian}`;
}

function roundToNearestFive(minutes) {
  return Math.round(minutes / 5) * 5;
}

function getRecommendedDepartureMinutes(selectedShiftStart, predictedMinutes) {
  return roundToNearestFive(parseClockToMinutes(selectedShiftStart) - predictedMinutes - 10);
}

function getRecommendedDeparture(selectedShiftStart, predictedMinutes) {
  return formatMinutesAsClock(getRecommendedDepartureMinutes(selectedShiftStart, predictedMinutes));
}

async function readErrorDetails(response) {
  let body = "";

  try {
    body = await response.text();
  } catch (error) {
    body = `Unable to read response body: ${error.message}`;
  }

  return {
    status: response.status,
    statusText: response.statusText,
    body,
  };
}

function logApiError(apiName, context, error) {
  console.error(`${apiName} API error`, {
    context,
    status: error.status,
    responseBody: error.body,
    error,
  });
}

async function fetchRouteEta(route) {
  const key = process.env.REACT_APP_ORS_KEY;

  if (!key) {
    throw {
      status: "missing-key",
      body: "REACT_APP_ORS_KEY is not configured",
      message: "Missing OpenRouteService API key",
    };
  }

  const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${key}&start=${route.start.lng},${route.start.lat}&end=${route.end.lng},${route.end.lat}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw await readErrorDetails(response);
  }

  const payload = await response.json();
  const durationSeconds = payload?.features?.[0]?.properties?.summary?.duration;

  if (!Number.isFinite(durationSeconds)) {
    throw {
      status: "invalid-response",
      body: JSON.stringify(payload),
      message: "No duration field found in OpenRouteService response",
    };
  }

  return Math.round((durationSeconds / 60) * 1.6);
}

async function fetchRainProbability() {
  const key = process.env.REACT_APP_OWM_KEY;

  if (!key) {
    throw {
      status: "missing-key",
      body: "REACT_APP_OWM_KEY is not configured",
      message: "Missing OpenWeatherMap API key",
    };
  }

  const url = `https://api.openweathermap.org/data/2.5/forecast?q=Hyderabad,IN&appid=${key}&units=metric`;
  const response = await fetch(url);

  if (!response.ok) {
    throw await readErrorDetails(response);
  }

  const payload = await response.json();
  const dateKey = tomorrowDateKey();
  const morningForecasts = (payload.list || []).filter((entry) => {
    const dtText = entry.dt_txt || "";
    const hour = Number(dtText.slice(11, 13));
    return dtText.includes(dateKey) && hour >= 6 && hour <= 9;
  });

  if (morningForecasts.length === 0) return 0;

  const totalPop = morningForecasts.reduce((sum, entry) => sum + Number(entry.pop || 0), 0);
  return totalPop / morningForecasts.length;
}

function scoreRoute(
  route,
  predictedMinutes,
  rainProbability,
  trafficUnavailable,
  weatherUnavailable,
  selectedShiftStart,
  scenarioFlags = {},
) {
  let score = 0;
  const signals = [];
  const isEveningShift = selectedShiftStart === "5:00pm" || selectedShiftStart === "6:00pm";
  const isNightShift = selectedShiftStart === "10:00pm";
  const isFridayPattern = scenarioFlags.forceFriday || new Date().getDay() === 4;
  const isMonthEnd = scenarioFlags.forceMonthEnd || new Date().getDate() >= 25 || new Date().getDate() <= 2;

  if (!isNightShift && !trafficUnavailable && predictedMinutes > route.baseline * 1.3) {
    score += 30;
    signals.push("Traffic above normal");
  }

  if (!weatherUnavailable && rainProbability > 0.6) {
    score += 25;
    signals.push("Rain forecast tomorrow");
  }

  if (!isEveningShift && !isNightShift && isFridayPattern) {
    score += 15;
    signals.push("Friday pattern");
  }

  if (isEveningShift) {
    score += 15;
    signals.push("Evening peak hours +15");
  }

  if (!isNightShift && isMonthEnd) {
    score += 10;
    signals.push("Month-end traffic");
  }

  if (trafficUnavailable) {
    signals.push("Traffic data unavailable");
  }

  const riskLevel = score <= 35 ? "Normal" : score <= 65 ? "Elevated" : "High";
  return { signals, riskLevel };
}

function getScenarioRouteState(routeState, scenario) {
  if (scenario === "rainy-friday") {
    return {
      ...routeState,
      loading: false,
      predictedMinutes: Math.round(routeState.route.baseline * 1.5),
      trafficUnavailable: false,
    };
  }

  if (scenario === "month-end") {
    return {
      ...routeState,
      loading: false,
      predictedMinutes: Math.round(routeState.route.baseline * 1.45),
      trafficUnavailable: false,
    };
  }

  return routeState;
}

function getScenarioRainProbability(rainProbability, scenario) {
  return scenario === "rainy-friday" ? 0.85 : rainProbability;
}

function getScenarioFlags(scenario) {
  return {
    forceFriday: scenario === "rainy-friday",
    forceMonthEnd: scenario === "month-end",
  };
}

function badgeClass(riskLevel) {
  if (riskLevel === "High") return "bg-red-50 text-[#dc2626]";
  if (riskLevel === "Elevated") return "bg-amber-50 text-[#d97706]";
  return "bg-green-50 text-[#16a34a]";
}

function riskTextClass(riskLevel) {
  if (riskLevel === "High") return "text-[#dc2626]";
  if (riskLevel === "Elevated") return "text-[#d97706]";
  return "text-[#16a34a]";
}

function riskAccentClass(riskLevel) {
  if (riskLevel === "High") return "border-l-[#dc2626]";
  if (riskLevel === "Elevated") return "border-l-[#d97706]";
  return "border-l-[#16a34a]";
}

function predictedTextClass(ratio) {
  if (ratio >= 1.3) return "text-[#dc2626]";
  if (ratio > 1) return "text-[#d97706]";
  return "text-gray-400";
}

function riskDotClass(riskLevel) {
  if (riskLevel === "High") return "bg-[#dc2626]";
  if (riskLevel === "Elevated") return "bg-[#d97706]";
  return "bg-[#16a34a]";
}

function App() {
  const [routeStates, setRouteStates] = useState(() =>
    routes.map((route) => ({
      route,
      loading: true,
      predictedMinutes: null,
      trafficUnavailable: false,
    })),
  );
  const [rainProbability, setRainProbability] = useState(0);
  const [trafficFailed, setTrafficFailed] = useState(false);
  const [weatherFailed, setWeatherFailed] = useState(false);
  const [selectedShiftStart, setSelectedShiftStart] = useState("8:00am");
  const [selectedScenario, setSelectedScenario] = useState("live");

  useEffect(() => {
    let active = true;

    async function loadDashboardData() {
      fetchRainProbability()
        .then((probability) => {
          if (active) setRainProbability(probability);
        })
        .catch((error) => {
          logApiError("OpenWeatherMap", "Hyderabad forecast", error);
          if (!active) return;
          setWeatherFailed(true);
          setRainProbability(0);
        });

      const results = await Promise.all(
        routes.map(async (route) => {
          try {
            const predictedMinutes = await fetchRouteEta(route);
            return { route, loading: false, predictedMinutes, trafficUnavailable: false };
          } catch (error) {
            logApiError("OpenRouteService", route.name, error);
            if (active) setTrafficFailed(true);
            return { route, loading: false, predictedMinutes: null, trafficUnavailable: true };
          }
        }),
      );

      if (active) setRouteStates(results);
    }

    loadDashboardData();

    return () => {
      active = false;
    };
  }, []);

  const todayLabel = useMemo(() => formatToday(), []);
  const tomorrowLabel = useMemo(() => formatTomorrow(), []);
  const effectiveRouteStates = useMemo(
    () => routeStates.map((routeState) => getScenarioRouteState(routeState, selectedScenario)),
    [routeStates, selectedScenario],
  );
  const effectiveRainProbability = getScenarioRainProbability(rainProbability, selectedScenario);
  const scenarioFlags = useMemo(() => getScenarioFlags(selectedScenario), [selectedScenario]);
  const routeSummaries = useMemo(
    () =>
      effectiveRouteStates
        .filter((routeState) => !routeState.loading)
        .map((routeState) => {
          const scoringMinutes = routeState.trafficUnavailable ? routeState.route.baseline : routeState.predictedMinutes;
          const { riskLevel } = scoreRoute(
            routeState.route,
            scoringMinutes,
            effectiveRainProbability,
            routeState.trafficUnavailable,
            weatherFailed,
            selectedShiftStart,
            scenarioFlags,
          );

          return {
            riskLevel,
            departureMinutes: getRecommendedDepartureMinutes(selectedShiftStart, scoringMinutes),
          };
        }),
    [effectiveRouteStates, effectiveRainProbability, scenarioFlags, selectedShiftStart, weatherFailed],
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] text-gray-900">
      <Sidebar />

      <main className="min-h-screen lg:pl-[240px]">
        <header className="border-b border-gray-100 bg-white px-5 py-5 sm:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-xl font-semibold text-gray-950">Dashboard</h1>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-medium text-gray-500">{todayLabel}</p>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-500">
                Shift Start:
                <select
                  value={selectedShiftStart}
                  onChange={(event) => setSelectedShiftStart(event.target.value)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm outline-none transition hover:border-gray-300 focus:border-[#6366f1] focus:ring-2 focus:ring-indigo-100"
                >
                  {shiftStartOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <span className="inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-[#16a34a]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#16a34a]" />
                Live Data
              </span>
            </div>
          </div>
        </header>

        <div className="px-5 py-6 sm:px-8 lg:py-8">
          <WarningBanners trafficFailed={trafficFailed} weatherFailed={weatherFailed} />
          <ScenarioSelector selectedScenario={selectedScenario} onSelectScenario={setSelectedScenario} />

          <section>
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-gray-800">Tomorrow&apos;s Route Risk</h2>
              <p className="mt-1 text-sm text-gray-400">{tomorrowLabel}</p>
            </div>

            <SummaryBar routeSummaries={routeSummaries} />

            <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
              {effectiveRouteStates.map((routeState) =>
                routeState.loading ? (
                  <RouteSkeleton key={routeState.route.id} />
                ) : (
                  <RouteCard
                    key={routeState.route.id}
                    routeState={routeState}
                    rainProbability={effectiveRainProbability}
                    weatherUnavailable={weatherFailed}
                    selectedShiftStart={selectedShiftStart}
                    scenarioFlags={scenarioFlags}
                  />
                ),
              )}
            </div>
          </section>

          <PerformanceTable />
        </div>
      </main>
    </div>
  );
}

function ScenarioSelector({ selectedScenario, onSelectScenario }) {
  const isDemoMode = selectedScenario !== "live";

  return (
    <div className="pb-5">
      <div className="flex flex-wrap gap-3 py-4">
        {scenarios.map((scenario) => {
          const active = scenario.id === selectedScenario;
          return (
            <button
              key={scenario.id}
              type="button"
              onClick={() => onSelectScenario(scenario.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                active ? "bg-indigo-600 text-white" : "border border-gray-200 bg-white text-gray-600 hover:border-gray-300"
              }`}
            >
              {scenario.label}
            </button>
          );
        })}
      </div>
      {isDemoMode && <p className="text-sm font-medium text-gray-400">Demo mode — simulated conditions</p>}
    </div>
  );
}

function SummaryBar({ routeSummaries }) {
  if (routeSummaries.length === 0) return null;

  const highCount = routeSummaries.filter((summary) => summary.riskLevel === "High").length;
  const elevatedCount = routeSummaries.filter((summary) => summary.riskLevel !== "Normal").length;

  if (highCount > 0) {
    return (
      <div className="flex w-full items-center gap-3 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm font-semibold text-[#991b1b]">
        <span>🚨</span>
        <span>{highCount} route(s) at high risk tomorrow · Immediate action needed</span>
      </div>
    );
  }

  if (elevatedCount > 0) {
    return (
      <div className="flex w-full items-center gap-3 rounded-xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-sm font-semibold text-[#92400e]">
        <span>⚠️</span>
        <span>{elevatedCount} route(s) need earlier dispatch tomorrow · Check recommendations below</span>
      </div>
    );
  }

  const earliestDeparture = Math.min(...routeSummaries.map((summary) => summary.departureMinutes));

  return (
    <div className="flex w-full items-center gap-3 rounded-xl border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 text-sm font-semibold text-[#15803d]">
      <span>✅</span>
      <span>All 3 routes clear for tomorrow · Earliest departure: {formatMinutesAsClock(earliestDeparture)}</span>
    </div>
  );
}

function Sidebar() {
  return (
    <aside className="w-full bg-[#0f172a] text-white lg:fixed lg:inset-y-0 lg:left-0 lg:w-[240px]">
      <div className="flex h-full flex-col">
        <div className="px-6 py-6">
          <p className="text-lg font-semibold leading-tight">⚡ Commute Intelligence</p>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible">
          {navItems.map((item) => {
            const active = item === "Dashboard";
            return (
              <a
                key={item}
                href="#"
                className={`whitespace-nowrap rounded-lg border-l-4 px-4 py-3 text-sm font-medium transition ${
                  active
                    ? "border-[#6366f1] bg-white/10 text-white"
                    : "border-transparent text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                {item}
              </a>
            );
          })}
        </nav>

        <p className="mt-auto hidden px-6 pb-6 text-xs font-medium text-slate-400 lg:block">POC v1.0 · Hyderabad</p>
      </div>
    </aside>
  );
}

function WarningBanners({ trafficFailed, weatherFailed }) {
  if (!trafficFailed && !weatherFailed) return null;

  return (
    <div className="mb-6 space-y-3">
      {trafficFailed && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
          ⚠️ Traffic API unavailable — travel times estimated from baseline data
        </div>
      )}
      {weatherFailed && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
          ⚠️ Weather API unavailable — rain signal not included in today&apos;s score
        </div>
      )}
    </div>
  );
}

function RouteSkeleton() {
  return (
    <div className="rounded-2xl border-l-4 border-l-gray-200 bg-white p-6 shadow-sm">
      <div className="animate-pulse space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="h-4 w-3/4 rounded bg-gray-100" />
          <div className="h-6 w-20 rounded-full bg-gray-200" />
        </div>
        <div className="h-8 w-56 rounded bg-gray-200" />
        <div className="h-3 w-44 rounded bg-gray-100" />
        <div className="flex gap-2">
          <div className="h-7 w-28 rounded-full bg-gray-100" />
          <div className="h-7 w-24 rounded-full bg-gray-100" />
        </div>
      </div>
    </div>
  );
}

function RouteCard({ routeState, rainProbability, weatherUnavailable, selectedShiftStart, scenarioFlags }) {
  const { route, predictedMinutes, trafficUnavailable } = routeState;
  const scoringMinutes = trafficUnavailable ? route.baseline : predictedMinutes;
  const { signals, riskLevel } = scoreRoute(
    route,
    scoringMinutes,
    rainProbability,
    trafficUnavailable,
    weatherUnavailable,
    selectedShiftStart,
    scenarioFlags,
  );
  const recommendedDeparture = getRecommendedDeparture(selectedShiftStart, scoringMinutes);
  const ratio = scoringMinutes / route.baseline;

  return (
    <article
      className={`rounded-2xl border-l-4 bg-white p-6 shadow-sm transition-shadow duration-200 hover:shadow-md ${riskAccentClass(riskLevel)}`}
    >
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-[13px] font-medium leading-snug text-gray-500">{route.name}</h3>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${badgeClass(riskLevel)}`}>
          {riskLevel}
        </span>
      </div>

      <div className="mt-5">
        <p className={`text-[28px] font-bold leading-tight ${riskTextClass(riskLevel)}`}>
          Leave by {recommendedDeparture} tomorrow
        </p>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium text-gray-400">
          <span className={trafficUnavailable ? "text-gray-400" : predictedTextClass(ratio)}>
            {trafficUnavailable ? "—" : scoringMinutes} min predicted
          </span>{" "}
          · {route.baseline} min usual
        </p>
      </div>

      {signals.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {signals.map((signal) => (
            <span key={signal} className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
              ⏱ {signal}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

function PerformanceTable() {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-gray-800">30-Day Route Performance</h2>

      <div className="mt-4 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 text-left text-sm">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
              <tr>
                <th className="px-5 py-3 font-semibold">Route</th>
                <th className="px-5 py-3 font-semibold">Risk Level</th>
                <th className="px-5 py-3 font-semibold">Avg Extra Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {scorecardRows.map(([route, risk, extraTime]) => (
                <tr key={route} className="transition hover:bg-gray-50">
                  <td className="px-5 py-4 font-medium text-gray-900">{route}</td>
                  <td className="px-5 py-4 text-gray-700">
                    <span className="inline-flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${riskDotClass(risk)}`} />
                      {risk}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-gray-700">{extraTime}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-sm text-gray-500">Historical data based on operator trip logs. Updates weekly.</p>
    </section>
  );
}

createRoot(document.getElementById("root")).render(<App />);
