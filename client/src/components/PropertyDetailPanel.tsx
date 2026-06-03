import React, { useEffect, useState } from 'react';
import { X, ExternalLink, AlertTriangle, Droplets, Shield, MapPin, Zap, Home, ChevronDown, ChevronUp, Wrench } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface PropertyDetailPanelProps {
  propertyId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

const epcColors: Record<string, { bg: string; text: string; label: string }> = {
  A: { bg: 'bg-green-600', text: 'text-white', label: 'Very energy efficient' },
  B: { bg: 'bg-green-500', text: 'text-white', label: 'Energy efficient' },
  C: { bg: 'bg-lime-500', text: 'text-white', label: 'Fairly efficient' },
  D: { bg: 'bg-yellow-400', text: 'text-gray-900', label: 'Below average' },
  E: { bg: 'bg-orange-500', text: 'text-white', label: 'Inefficient' },
  F: { bg: 'bg-orange-600', text: 'text-white', label: 'Very inefficient' },
  G: { bg: 'bg-red-600', text: 'text-white', label: 'Least efficient' },
};

function Section({ title, icon, children, defaultOpen = true }: { title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">{title}</h4>
        </div>
        {open ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

function DataRow({ label, value, unit }: { label: string; value: any; unit?: string }) {
  const display = value != null && value !== '' ? `${value}${unit ? ` ${unit}` : ''}` : 'N/A';
  return (
    <div className="flex justify-between py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-gray-600 text-sm">{label}</span>
      <span className="font-medium text-gray-900 text-sm text-right max-w-[55%]">{display}</span>
    </div>
  );
}

function RiskBadge({ level, label }: { level: 'low' | 'medium' | 'high' | 'very-high' | 'unknown'; label: string }) {
  const colors = {
    low: 'bg-green-100 text-green-800',
    medium: 'bg-yellow-100 text-yellow-800',
    high: 'bg-orange-100 text-orange-800',
    'very-high': 'bg-red-100 text-red-800',
    unknown: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${colors[level]}`}>
      {label}
    </span>
  );
}

function getCrimeRiskLevel(score: number | null): { level: 'low' | 'medium' | 'high' | 'very-high' | 'unknown'; label: string } {
  if (score == null) return { level: 'unknown', label: 'No data' };
  if (score <= 2) return { level: 'low', label: 'Low risk' };
  if (score <= 5) return { level: 'medium', label: 'Medium risk' };
  if (score <= 8) return { level: 'high', label: 'High risk' };
  return { level: 'very-high', label: 'Very high risk' };
}

function getFloodRiskLevel(zone: string | null): { level: 'low' | 'medium' | 'high' | 'very-high' | 'unknown'; label: string } {
  if (!zone) return { level: 'unknown', label: 'No data' };
  if (zone === 'Zone 1') return { level: 'low', label: 'Zone 1 - Low' };
  if (zone === 'Zone 2') return { level: 'medium', label: 'Zone 2 - Medium' };
  if (zone === 'Zone 3') return { level: 'high', label: 'Zone 3 - High' };
  return { level: 'unknown', label: zone };
}

export default function PropertyDetailPanel({ propertyId, isOpen, onClose }: PropertyDetailPanelProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [operations, setOperations] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!propertyId || !isOpen) return;

    const fetchPropertyDetails = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/properties/${propertyId}`);
        if (!response.ok) throw new Error('Failed to fetch property details');
        const json = await response.json();
        // Flatten GeoJSON Feature: merge top-level fields with nested properties
        const flat = {
          id: json.id,
          latitude: json.geometry?.coordinates?.[1],
          longitude: json.geometry?.coordinates?.[0],
          ...json.properties,
        };
        setData(flat);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchPropertyDetails();
  }, [propertyId, isOpen]);

  // Lazy-load repairs & complaints data after property loads
  useEffect(() => {
    if (!propertyId || !isOpen) { setOperations(null); return; }
    fetch(`/api/analytics/property-operations/${propertyId}`)
      .then(r => r.json())
      .then(json => setOperations(json?.data || null))
      .catch(() => setOperations(null));
  }, [propertyId, isOpen]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const p = data;
  const epcRating = p?.epc_rating?.toUpperCase() || 'N/A';
  const epcStyle = epcColors[epcRating] || { bg: 'bg-gray-400', text: 'text-white', label: 'Unknown' };
  const isRetrofitCandidate = ['D', 'E', 'F', 'G'].includes(epcRating);
  const crimeRisk = getCrimeRiskLevel(p?.crime_risk_score);
  const floodRisk = getFloodRiskLevel(p?.flood_zone);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-40 z-30"
          onClick={handleBackdropClick}
        />
      )}

      <div
        className={`fixed right-0 top-0 h-full bg-white shadow-2xl overflow-y-auto z-40 transition-transform duration-300 ease-in-out w-full md:w-[440px]`}
        style={{ transform: isOpen ? 'translateX(0)' : 'translateX(100%)' }}
      >
        {/* Header */}
        <div className="sticky top-0 flex justify-between items-center p-4 bg-white border-b border-gray-200 z-10">
          <h2 className="text-lg font-semibold text-gray-900">Property Details</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors" aria-label="Close">
            <X size={24} className="text-gray-600" />
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center h-96">
            <div className="flex flex-col items-center gap-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              <p className="text-sm text-gray-600">Loading details...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="m-4 p-4 bg-red-50 rounded-lg border border-red-200">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {p && !loading && (
          <div className="p-4 space-y-4">
            {/* Address & EPC Header */}
            <div className="space-y-3">
              <div>
                <h3 className="text-xl font-bold text-gray-900">{p.address}</h3>
                <p className="text-sm text-gray-500">{p.postcode}</p>
                {p.uprn && <p className="text-xs text-gray-400 font-mono mt-1">UPRN: {p.uprn}</p>}
              </div>

              <div className="flex items-center gap-4">
                <div className={`flex items-center justify-center w-16 h-16 rounded-xl ${epcStyle.bg} ${epcStyle.text} font-bold text-2xl shadow-md`}>
                  {epcRating}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{epcStyle.label}</p>
                  {p.epc_score && <p className="text-xs text-gray-500">Score: {p.epc_score}</p>}
                  {p.epc_potential_rating && (
                    <p className="text-xs text-green-700 font-medium">
                      Potential: {p.epc_potential_rating} ({p.epc_potential_score})
                    </p>
                  )}
                </div>
              </div>

              {isRetrofitCandidate && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                  <AlertTriangle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-amber-900">Retrofit Candidate</p>
                    <p className="text-xs text-amber-700">This property could benefit from energy efficiency improvements.</p>
                  </div>
                </div>
              )}
            </div>

            {/* View Digital Twin Button */}
            <button
              onClick={() => { onClose(); navigate(`/digital-twin?id=${propertyId}`); }}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors shadow-sm"
            >
              <Home size={18} />
              View Digital Twin
              <ExternalLink size={14} />
            </button>

            {/* Overview */}
            <Section title="Overview" icon={<Home size={16} className="text-gray-600" />}>
              <div className="space-y-0">
                <DataRow label="Property Type" value={p.property_type} />
                <DataRow label="Bedrooms" value={p.bedrooms} />
                <DataRow label="Year Built" value={p.year_built} />
                <DataRow label="Built Form" value={p.built_form} />
                <DataRow label="Construction Age" value={p.construction_age_band} />
                <DataRow label="Floor Area" value={p.floor_area_m2} unit="m²" />
              </div>
            </Section>

            {/* Energy & Sustainability */}
            <Section title="Energy & Sustainability" icon={<Zap size={16} className="text-yellow-600" />}>
              <div className="space-y-0">
                <DataRow label="Heating System" value={p.main_heating || p.heating_type} />
                <DataRow label="Main Fuel" value={p.main_fuel} />
                <DataRow label="Hot Water" value={p.hot_water} />
                <DataRow label="Wall Type" value={p.wall_type} />
                <DataRow label="Wall Insulation" value={p.wall_insulation} />
                <DataRow label="Roof Insulation" value={p.roof_insulation} />
                <DataRow label="Windows" value={p.windows} />
                <DataRow label="Lighting" value={p.lighting} />
                <DataRow label="CO₂ Emissions" value={p.co2_emissions} unit="tonnes/yr" />
                <DataRow label="CO₂ Potential" value={p.co2_potential} unit="tonnes/yr" />
                <DataRow label="Current Energy Cost" value={p.energy_cost_current != null ? `£${p.energy_cost_current}` : null} />
                <DataRow label="Potential Energy Cost" value={p.energy_cost_potential != null ? `£${p.energy_cost_potential}` : null} />
              </div>
            </Section>

            {/* Property Condition */}
            <Section title="Condition" icon={<Shield size={16} className="text-blue-600" />}>
              <div className="flex items-center justify-center mb-3">
                <div className="relative w-24 h-24">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="45" fill="none" stroke="#f3f4f6" strokeWidth="8" />
                    <circle cx="50" cy="50" r="45" fill="none" stroke="#1B4F72" strokeWidth="8"
                      strokeDasharray={`${(p.stock_condition_score || 0) * 2.827} 282.7`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-2xl font-bold text-gray-900">{p.stock_condition_score ?? '\u2014'}</p>
                    <p className="text-xs text-gray-500">Score</p>
                  </div>
                </div>
              </div>
              <DataRow label="Last Inspection" value={p.last_inspection_date ? new Date(p.last_inspection_date).toLocaleDateString() : null} />
            </Section>

            {/* Repairs & Complaints */}
            {operations && (operations.repairs?.count > 0 || operations.complaints?.count > 0) && (
              <Section title="Repairs & Complaints" icon={<Wrench size={16} className="text-orange-600" />} defaultOpen={true}>
                <div className="space-y-3">
                  {/* Repairs summary */}
                  <div className="bg-orange-50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-orange-800 uppercase tracking-wide">Repairs</span>
                      <span className="text-lg font-bold text-orange-700">{operations.repairs?.count || 0}</span>
                    </div>
                    {operations.repairs?.count > 0 && (
                      <div className="space-y-1 text-xs text-gray-600">
                        <div className="flex justify-between">
                          <span>Total Spend</span>
                          <span className="font-medium">£{(operations.repairs.total_cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Avg Cost</span>
                          <span className="font-medium">£{(operations.repairs.avg_cost || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>On-Time</span>
                          <span className="font-medium">{operations.repairs.on_time_pct || 0}%</span>
                        </div>
                        {operations.repairs.top_trades?.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-orange-200">
                            <span className="font-semibold text-orange-800">Top Trades:</span>
                            {operations.repairs.top_trades.slice(0, 3).map((t: any) => (
                              <div key={t.trade} className="flex justify-between">
                                <span>{t.trade}</span>
                                <span className="font-medium">{t.count}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Complaints summary */}
                  <div className="bg-red-50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-red-800 uppercase tracking-wide">Complaints</span>
                      <span className="text-lg font-bold text-red-700">{operations.complaints?.count || 0}</span>
                    </div>
                    {operations.complaints?.count > 0 && (
                      <div className="space-y-1 text-xs text-gray-600">
                        <div className="flex justify-between">
                          <span>Stage 1</span>
                          <span className="font-medium">{operations.complaints.stages?.stage_1 || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Stage 2</span>
                          <span className="font-medium">{operations.complaints.stages?.stage_2 || 0}</span>
                        </div>
                        {operations.complaints.avg_response_days != null && (
                          <div className="flex justify-between">
                            <span>Avg Response</span>
                            <span className="font-medium">{operations.complaints.avg_response_days.toFixed(0)} days</span>
                          </div>
                        )}
                        {operations.complaints.categories?.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-red-200">
                            <span className="font-semibold text-red-800">Categories:</span>
                            {operations.complaints.categories.slice(0, 3).map((c: any) => (
                              <div key={c.category} className="flex justify-between">
                                <span>{c.category}</span>
                                <span className="font-medium">{c.count}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Section>
            )}

            {/* Crime Risk */}
            <Section title="Crime Risk" icon={<Shield size={16} className="text-red-600" />} defaultOpen={false}>
              <div className="mb-3">
                <RiskBadge level={crimeRisk.level} label={crimeRisk.label} />
                {p.crime_risk_score != null && (
                  <span className="ml-2 text-sm text-gray-500">Score: {p.crime_risk_score}/10</span>
                )}
              </div>
              <div className="space-y-0">
                <DataRow label="Total (3 months)" value={p.crime_total_3months} />
                <DataRow label="Burglary" value={p.crime_burglary_3months} />
                <DataRow label="Anti-social" value={p.crime_antisocial_3months} />
                <DataRow label="Criminal Damage" value={p.crime_criminal_damage_3months} />
                <DataRow label="Violence" value={p.crime_violence_3months} />
                <DataRow label="Robbery" value={p.crime_robbery_3months} />
                <DataRow label="Other" value={p.crime_other_3months} />
                {p.crime_last_updated && (
                  <DataRow label="Last Updated" value={new Date(p.crime_last_updated).toLocaleDateString()} />
                )}
              </div>
            </Section>

            {/* Flood Risk */}
            <Section title="Flood Risk" icon={<Droplets size={16} className="text-blue-600" />} defaultOpen={false}>
              <div className="mb-3">
                <RiskBadge level={floodRisk.level} label={floodRisk.label} />
              </div>
              <div className="space-y-0">
                <DataRow label="Rivers & Seas" value={p.flood_risk_rivers_seas} />
                <DataRow label="Surface Water" value={p.flood_risk_surface_water} />
                <DataRow label="Flood Zone" value={p.flood_zone} />
                <DataRow label="Active Warnings" value={p.active_flood_warnings != null ? (p.active_flood_warnings ? 'Yes' : 'No') : null} />
              </div>
            </Section>

            {/* Location Context */}
            <Section title="Location" icon={<MapPin size={16} className="text-green-600" />} defaultOpen={false}>
              <div className="space-y-0">
                <DataRow label="Ward" value={p.ward_name} />
                <DataRow label="LSOA" value={p.lsoa_name} />
                <DataRow label="MSOA" value={p.msoa_name} />
                <DataRow label="Local Authority" value={p.local_authority_name} />
                <DataRow label="Region" value={p.region} />
                <DataRow label="Parish" value={p.parish} />
                <DataRow label="Constituency" value={p.parliamentary_constituency} />
              </div>
              {p.latitude && p.longitude && (
                <p className="mt-2 text-xs text-gray-400 text-center">
                  {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}
                </p>
              )}
            </Section>

            {/* IMD Deprivation */}
            {(p.imd_decile != null || p.imd_rank != null) && (
              <Section title="Deprivation (IMD)" icon={<AlertTriangle size={16} className="text-purple-600" />} defaultOpen={false}>
                <div className="space-y-0">
                  <DataRow label="IMD Decile" value={p.imd_decile != null ? `${p.imd_decile} / 10` : null} />
                  <DataRow label="IMD Rank" value={p.imd_rank != null ? `${p.imd_rank.toLocaleString()} / 32,844` : null} />
                </div>
              </Section>
            )}

            <div className="h-6" />
          </div>
        )}
      </div>
    </>
  );
}
