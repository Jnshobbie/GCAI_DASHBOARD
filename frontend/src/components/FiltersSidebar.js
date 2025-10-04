import React from "react";

export default function FiltersSidebar({
  threatTypes = [],
  locations = [],
  emergencyLevels = [],
  maturityLevels = [],
  value,
  onChange,
  availableDates = [],
  dateFilter,
  onDateChange,
}) {
  function handle(field, val) {
    onChange({ ...value, [field]: val });
  }

  const regionOptions = Array.isArray(locations)
    ? locations.filter((l) => l.scope === "Region")
    : [];
  const countryOptions = Array.isArray(locations)
    ? locations.filter((l) => l.scope === "Country")
    : [];

  return (
    <aside className="w-72 shrink-0 bg-gray-800 rounded-lg p-4 space-y-4">
      {/* Threat Type */}
      <div>
        <h3 className="text-sm uppercase tracking-wider text-gray-400 mb-2">
          Threat Type
        </h3>
        <select
          className="w-full bg-gray-700 p-2 rounded"
          value={value.threatType}
          onChange={(e) => handle("threatType", e.target.value)}
        >
          <option value="">All</option>
          {Array.isArray(threatTypes) &&
            threatTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
        </select>
      </div>

      {/* Date Filter */}
      <div>
        <h3 className="text-sm uppercase tracking-wider text-gray-400 mb-2">
          Date
        </h3>
        <select
          className="w-full bg-gray-700 p-2 rounded"
          value={dateFilter}
          onChange={(e) => onDateChange(e.target.value)}
        >
          <option value="">All Dates</option>
          {Array.isArray(availableDates) &&
            availableDates.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
        </select>
      </div>

      {/* Location */}
      <div>
        <h3 className="text-sm uppercase tracking-wider text-gray-400 mb-2">
          Location Scope
        </h3>
        <select
          className="w-full bg-gray-700 p-2 rounded mb-2"
          value={value.locationScope}
          onChange={(e) => handle("locationScope", e.target.value)}
        >
          <option value="">Any</option>
          <option value="Global">Global</option>
          <option value="Region">Region</option>
          <option value="Country">Country</option>
        </select>

        {value.locationScope === "Region" && (
          <select
            className="w-full bg-gray-700 p-2 rounded"
            value={value.locationName}
            onChange={(e) => handle("locationName", e.target.value)}
          >
            <option value="">Any Region</option>
            {Array.isArray(regionOptions) &&
              regionOptions.map((r) => (
                <option key={r.name} value={r.name}>
                  {r.name}
                </option>
              ))}
          </select>
        )}

        {value.locationScope === "Country" && (
          <select
            className="w-full bg-gray-700 p-2 rounded"
            value={value.locationName}
            onChange={(e) => handle("locationName", e.target.value)}
          >
            <option value="">Any Country</option>
            {Array.isArray(countryOptions) &&
              countryOptions.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
          </select>
        )}
      </div>

      {/* Emergency */}
      <div>
        <h3 className="text-sm uppercase tracking-wider text-gray-400 mb-2">
          Emergency
        </h3>
        <select
          className="w-full bg-gray-700 p-2 rounded"
          value={value.emergency}
          onChange={(e) => handle("emergency", e.target.value)}
        >
          <option value="">Any</option>
          {Array.isArray(emergencyLevels) &&
            emergencyLevels.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
        </select>
      </div>

      {/* Maturity */}
      <div>
        <h3 className="text-sm uppercase tracking-wider text-gray-400 mb-2">
          Maturity
        </h3>
        <select
          className="w-full bg-gray-700 p-2 rounded"
          value={value.maturity}
          onChange={(e) => handle("maturity", e.target.value)}
        >
          <option value="">Any</option>
          {Array.isArray(maturityLevels) &&
            maturityLevels.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
        </select>
      </div>

      <button
        className="w-full bg-gray-600 hover:bg-gray-500 transition px-3 py-2 rounded"
        onClick={() => {
          onChange({
            threatType: "",
            locationScope: "",
            locationName: "",
            emergency: "",
            maturity: "",
          });
          onDateChange("");
        }}
      >
        Clear Filters
      </button>
    </aside>
  );
}
