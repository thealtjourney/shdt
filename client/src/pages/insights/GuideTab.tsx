/**
 * GuideTab — "Understanding Your Data" tab content.
 *
 * Pure static content explaining each data source in the Strategic
 * Insights view. Extracted from App.tsx as the worked example of the
 * tab-extraction refactor pattern (see ./REFACTOR_PATTERN.md).
 *
 * No props, no state, no effects — the simplest possible extraction.
 * Use this file as the template for the remaining seven tabs:
 *
 *   StrategicTab, RiskHeatmapTab, EpcOverviewTab, FuelPovertyTab,
 *   ComplaintsTab, RepairsTab, DemographicsTab, HotspotsTab
 *
 * The pattern for each:
 *   1. Cut the JSX from `App.tsx` between the `{activeTab === '<name>' && (`
 *      block and its closing `)}`.
 *   2. Paste here, replace `cardStyle` with the local CARD_STYLE constant.
 *   3. Pass any state the parent owns as props.
 *   4. Add a `__tests__/<TabName>.test.tsx` snapshot test.
 */
import type { CSSProperties } from 'react'

// Locally-owned style — mirrors the inline `cardStyle` in App.tsx so
// extracted tabs can be tested in isolation.
const CARD_STYLE: CSSProperties = {
  backgroundColor: 'white',
  borderRadius: 10,
  padding: 20,
  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
}

interface SourceBlockProps {
  iconColor: string
  iconBg: string
  icon: string
  title: string
  children: React.ReactNode
}

function SourceBlock({ iconBg, icon, title, children }: SourceBlockProps) {
  return (
    <div style={{ ...CARD_STYLE, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            backgroundColor: iconBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
          }}
        >
          {icon}
        </div>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111' }}>{title}</h3>
      </div>
      {children}
    </div>
  )
}

const PARA: CSSProperties = { fontSize: 13, color: '#555', lineHeight: 1.7, marginBottom: 12 }
const PARA_LAST: CSSProperties = { fontSize: 13, color: '#555', lineHeight: 1.7 }

export function GuideTab() {
  return (
    <div data-testid="guide-tab">
      <div
        style={{
          ...CARD_STYLE,
          marginBottom: 24,
          backgroundColor: '#f0fdf4',
          border: '1px solid #bbf7d0',
        }}
      >
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#166534', marginBottom: 8 }}>
          About This Page
        </h3>
        <p style={{ fontSize: 13, color: '#15803D', lineHeight: 1.6 }}>
          The Strategic Insights page brings together data from multiple sources to give you a
          complete picture of your housing portfolio. Below is a guide to each data source, what
          it tells you, and how to use it for investment and welfare decisions.
        </p>
      </div>

      <SourceBlock iconBg="#FEE2E2" iconColor="#DC2626" icon="🔒" title="Crime Risk Data">
        <p style={PARA}>
          <strong>Source:</strong> UK Police API (data.police.uk) — updated monthly with a 2-month
          reporting lag.
        </p>
        <p style={PARA}>
          <strong>What it measures:</strong> Each property is scored 1-10 based on the volume and
          severity of reported crimes within a 1-mile radius over the most recent 3-month window.
          The score aggregates six crime categories: burglary, violence/sexual offences,
          anti-social behaviour, robbery, criminal damage, and other crimes. A score of 10
          indicates the highest crime density relative to other properties in the portfolio.
        </p>
        <p style={PARA}>
          <strong>How to interpret it:</strong> Scores of 7-10 represent high-crime areas where
          tenants may feel unsafe and properties may suffer higher damage or void rates. Scores of
          1-3 indicate relatively low-crime areas. The Area Risk Heatmap weights crime at 30% of
          the composite score — meaning a high crime score alone won't push an area to "Critical"
          without corresponding flood or deprivation issues.
        </p>
        <p style={PARA_LAST}>
          <strong>Decision value:</strong> High crime areas may benefit from improved security
          (door entry systems, CCTV, secure boundaries), enhanced environmental maintenance
          (lighting, grounds), and closer working with police neighbourhood teams. Properties in
          high-crime areas with poor condition scores should be prioritised for investment to
          prevent further decline.
        </p>
      </SourceBlock>

      <SourceBlock iconBg="#DBEAFE" iconColor="#2563EB" icon="🌊" title="Flood Risk Data">
        <p style={PARA}>
          <strong>Source:</strong> Environment Agency Flood Monitoring API — real-time flood
          warnings plus long-term flood zone classifications.
        </p>
        <p style={PARA}>
          <strong>What it measures:</strong> Three risk dimensions are tracked per property.{' '}
          <em>Flood Zone</em>: Zone 1 (low probability, &lt;0.1% annual chance), Zone 2 (medium,
          0.1-1%), Zone 3 (high, &gt;1% annual chance). <em>River &amp; Sea Risk</em>: The
          likelihood of flooding from rivers and coastal sources. <em>Surface Water Risk</em>: The
          likelihood of flooding from rainfall overwhelming drainage systems — often the most
          relevant for urban social housing.
        </p>
        <p style={PARA}>
          <strong>How to interpret it:</strong> Zone 3 properties face a greater than 1-in-100
          chance of flooding in any given year. For a 30-year asset, that translates to roughly a
          26% chance of experiencing at least one significant flood event. The heatmap weights
          flood risk at 30% of the composite score, with Zone 3 receiving the maximum 30 points.
        </p>
        <p style={PARA_LAST}>
          <strong>Decision value:</strong> Zone 2-3 properties should have flood resilience
          measures (raised electrics, flood-resistant materials, non-return valves). Surface water
          risk is particularly actionable — improved drainage, permeable surfaces, and rainwater
          management can reduce risk without relocating tenants. High flood risk should also
          factor into long-term stock disposal/retention decisions and insurance cost projections.
        </p>
      </SourceBlock>

      <SourceBlock iconBg="#EDE9FE" iconColor="#7C3AED" icon="📊" title="Index of Multiple Deprivation (IMD)">
        <p style={PARA}>
          <strong>Source:</strong> Ministry of Housing, Communities &amp; Local Government —
          English Indices of Deprivation 2025 (IoD 2025). Based on Lower Super Output Areas
          (LSOAs) using 2021 boundaries, each covering roughly 1,500 residents.
        </p>
        <p style={PARA}>
          <strong>What it measures:</strong> The IoD 2025 combines 7 weighted domains into an
          overall deprivation ranking for all LSOAs in England (using 2021 boundaries). The
          domains are: Income (22.5%), Employment (22.5%), Health &amp; Disability (13.5%),
          Education (13.5%), Crime (9.3%), Barriers to Housing &amp; Services (9.3%), and Living
          Environment (9.3%). The <em>decile</em> groups areas into 10 bands — decile 1 represents
          the most deprived 10% of areas nationally.
        </p>
        <p style={PARA}>
          <strong>How to interpret it:</strong> Properties in IMD deciles 1-3 are in the most
          deprived 30% of areas in England. These areas typically have higher unemployment, lower
          incomes, poorer health outcomes, and more limited access to services. The Area Risk
          Heatmap weights deprivation at 40% of the composite score — the highest weight —
          because deprivation has the strongest correlation with tenant welfare outcomes.
        </p>
        <p style={PARA_LAST}>
          <strong>Decision value:</strong> High-deprivation areas are where housing investment has
          the greatest social impact. Properties in IMD decile 1-3 areas with poor EPC ratings are
          prime fuel poverty candidates. The sub-domain scores (income, employment, health) help
          tailor interventions — for example, a high "barriers to housing" score may indicate
          properties that are overcrowded or in poor repair, while a high "living environment"
          score points to poor indoor and outdoor conditions.
        </p>
      </SourceBlock>

      <SourceBlock iconBg="#FEF3C7" iconColor="#B45309" icon="⚖️" title="Composite Area Risk Score">
        <p style={PARA}>
          <strong>How it works:</strong> Each ward is scored 0-100 by combining three normalised
          components: Crime (0-30 points), Flood (0-30 points), and Deprivation (0-40 points).
          Deprivation carries the highest weight because it is the strongest predictor of poor
          housing outcomes and tenant vulnerability.
        </p>
        <p style={PARA}>
          <strong>Risk levels:</strong> Critical (≥60) — areas facing severe, compounding
          challenges across multiple dimensions. High (40-59) — significant risk that warrants
          proactive investment planning. Medium (20-39) — moderate risk, suitable for standard
          maintenance and monitoring. Low (&lt;20) — relatively low risk across all dimensions.
        </p>
        <p style={PARA_LAST}>
          <strong>Decision value:</strong> The composite score is designed for strategic
          portfolio-level decisions: where to direct capital investment, which areas need enhanced
          tenancy support, and where to prioritise energy efficiency programmes. Critical and
          High-risk areas should be the focus of board-level investment cases, while Medium-risk
          areas may benefit from preventative maintenance programmes.
        </p>
      </SourceBlock>

      <SourceBlock iconBg="#DCFCE7" iconColor="#166534" icon="⚡" title="Energy Performance Certificates (EPC)">
        <p style={PARA}>
          <strong>Source:</strong> EPC Open Data Communities (opendatacommunities.org) — the
          public register of all lodged EPCs in England and Wales.
        </p>
        <p style={PARA}>
          <strong>What it measures:</strong> The EPC rates a property's energy efficiency on an A
          (most efficient, score 92+) to G (least efficient, score 1-20) scale. It also provides
          a <em>potential</em> rating showing what the property could achieve with recommended
          improvements. Additional fields include CO₂ emissions (tonnes/year), estimated annual
          energy costs, wall/roof/window insulation types, and heating system details.
        </p>
        <p style={PARA}>
          <strong>How to interpret it:</strong> Social housing providers face regulatory targets
          to achieve EPC Band C or above by 2030. Properties rated D-G are below target and
          represent both a compliance risk and an opportunity to improve tenant comfort and reduce
          energy bills. The gap between current and potential ratings indicates how much
          improvement is achievable through retrofit.
        </p>
        <p style={PARA_LAST}>
          <strong>Decision value:</strong> EPC data feeds into the Strategic Insights engine,
          which cross-correlates energy performance with deprivation, demographics, and repair
          history to identify fuel poverty hotspots and decarbonisation priorities. Properties
          with large current-to-potential gaps offer the best return on investment. Combined with
          IMD data, this identifies where investment delivers both regulatory compliance and
          social value.
        </p>
      </SourceBlock>

      <SourceBlock iconBg="#FFF7ED" iconColor="#EA580C" icon="🔥" title="Fuel Poverty Analysis">
        <p style={PARA}>
          <strong>How it works:</strong> The fuel poverty analysis cross-references EPC ratings
          with IMD deprivation data. A household is classified as "High Risk" if the property has
          an EPC of E, F, or G (poor energy efficiency) and is located in an area with IMD decile
          1-3 (most deprived 30%). "At Risk" broadens this to EPC D-G and IMD decile 1-5.
        </p>
        <p style={PARA}>
          <strong>Why it matters:</strong> Under the government's Low Income Low Energy Efficiency
          (LILEE) metric, a household is in fuel poverty if it lives in a property with an EPC of
          D or below and has a residual income below the poverty line after accounting for energy
          costs. Social housing tenants in deprived areas with inefficient homes are the most
          likely to be fuel poor — and the most likely to benefit from retrofit investment.
        </p>
        <p style={PARA_LAST}>
          <strong>Decision value:</strong> The cross-tabulation and hotspot tables on the Fuel
          Poverty tab identify the specific wards and LSOAs where fuel poverty risk concentrates.
          These are your priority areas for grant-funded retrofit programmes (such as the Social
          Housing Decarbonisation Fund) and for making the social value case in board investment
          papers.
        </p>
      </SourceBlock>

      <SourceBlock iconBg="#E0F2FE" iconColor="#0369A1" icon="👥" title="Census 2021 Demographics">
        <p style={PARA}>
          <strong>Source:</strong> Synthetic data modelled on ONS Census 2021 national averages,
          correlated with IoD 2025 deprivation deciles and adjusted for regional variation.
          Census 2021 is the most recent UK census; the next is scheduled for 2031.
        </p>
        <p style={PARA}>
          <strong>What it measures:</strong> Nine LSOA-level demographic indicators: age profile
          (0-15, 16-64, 65+ percentages), population density, single-person household proportion,
          overcrowding rates, households without central heating, disability prevalence, and
          non-English speaker rates. Each metric is generated per LSOA with realistic variation
          correlated with the area's deprivation level.
        </p>
        <p style={PARA}>
          <strong>How to interpret it:</strong> Areas with high elderly populations (65+) combined
          with high disability rates and single-person households signal concentrations of
          vulnerable tenants who may need adapted housing, accessibility improvements, and
          enhanced support services. High overcrowding rates suggest demand for larger units.
          Areas with higher non-English speaker rates may need multilingual communications.
        </p>
        <p style={PARA_LAST}>
          <strong>Decision value:</strong> The elderly concentration table highlights wards where
          adapted housing demand is likely highest. Cross-referencing with EPC data identifies
          areas where vulnerable tenants are also in energy-inefficient homes. Population density
          data informs communal facility planning and service delivery models.
        </p>
      </SourceBlock>

      <SourceBlock iconBg="#FEF3C7" iconColor="#B45309" icon="📡" title="Broadband & Utilities">
        <p style={PARA}>
          <strong>Source:</strong> Ofcom Connected Nations regional averages for broadband speeds
          and availability, with postcode-prefix-based mapping for electricity Distribution
          Network Operators (DNOs) and region-based mapping for Gas Distribution Networks (GDNs).
        </p>
        <p style={PARA}>
          <strong>What it measures:</strong> Average download and upload speeds (Mbps), superfast
          broadband availability (30+ Mbps), ultrafast availability (100+ Mbps), and
          full-fibre-to-the-premises (FTTP) availability. Also identifies the electricity DNO and
          gas GDN responsible for each property — crucial for energy infrastructure planning and
          net-zero programmes.
        </p>
        <p style={PARA}>
          <strong>How to interpret it:</strong> The "Digital Divide" table ranks wards by lowest
          average broadband speed. Properties without superfast broadband may struggle with smart
          meter connectivity, remote management systems, and tenant access to online services.
          DNO/GDN breakdowns show which network operators you need to engage for grid connections,
          heat pump installations, and decarbonisation programmes.
        </p>
        <p style={PARA_LAST}>
          <strong>Decision value:</strong> Poor broadband areas should be flagged for
          infrastructure improvement programmes. When planning heat pump or EV charger
          installations, the DNO breakdown tells you which operator to contact for grid capacity
          assessments. GDN data is essential for planning gas-to-electric heating transitions, as
          you need to coordinate disconnections with the relevant network.
        </p>
      </SourceBlock>

      <SourceBlock iconBg="#FCE7F3" iconColor="#BE185D" icon="🔧" title="Complaints & Repairs Data">
        <p style={PARA}>
          <strong>Source:</strong> Uploaded operational data from your housing management
          system — complaints case records and repair order data by contractor.
        </p>
        <p style={PARA}>
          <strong>What it measures:</strong> Complaints data tracks tenant dissatisfaction by
          category (reactive repairs, damp/condensation, gas, tenancy issues), by area, and by
          escalation stage. Stage 2 escalations indicate failures in initial complaint handling.
          Repairs data tracks every work order: what was done, by which contractor, at what cost,
          whether it was attended on time, and whether it was fixed first time.
        </p>
        <p style={PARA}>
          <strong>How to interpret it:</strong> A high proportion of complaints about reactive
          repairs and damp/condensation signals systemic property issues rather than one-off
          service failures. Low on-time attendance or first-time fix rates by specific contractors
          indicate performance issues that should inform procurement decisions. Repeat repairs at
          the same property suggest the underlying cause hasn't been addressed.
        </p>
        <p style={PARA_LAST}>
          <strong>Decision value:</strong> Cross-referencing complaint and repair hotspots with
          property condition, EPC, and area risk data creates a powerful evidence base for
          investment. A property with poor EPC, high repair frequency, active damp complaints, and
          a high area risk score is a clear candidate for major intervention — and the digital
          twin brings all these signals together in one place.
        </p>
      </SourceBlock>
    </div>
  )
}

export default GuideTab
