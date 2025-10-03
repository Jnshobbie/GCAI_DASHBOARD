import React, { useMemo, useState, useEffect } from "react";
import axios from "axios";
import FiltersSidebar from "./components/FiltersSidebar";
import ThreatsTable from "./components/ThreatsTable";
import ChartsPanel from "./components/ChartsPanel";
import MiniMap from "./components/MiniMap";
import OsintCards from "./components/OsintCards";
import BottomSection from "./components/BottomSection";
import AnalysisPanel from "./components/AnalysisPanel";
import LoginPage from "./LoginPage";

function App() {
  const [loggedIn, setLoggedIn] = useState(false);

  // filters
  const [filters, setFilters] = useState({
    threatType: "",
    locationScope: "",
    locationName: "",
    emergency: "",
    maturity: "",
  });
  const [dateFilter, setDateFilter] = useState("");
  const [availableDates, setAvailableDates] = useState([]);

  // dynamic filter options from real backend data
  const [threatTypes, setThreatTypes] = useState([]);
  const [locations, setLocations] = useState([]);
  const [emergencyLevels, setEmergencyLevels] = useState([]);
  const [maturityLevels, setMaturityLevels] = useState([]);

  // data
  const [newsRows, setNewsRows] = useState([]);
  const [osintItems, setOsintItems] = useState([]);
  const [stats, setStats] = useState({});
  const [insights, setInsights] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);

  // pagination
  const [page, setPage] = useState(0);
  const pageSize = 15;

  useEffect(() => {
    if (!loggedIn) return;
    fetchAll();
    fetchDates();
    const id = setInterval(fetchAll, 60000);
    return () => clearInterval(id);
  }, [loggedIn]);

  async function fetchDates() {
    try {
      const res = await axios.get("/api/dates");
      setAvailableDates(res.data || []);
    } catch (e) {
      console.error("Failed to fetch dates", e);
    }
  }

  async function fetchAll(overrides = {}) {
    try {
      const params = new URLSearchParams();
      const merged = { ...filters, ...overrides };
      Object.entries(merged).forEach(([k, v]) => {
        if (v) params.append(k, v);
      });
      if (dateFilter) params.append("date", dateFilter);
      params.append("limit", pageSize);
      params.append("offset", page * pageSize);

      const [threatsRes, statsRes, insightsRes] = await Promise.all([
        axios.get(`/api/threats?${params.toString()}`),
        axios.get("/api/stats"),
        axios.get("/api/insights"),
      ]);

      const items = (threatsRes.data && threatsRes.data.items) || [];
      setNewsRows(items);
      setStats(statsRes.data || {});
      setInsights((insightsRes.data && insightsRes.data.insights) || "");

      // 🔑 Build filter options dynamically from live data
      const types = [...new Set(items.map((i) => i.threatType).filter(Boolean))];
      setThreatTypes(types);

      const locs = items
        .filter((i) => i.locationScope && i.locationName)
        .map((i) => ({ scope: i.locationScope, name: i.locationName }));
      setLocations(locs);

      const ems = [...new Set(items.map((i) => i.emergency).filter(Boolean))];
      setEmergencyLevels(ems);

      const mats = [...new Set(items.map((i) => i.maturity).filter(Boolean))];
      setMaturityLevels(mats);

      // OSINT cards
      const osint = items.slice(0, 9).map((i) => ({
        id: i.id,
        time: i.time,
        source: (i.sources && i.sources[0])
          ? new URL(i.sources[0]).hostname.replace("www.", "")
          : "",
        title: i.title,
      }));
      setOsintItems(osint);
    } catch (e) {
      console.error("Live fetch error", e);
    }
  }

  useEffect(() => {
    if (loggedIn) {
      const t = setTimeout(() => fetchAll(), 250);
      return () => clearTimeout(t);
    }
  }, [filters, dateFilter, page, loggedIn]);

  async function onItemClick(item) {
    setSelectedItem(item);
    setAnalysis(null);
    setAnalysisError(null);
    setAnalysisLoading(true);
    try {
      const res = await axios.get(`/api/analysis/${item.id}`)
      setAnalysis(res.data);
      setAnalysisError(null);
    } catch (e) {
      console.error("Analysis fetch failed", e);
      const msg =
        e?.response?.data?.error || e.message || "Failed to fetch analysis";
      setAnalysis(null);
      setAnalysisError(msg);
    }
    setAnalysisLoading(false);
  }

  const summaryText = useMemo(
    () => insights || "No insights available.",
    [insights]
  );

  const pathways = useMemo(() => {
    const set = new Set(newsRows.map((t) => t.threatType));
    const list = [];
    if (set.has("Armed Conflict"))
      list.push("Initiate ceasefire corridor talks via neutral mediators");
    if (set.has("Pandemic & Health"))
      list.push(
        "Scale surveillance, expand ICU surge capacity, pre-position PPE"
      );
    if (set.has("Climate Change"))
      list.push(
        "Activate drought relief and climate-resilient livelihoods support"
      );
    if (set.has("Economic Collapse"))
      list.push(
        "Stabilize currency via capital controls and essential imports facilitation"
      );
    if (!list.length)
      list.push("Maintain monitoring and readiness; no immediate action required.");
    return list;
  }, [newsRows]);

  if (!loggedIn) {
    return <LoginPage onLogin={() => setLoggedIn(true)} />;
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto bg-gray-900 rounded-xl shadow-lg p-6">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">🌍 GCAI Crisis Dashboard</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchAll()}
              className="bg-green-600 px-3 py-1 rounded"
            >
              🔄 Refresh Now
            </button>
            <div className="text-sm text-gray-400">
              Interactive demo · live data
            </div>
          </div>
        </header>

        <div className="flex gap-4">
          <FiltersSidebar
            threatTypes={threatTypes}
            locations={locations}
            emergencyLevels={emergencyLevels}
            maturityLevels={maturityLevels}
            value={filters}
            onChange={setFilters}
            availableDates={availableDates}
            dateFilter={dateFilter}
            onDateChange={setDateFilter}
          />

          <main className="flex-1 space-y-4">
            <ThreatsTable
              items={newsRows}
              onItemClick={onItemClick}
              page={page}
              setPage={setPage}
              hasMore={newsRows.length === pageSize}
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <ChartsPanel items={newsRows} />
              </div>
              <div className="md:col-span-1">
                <AnalysisPanel
                  analysis={analysis}
                  loading={analysisLoading}
                  error={analysisError}
                  items={newsRows}
                  selectedItem={selectedItem}
                />
              </div>
            </div>
            <MiniMap items={newsRows} />
            <OsintCards items={osintItems} />
            <BottomSection
              summary={summaryText}
              pathways={pathways}
              awareness={{
                awarenessIndex: 62,
                supportIndex: 54,
                participationRate: 12,
              }}
            />
          </main>
        </div>
      </div>
    </div>
  );
}

export default App;

