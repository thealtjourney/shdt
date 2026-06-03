'use client';

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';

export default function HowItWorks() {
  const [currentStep, setCurrentStep] = useState(0);
  const [expandedArchitecture, setExpandedArchitecture] = useState(false);

  const steps = [
    {
      id: 1,
      title: 'Upload Your Data',
      description: 'Import your property dataset in CSV format. Our system intelligently processes and structures your data.',
      stats: [
        { label: '2 fields minimum', value: 'to start' },
        { label: '15+ auto-detected fields', value: 'recognized' },
        { label: 'Automatic deduplication', value: 'built-in' }
      ],
      svgContent: (
        <svg viewBox="0 0 400 300" className="w-full h-full max-w-md">
          {/* File icon */}
          <rect x="80" y="40" width="120" height="140" fill="#E8F4F8" stroke="#1B4F72" strokeWidth="2" rx="4" />
          <line x1="95" y1="65" x2="185" y2="65" stroke="#1B4F72" strokeWidth="1" />
          <line x1="95" y1="85" x2="185" y2="85" stroke="#1B4F72" strokeWidth="1" />
          <line x1="95" y1="105" x2="175" y2="105" stroke="#1B4F72" strokeWidth="1" />
          <line x1="95" y1="125" x2="180" y2="125" stroke="#1B4F72" strokeWidth="1" />
          <line x1="95" y1="145" x2="170" y2="145" stroke="#1B4F72" strokeWidth="1" />

          {/* Arrow */}
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
              <polygon points="0 0, 10 3, 0 6" fill="#1B4F72" />
            </marker>
          </defs>
          <path d="M 220 110 Q 280 110 310 110" stroke="#1B4F72" strokeWidth="3" fill="none" markerEnd="url(#arrowhead)" strokeDasharray="5,5" />

          {/* Database icon */}
          <ellipse cx="340" cy="85" rx="35" ry="15" fill="#E8F4F8" stroke="#1B4F72" strokeWidth="2" />
          <rect x="305" y="85" width="70" height="40" fill="none" stroke="#1B4F72" strokeWidth="2" />
          <ellipse cx="340" cy="125" rx="35" ry="15" fill="#E8F4F8" stroke="#1B4F72" strokeWidth="2" />
          <line x1="310" y1="95" x2="310" y2="120" stroke="#1B4F72" strokeWidth="1" />
          <line x1="370" y1="95" x2="370" y2="120" stroke="#1B4F72" strokeWidth="1" />

          {/* Processing animation circles */}
          <circle cx="220" cy="150" r="8" fill="#1B4F72" opacity="0.6" />
          <circle cx="240" cy="150" r="8" fill="#1B4F72" opacity="0.4" />
          <circle cx="260" cy="150" r="8" fill="#1B4F72" opacity="0.2" />
        </svg>
      )
    },
    {
      id: 2,
      title: 'Geocoding',
      description: 'Convert postcodes into precise geographic coordinates. Seamless mapping integration without external dependencies.',
      badge: 'No API key needed — completely free',
      stats: [
        { label: 'Postcode coverage', value: '100% UK' },
        { label: 'Geocoding accuracy', value: '99.9%' },
        { label: 'Processing speed', value: 'Instant' }
      ],
      svgContent: (
        <svg viewBox="0 0 400 300" className="w-full h-full max-w-md">
          {/* Map background */}
          <rect x="50" y="40" width="300" height="200" fill="#D6EAF8" stroke="#1B4F72" strokeWidth="2" rx="4" />

          {/* Grid pattern */}
          <line x1="100" y1="40" x2="100" y2="240" stroke="#AED6F1" strokeWidth="1" opacity="0.5" />
          <line x1="150" y1="40" x2="150" y2="240" stroke="#AED6F1" strokeWidth="1" opacity="0.5" />
          <line x1="200" y1="40" x2="200" y2="240" stroke="#AED6F1" strokeWidth="1" opacity="0.5" />
          <line x1="250" y1="40" x2="250" y2="240" stroke="#AED6F1" strokeWidth="1" opacity="0.5" />
          <line x1="300" y1="40" x2="300" y2="240" stroke="#AED6F1" strokeWidth="1" opacity="0.5" />

          <line x1="50" y1="90" x2="350" y2="90" stroke="#AED6F1" strokeWidth="1" opacity="0.5" />
          <line x1="50" y1="140" x2="350" y2="140" stroke="#AED6F1" strokeWidth="1" opacity="0.5" />
          <line x1="50" y1="190" x2="350" y2="190" stroke="#AED6F1" strokeWidth="1" opacity="0.5" />

          {/* Dropping pin */}
          <g>
            <path d="M 200 50 L 195 90 Q 195 105 200 105 Q 205 105 205 90 Z" fill="#E74C3C" />
            <circle cx="200" cy="95" r="6" fill="#C0392B" />
          </g>

          {/* Data fields appearing */}
          <rect x="100" y="130" width="80" height="50" fill="#FFFFFF" stroke="#1B4F72" strokeWidth="1" rx="2" opacity="0.8" />
          <text x="110" y="145" fontSize="10" fontFamily="monospace" fill="#1B4F72">Postcode</text>
          <text x="110" y="160" fontSize="10" fontFamily="monospace" fill="#1B4F72">E1 6AN</text>
          <text x="110" y="175" fontSize="10" fontFamily="monospace" fill="#1B4F72">51.520°N</text>

          <rect x="220" y="130" width="80" height="50" fill="#FFFFFF" stroke="#1B4F72" strokeWidth="1" rx="2" opacity="0.8" />
          <text x="230" y="145" fontSize="10" fontFamily="monospace" fill="#1B4F72">Latitude</text>
          <text x="230" y="160" fontSize="10" fontFamily="monospace" fill="#1B4F72">0.029°E</text>
          <text x="230" y="175" fontSize="10" fontFamily="monospace" fill="#1B4F72">Ward</text>
        </svg>
      )
    },
    {
      id: 3,
      title: 'Enrichment Engine',
      description: 'Automatically enrich your dataset with 70+ contextual fields from 7 major UK data sources running in parallel.',
      stats: [
        { label: '70+ fields per property', value: 'total' },
        { label: '7 sources in parallel', value: 'execution' },
        { label: 'Total cost', value: 'Free' }
      ],
      dataSources: [
        { name: 'EPC', fields: 'Energy rating, construction age', badge: 'free registration', color: 'blue' },
        { name: 'EA Flood', fields: 'Flood risk zones, historical events', badge: 'no key needed', color: 'green' },
        { name: 'Police UK', fields: 'Crime rates, incident heatmap', badge: 'no key needed', color: 'green' },
        { name: 'IMD', fields: 'Deprivation index, domains', badge: 'no key needed', color: 'green' },
        { name: 'Census', fields: 'Demographics, housing data', badge: 'no key needed', color: 'green' },
        { name: 'Land Registry', fields: 'Price history, turnover rates', badge: 'no key needed', color: 'green' },
        { name: 'Postcodes.io', fields: 'Administrative boundaries, regions', badge: 'no key needed', color: 'green' }
      ],
      svgContent: (
        <svg viewBox="0 0 400 300" className="w-full h-full max-w-md">
          {/* Central node */}
          <circle cx="200" cy="150" r="20" fill="#1B4F72" stroke="#1B4F72" strokeWidth="2" />
          <text x="200" y="155" fontSize="12" fontFamily="Arial" fontWeight="bold" fill="white" textAnchor="middle">PROPERTY</text>

          {/* Lines radiating out */}
          <g stroke="#1B4F72" strokeWidth="2" opacity="0.4">
            <line x1="200" y1="170" x2="200" y2="220" />
            <line x1="200" y1="130" x2="200" y2="80" />
            <line x1="220" y1="150" x2="280" y2="150" />
            <line x1="180" y1="150" x2="120" y2="150" />
            <line x1="227" y1="177" x2="277" y2="227" />
            <line x1="173" y1="123" x2="123" y2="73" />
            <line x1="227" y1="123" x2="277" y2="73" />
          </g>

          {/* Data source nodes */}
          <circle cx="200" cy="230" r="12" fill="#27AE60" opacity="0.8" />
          <text x="200" y="236" fontSize="9" fontFamily="Arial" fontWeight="bold" fill="white" textAnchor="middle">EPC</text>

          <circle cx="200" cy="70" r="12" fill="#27AE60" opacity="0.8" />
          <text x="200" y="76" fontSize="9" fontFamily="Arial" fontWeight="bold" fill="white" textAnchor="middle">Flood</text>

          <circle cx="290" cy="150" r="12" fill="#27AE60" opacity="0.8" />
          <text x="290" y="156" fontSize="9" fontFamily="Arial" fontWeight="bold" fill="white" textAnchor="middle">Police</text>

          <circle cx="110" cy="150" r="12" fill="#27AE60" opacity="0.8" />
          <text x="110" y="156" fontSize="9" fontFamily="Arial" fontWeight="bold" fill="white" textAnchor="middle">IMD</text>

          <circle cx="285" cy="235" r="12" fill="#27AE60" opacity="0.8" />
          <text x="285" y="241" fontSize="9" fontFamily="Arial" fontWeight="bold" fill="white" textAnchor="middle">LR</text>

          <circle cx="115" cy="65" r="12" fill="#27AE60" opacity="0.8" />
          <text x="115" y="71" fontSize="9" fontFamily="Arial" fontWeight="bold" fill="white" textAnchor="middle">Census</text>

          <circle cx="285" cy="65" r="12" fill="#27AE60" opacity="0.8" />
          <text x="285" y="71" fontSize="9" fontFamily="Arial" fontWeight="bold" fill="white" textAnchor="middle">Postcodes</text>
        </svg>
      )
    },
    {
      id: 4,
      title: 'Map Visualisation',
      description: 'See your property data geographically distributed across the UK with EPC-coloured markers, clustering, and multiple overlay layers.',
      stats: [
        { label: 'Map layers', value: '5+' },
        { label: 'Marker clustering', value: 'Automatic' },
        { label: 'Color-coded by', value: 'EPC rating' }
      ],
      svgContent: (
        <svg viewBox="0 0 400 300" className="w-full h-full max-w-md">
          {/* Map background */}
          <rect x="20" y="30" width="360" height="240" fill="#E8F8F5" stroke="#1B4F72" strokeWidth="2" rx="4" />

          {/* Simplified UK coastline */}
          <path d="M 50 50 L 80 40 L 100 45 L 120 35 L 130 60 L 140 50 L 160 55 L 180 40 L 200 50 L 220 45 L 240 55 L 250 70 L 270 60 L 290 65 L 310 50 L 320 70 L 310 100 L 300 90 L 280 110 L 260 100 L 240 120 L 220 110 L 200 130 L 180 120 L 160 140 L 140 130 L 120 150 L 100 140 L 80 160 L 60 150 L 50 130 Z"
                fill="#D6EAF8" stroke="#1B4F72" strokeWidth="1.5" opacity="0.6" />

          {/* EPC colored dots */}
          <circle cx="85" cy="80" r="5" fill="#27AE60" opacity="0.8" />
          <circle cx="150" cy="90" r="5" fill="#F39C12" opacity="0.8" />
          <circle cx="200" cy="70" r="6" fill="#27AE60" opacity="0.8" />
          <circle cx="250" cy="110" r="5" fill="#E74C3C" opacity="0.8" />
          <circle cx="120" cy="130" r="5" fill="#F39C12" opacity="0.8" />
          <circle cx="180" cy="140" r="5" fill="#27AE60" opacity="0.8" />
          <circle cx="290" cy="85" r="5" fill="#F39C12" opacity="0.8" />
          <circle cx="220" cy="150" r="5" fill="#E74C3C" opacity="0.8" />

          {/* Cluster indicator */}
          <circle cx="160" cy="100" r="15" fill="none" stroke="#1B4F72" strokeWidth="1" strokeDasharray="3,3" opacity="0.6" />
          <text x="160" y="155" fontSize="11" fontFamily="Arial" fontWeight="bold" fill="#1B4F72" textAnchor="middle">Color legend: A(Green) D(Orange) G(Red)</text>
        </svg>
      )
    },
    {
      id: 5,
      title: 'Analytics & Scoring',
      description: 'Generate intelligent property metrics including retrofit potential, fuel poverty assessment, and investment returns.',
      stats: [
        { label: 'Retrofit algorithm', value: '6 factors' },
        { label: 'Fuel poverty', value: 'LIHC model' },
        { label: 'Investment modelling', value: 'ROI calc' }
      ],
      svgContent: (
        <svg viewBox="0 0 400 300" className="w-full h-full max-w-md">
          {/* Three analysis boxes */}

          {/* Box 1: Retrofit */}
          <rect x="30" y="50" width="100" height="120" fill="#F0F3F4" stroke="#1B4F72" strokeWidth="2" rx="4" />
          <text x="80" y="70" fontSize="12" fontFamily="Arial" fontWeight="bold" fill="#1B4F72" textAnchor="middle">Retrofit</text>
          <text x="80" y="90" fontSize="11" fontFamily="Arial" fill="#34495E" textAnchor="middle">Score: 7.2/10</text>
          <text x="80" y="105" fontSize="9" fontFamily="Arial" fill="#34495E" textAnchor="middle">Age, Rating,</text>
          <text x="80" y="118" fontSize="9" fontFamily="Arial" fill="#34495E" textAnchor="middle">Efficiency, Risk</text>

          {/* Box 2: Fuel Poverty */}
          <rect x="150" y="50" width="100" height="120" fill="#F0F3F4" stroke="#1B4F72" strokeWidth="2" rx="4" />
          <text x="200" y="70" fontSize="12" fontFamily="Arial" fontWeight="bold" fill="#1B4F72" textAnchor="middle">Fuel Poverty</text>
          <text x="200" y="90" fontSize="11" fontFamily="Arial" fill="#34495E" textAnchor="middle">Risk: 35%</text>
          <text x="200" y="105" fontSize="9" fontFamily="Arial" fill="#34495E" textAnchor="middle">LIHC Model,</text>
          <text x="200" y="118" fontSize="9" fontFamily="Arial" fill="#34495E" textAnchor="middle">Energy Costs</text>

          {/* Box 3: Investment */}
          <rect x="270" y="50" width="100" height="120" fill="#F0F3F4" stroke="#1B4F72" strokeWidth="2" rx="4" />
          <text x="320" y="70" fontSize="12" fontFamily="Arial" fontWeight="bold" fill="#1B4F72" textAnchor="middle">Investment</text>
          <text x="320" y="90" fontSize="11" fontFamily="Arial" fill="#34495E" textAnchor="middle">ROI: 4.2%/yr</text>
          <text x="320" y="105" fontSize="9" fontFamily="Arial" fill="#34495E" textAnchor="middle">Price trends,</text>
          <text x="320" y="118" fontSize="9" fontFamily="Arial" fill="#34495E" textAnchor="middle">Rental Yield</text>

          {/* Connecting lines */}
          <line x1="130" y1="110" x2="150" y2="110" stroke="#1B4F72" strokeWidth="2" opacity="0.5" />
          <line x1="250" y1="110" x2="270" y2="110" stroke="#1B4F72" strokeWidth="2" opacity="0.5" />

          {/* Bar chart */}
          <rect x="50" y="200" width="15" height="50" fill="#27AE60" opacity="0.7" />
          <rect x="75" y="180" width="15" height="70" fill="#F39C12" opacity="0.7" />
          <rect x="100" y="190" width="15" height="60" fill="#3498DB" opacity="0.7" />
          <rect x="125" y="160" width="15" height="90" fill="#E74C3C" opacity="0.7" />
          <rect x="150" y="170" width="15" height="80" fill="#9B59B6" opacity="0.7" />
          <rect x="175" y="185" width="15" height="65" fill="#1B4F72" opacity="0.7" />

          <text x="112" y="290" fontSize="10" fontFamily="Arial" fill="#34495E" textAnchor="middle">Analysis Factors</text>
        </svg>
      )
    },
    {
      id: 6,
      title: 'Reporting & Export',
      description: 'Generate professional reports and export your dataset in multiple formats for further analysis or stakeholder presentations.',
      stats: [
        { label: 'Export formats', value: 'CSV, GeoJSON' },
        { label: 'Report types', value: '6+' },
        { label: 'Print-ready', value: 'Included' }
      ],
      svgContent: (
        <svg viewBox="0 0 400 300" className="w-full h-full max-w-md">
          {/* Document/Report icon 1 */}
          <rect x="40" y="50" width="70" height="100" fill="#E8F4F8" stroke="#1B4F72" strokeWidth="2" rx="3" />
          <line x1="50" y1="65" x2="100" y2="65" stroke="#1B4F72" strokeWidth="1.5" />
          <line x1="50" y1="78" x2="100" y2="78" stroke="#1B4F72" strokeWidth="1.5" />
          <line x1="50" y1="91" x2="95" y2="91" stroke="#1B4F72" strokeWidth="1.5" />
          <line x1="50" y1="104" x2="90" y2="104" stroke="#1B4F72" strokeWidth="1.5" />
          <line x1="50" y1="117" x2="100" y2="117" stroke="#1B4F72" strokeWidth="1.5" />
          <text x="75" y="135" fontSize="10" fontFamily="Arial" fontWeight="bold" fill="#1B4F72" textAnchor="middle">Reports</text>

          {/* CSV/Data icon 2 */}
          <rect x="145" y="50" width="70" height="100" fill="#F4F6F7" stroke="#1B4F72" strokeWidth="2" rx="3" />
          <text x="170" y="75" fontSize="9" fontFamily="monospace" fill="#1B4F72">ID,Name,EPC</text>
          <text x="170" y="90" fontSize="9" fontFamily="monospace" fill="#1B4F72">1,Oak St,D</text>
          <text x="170" y="105" fontSize="9" fontFamily="monospace" fill="#1B4F72">2,Elm Ave,B</text>
          <text x="170" y="120" fontSize="9" fontFamily="monospace" fill="#1B4F72">3,Pine Rd,G</text>
          <text x="180" y="135" fontSize="10" fontFamily="Arial" fontWeight="bold" fill="#1B4F72" textAnchor="middle">Data Export</text>

          {/* GeoJSON/Map icon 3 */}
          <rect x="250" y="50" width="70" height="100" fill="#E8F8F5" stroke="#1B4F72" strokeWidth="2" rx="3" />
          <circle cx="265" cy="70" r="4" fill="#1B4F72" />
          <circle cx="275" cy="80" r="5" fill="#1B4F72" />
          <circle cx="295" cy="75" r="4" fill="#1B4F72" />
          <circle cx="280" cy="100" r="5" fill="#1B4F72" />
          <path d="M 265 70 L 275 80 L 295 75 L 280 100" stroke="#1B4F72" strokeWidth="1" fill="none" opacity="0.5" />
          <text x="285" y="135" fontSize="10" fontFamily="Arial" fontWeight="bold" fill="#1B4F72" textAnchor="middle">GeoJSON</text>

          {/* Download arrows */}
          <path d="M 75 160 L 75 190 M 70 185 L 75 190 L 80 185" stroke="#27AE60" strokeWidth="2" fill="none" />
          <path d="M 180 160 L 180 190 M 175 185 L 180 190 L 185 185" stroke="#27AE60" strokeWidth="2" fill="none" />
          <path d="M 285 160 L 285 190 M 280 185 L 285 190 L 290 185" stroke="#27AE60" strokeWidth="2" fill="none" />

          <text x="200" y="260" fontSize="10" fontFamily="Arial" fill="#34495E" textAnchor="middle">Multiple Format Support</text>
        </svg>
      )
    },
    {
      id: 7,
      title: 'Staying Fresh',
      description: 'Automatically refresh your data on schedules you define, with priority ordering and comprehensive quality monitoring.',
      stats: [
        { label: 'Auto refresh', value: 'Scheduled' },
        { label: 'Priority ordering', value: 'Enabled' },
        { label: 'Quality monitoring', value: 'Continuous' }
      ],
      svgContent: (
        <svg viewBox="0 0 400 300" className="w-full h-full max-w-md">
          {/* Timeline */}
          <line x1="50" y1="150" x2="350" y2="150" stroke="#1B4F72" strokeWidth="2" />

          {/* Timeline points */}
          <circle cx="80" cy="150" r="8" fill="#27AE60" stroke="#1B4F72" strokeWidth="2" />
          <text x="80" y="175" fontSize="9" fontFamily="Arial" fill="#1B4F72" textAnchor="middle">Week 1</text>
          <text x="80" y="187" fontSize="8" fontFamily="Arial" fill="#34495E" textAnchor="middle">Daily</text>

          <circle cx="150" cy="150" r="8" fill="#F39C12" stroke="#1B4F72" strokeWidth="2" />
          <text x="150" y="175" fontSize="9" fontFamily="Arial" fill="#1B4F72" textAnchor="middle">Week 2-4</text>
          <text x="150" y="187" fontSize="8" fontFamily="Arial" fill="#34495E" textAnchor="middle">Weekly</text>

          <circle cx="220" cy="150" r="8" fill="#3498DB" stroke="#1B4F72" strokeWidth="2" />
          <text x="220" y="175" fontSize="9" fontFamily="Arial" fill="#1B4F72" textAnchor="middle">Month 2-3</text>
          <text x="220" y="187" fontSize="8" fontFamily="Arial" fill="#34495E" textAnchor="middle">Bi-weekly</text>

          <circle cx="290" cy="150" r="8" fill="#9B59B6" stroke="#1B4F72" strokeWidth="2" />
          <text x="290" y="175" fontSize="9" fontFamily="Arial" fill="#1B4F72" textAnchor="middle">Month 4+</text>
          <text x="290" y="187" fontSize="8" fontFamily="Arial" fill="#34595E" textAnchor="middle">Monthly</text>

          {/* Quality monitoring bars */}
          <rect x="50" y="220" width="15" height="40" fill="#27AE60" opacity="0.7" />
          <text x="65" y="275" fontSize="8" fontFamily="Arial" fill="#34595E" textAnchor="start">Completeness</text>

          <rect x="130" y="230" width="15" height="30" fill="#F39C12" opacity="0.7" />
          <text x="145" y="275" fontSize="8" fontFamily="Arial" fill="#34595E" textAnchor="start">Accuracy</text>

          <rect x="210" y="225" width="15" height="35" fill="#3498DB" opacity="0.7" />
          <text x="225" y="275" fontSize="8" fontFamily="Arial" fill="#34595E" textAnchor="start">Freshness</text>

          <rect x="290" y="235" width="15" height="25" fill="#9B59B6" opacity="0.7" />
          <text x="305" y="275" fontSize="8" fontFamily="Arial" fill="#34595E" textAnchor="start">Coverage</text>
        </svg>
      )
    }
  ];

  const dataSources = [
    {
      name: 'Energy Performance Certificate (EPC)',
      org: 'Department for Energy Security & Net Zero',
      license: 'Open Government Licence',
      apiKeyNeeded: false,
      link: 'https://www.epc.opendatacommunities.org/'
    },
    {
      name: 'Environment Agency Flood Risk',
      org: 'Environment Agency',
      license: 'Open Government Licence',
      apiKeyNeeded: false,
      link: 'https://environment.data.gov.uk/'
    },
    {
      name: 'Police UK Crime Data',
      org: 'UK Police Services',
      license: 'Open Government Licence',
      apiKeyNeeded: false,
      link: 'https://data.police.uk/'
    },
    {
      name: 'Index of Multiple Deprivation',
      org: 'Office for National Statistics',
      license: 'Open Government Licence',
      apiKeyNeeded: false,
      link: 'https://www.gov.uk/government/statistics/english-indices-of-deprivation-2019'
    },
    {
      name: 'Census Data',
      org: 'Office for National Statistics',
      license: 'Open Government Licence',
      apiKeyNeeded: false,
      link: 'https://www.nomisweb.co.uk/'
    },
    {
      name: 'Land Registry Price Paid',
      org: 'HM Land Registry',
      license: 'Open Government Licence',
      apiKeyNeeded: false,
      link: 'https://www.gov.uk/government/statistical-data-sets/price-paid-data-downloads'
    },
    {
      name: 'Postcodes.io',
      org: 'Postcodes.io (Independent)',
      license: 'ODbL',
      apiKeyNeeded: false,
      link: 'https://postcodes.io/'
    }
  ];

  const architectureDetails = [
    {
      layer: 'Data Ingestion',
      components: 'CSV Parser, Validation Engine, Deduplication Service',
      tech: 'Node.js, Bull Queue, PostgreSQL'
    },
    {
      layer: 'Geocoding Service',
      components: 'Postcode Matcher, Coordinate Transform, Batch Processor',
      tech: 'Postcodes.io API, PostGIS, Redis Cache'
    },
    {
      layer: 'Enrichment Engine',
      components: '7 Parallel Data Consumers, Aggregation Service, Field Mapper',
      tech: 'Microservices, Kafka/RabbitMQ, Async Workers'
    },
    {
      layer: 'Analytics Layer',
      components: 'Retrofit Calculator, Fuel Poverty Model, Investment Engine',
      tech: 'NumPy, Pandas, Custom Algorithms'
    },
    {
      layer: 'Storage & Retrieval',
      components: 'Data Warehouse, Vector Store, Document Store',
      tech: 'PostgreSQL, TimescaleDB, Elasticsearch'
    },
    {
      layer: 'Visualization & Export',
      components: 'Map Engine, Report Generator, Multi-format Exporter',
      tech: 'Mapbox GL, Puppeteer, Node-csv'
    }
  ];

  const nextStep = () => {
    if (currentStep < steps.length - 1) setCurrentStep(currentStep + 1);
  };

  const prevStep = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  const currentStepData = steps[currentStep];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <h1 className="text-4xl font-bold text-slate-900 mb-3">How SHDT Works</h1>
          <p className="text-lg text-slate-600">A comprehensive walkthrough of our intelligent property data enrichment platform</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Step Indicator Pills */}
        <div className="mb-12">
          <div className="flex flex-wrap gap-3 justify-center mb-6">
            {steps.map((step, idx) => (
              <button
                key={step.id}
                onClick={() => setCurrentStep(idx)}
                className={`px-4 py-2 rounded-full font-semibold text-sm transition-all duration-200 flex items-center gap-2 ${
                  idx === currentStep
                    ? 'bg-[#1B4F72] text-white shadow-lg scale-105'
                    : 'bg-white text-slate-700 border-2 border-slate-300 hover:border-[#1B4F72] hover:text-[#1B4F72]'
                }`}
              >
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-opacity-30 bg-white">
                  {step.id}
                </span>
                <span className="hidden sm:inline">{step.title.split(' ')[0]}</span>
              </button>
            ))}
          </div>

          {/* Navigation Buttons */}
          <div className="flex justify-center gap-4">
            <button
              onClick={prevStep}
              disabled={currentStep === 0}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
                currentStep === 0
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-white text-[#1B4F72] border-2 border-[#1B4F72] hover:bg-[#1B4F72] hover:text-white'
              }`}
            >
              <ChevronLeft size={18} /> Previous
            </button>
            <button
              onClick={nextStep}
              disabled={currentStep === steps.length - 1}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
                currentStep === steps.length - 1
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-[#1B4F72] text-white hover:bg-[#0F2F47]'
              }`}
            >
              Next <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {/* Step Content with Fade Animation */}
        <style>{`
          @keyframes fadeIn {
            from {
              opacity: 0;
              transform: translateY(10px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          .step-content {
            animation: fadeIn 0.5s ease-out;
          }
        `}</style>

        <div className="step-content bg-white rounded-xl shadow-lg p-8 md:p-12 mb-12">
          {/* Step Header */}
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-[#1B4F72] text-white flex items-center justify-center font-bold">
                {currentStepData.id}
              </div>
              <h2 className="text-3xl font-bold text-slate-900">{currentStepData.title}</h2>
            </div>
            <p className="text-lg text-slate-600">{currentStepData.description}</p>
            {currentStepData.badge && (
              <div className="mt-4 inline-block bg-green-100 text-green-800 px-4 py-2 rounded-full text-sm font-semibold">
                ✓ {currentStepData.badge}
              </div>
            )}
          </div>

          {/* SVG Visualization */}
          <div className="mb-10 flex justify-center">
            <div className="w-full max-w-2xl">
              {currentStepData.svgContent}
            </div>
          </div>

          {/* Stats Cards */}
          {currentStepData.stats && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              {currentStepData.stats.map((stat, idx) => (
                <div
                  key={idx}
                  className="bg-slate-50 border border-slate-200 rounded-lg p-6 text-center hover:shadow-md transition-shadow"
                >
                  <p className="text-sm font-medium text-slate-600 mb-2">{stat.label}</p>
                  <p className="text-2xl font-bold text-[#1B4F72]">{stat.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Data Sources for Enrichment Step */}
          {currentStepData.id === 3 && currentStepData.dataSources && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-8">
              {currentStepData.dataSources.map((source, idx) => (
                <div key={idx} className="bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-semibold text-slate-900 text-sm">{source.name}</span>
                  </div>
                  <p className="text-xs text-slate-600 mb-3 leading-snug">{source.fields}</p>
                  <span
                    className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${
                      source.color === 'green'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {source.badge}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Step Indicator Bar */}
        <div className="mb-12 bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm font-semibold text-slate-700">
              Step {currentStep + 1} of {steps.length}
            </span>
            <span className="text-sm text-slate-600">{currentStepData.title}</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2">
            <div
              className="bg-[#1B4F72] h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Data Sources Section */}
      <div className="bg-slate-50 border-t border-slate-200 py-12">
        <div className="max-w-6xl mx-auto px-6">
          <h3 className="text-2xl font-bold text-slate-900 mb-8">Data Sources & Licensing</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {dataSources.map((source, idx) => (
              <div key={idx} className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
                <h4 className="font-bold text-slate-900 mb-2">{source.name}</h4>
                <p className="text-sm text-slate-600 mb-3">
                  <span className="font-semibold">Organization:</span> {source.org}
                </p>
                <p className="text-sm text-slate-600 mb-3">
                  <span className="font-semibold">License:</span> {source.license}
                </p>
                <p className="text-sm text-slate-600 mb-4">
                  <span className="font-semibold">API Key:</span>{' '}
                  <span className={source.apiKeyNeeded ? 'text-orange-600' : 'text-green-600'}>
                    {source.apiKeyNeeded ? 'Required' : 'Not required'}
                  </span>
                </p>
                <a
                  href={source.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-[#1B4F72] font-semibold hover:underline"
                >
                  Learn more <ExternalLink size={14} />
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Technical Architecture Section */}
      <div className="bg-white border-t border-slate-200 py-12">
        <div className="max-w-6xl mx-auto px-6">
          <button
            onClick={() => setExpandedArchitecture(!expandedArchitecture)}
            className="flex items-center justify-between w-full p-6 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors mb-6"
          >
            <h3 className="text-2xl font-bold text-slate-900">Technical Architecture</h3>
            {expandedArchitecture ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
          </button>

          {expandedArchitecture && (
            <div className="space-y-4">
              {architectureDetails.map((item, idx) => (
                <div key={idx} className="bg-gradient-to-r from-slate-50 to-white border border-slate-200 rounded-lg p-6">
                  <h4 className="text-lg font-bold text-[#1B4F72] mb-2">{item.layer}</h4>
                  <p className="text-slate-700 mb-2">
                    <span className="font-semibold">Components:</span> {item.components}
                  </p>
                  <p className="text-slate-600">
                    <span className="font-semibold">Technology Stack:</span> {item.tech}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* CTA Footer */}
      <div className="bg-gradient-to-r from-[#1B4F72] to-[#0F2F47] text-white py-12">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <h3 className="text-2xl font-bold mb-3">Ready to transform your property data?</h3>
          <p className="text-lg opacity-90 mb-8">Get started with SHDT today and unlock actionable insights in minutes.</p>
          <button className="bg-white text-[#1B4F72] px-8 py-3 rounded-lg font-bold hover:bg-slate-100 transition-colors">
            Start Your Journey
          </button>
        </div>
      </div>
    </div>
  );
}
