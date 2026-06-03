# SHDT System Architecture

## Overview

SHDT (Supportive Housing Data Tracker) is a full-stack web application designed to manage and track data for supportive housing systems. The architecture follows a modern three-tier model with containerized services for production deployment.

## Technology Stack

### Backend
- **Framework**: FastAPI (Python 3.11)
- **Server**: Gunicorn + Uvicorn workers
- **Database**: PostgreSQL with PostGIS extensions
- **ORM**: SQLAlchemy
- **API Documentation**: Swagger/OpenAPI
- **Task Queue**: Celery (optional)
- **Authentication**: JWT tokens

### Frontend
- **Framework**: React 18
- **State Management**: Redux or Context API
- **HTTP Client**: Axios
- **Build Tool**: Webpack (via Create React App)
- **Styling**: CSS/SCSS with CSS Modules

### Infrastructure
- **Containerization**: Docker & Docker Compose
- **Web Server**: Nginx
- **Reverse Proxy**: Nginx with SSL/TLS
- **Database Cache**: Redis (optional)
- **Orchestration**: Docker Compose (single-host) or Kubernetes (multi-host)

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Internet / Users                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    Nginx Load Balancer                           │
│  - SSL/TLS Termination (HTTPS)                                   │
│  - Static Asset Serving                                          │
│  - Reverse Proxy to Backend                                      │
│  - Request Compression (gzip)                                    │
│  - Security Headers                                              │
└────────┬─────────────────────────────┬──────────────────────────┘
         │                             │
    ┌────▼─────┐              ┌────────▼──────┐
    │ Frontend  │              │    Backend    │
    │  (React)  │              │   (FastAPI)   │
    │           │              │               │
    │ - UI/UX   │◄────JSON────►│ - API Endpoints
    │ - State   │              │ - Business Logic
    │ - Routing │              │ - Data Validation
    └───────────┘              │ - Auth/Permissions
                               │ - Logging
                               │ - Error Handling
                               └────────┬───────┘
                                        │
                         ┌──────────────┼──────────────┐
                         │                             │
                    ┌────▼──────┐          ┌──────────▼────┐
                    │ PostgreSQL │          │  File Storage │
                    │ + PostGIS  │          │  (Optional)   │
                    │            │          │               │
                    │ - Housing  │          │ - Uploads     │
                    │   Data     │          │ - Backups     │
                    │ - Locations│          │ - Exports     │
                    │ - User Info│          │               │
                    │ - Logs     │          │               │
                    └────────────┘          └───────────────┘
```

## Component Details

### 1. Nginx Reverse Proxy

**Responsibilities:**
- SSL/TLS termination for secure HTTPS connections
- Static file serving (React build assets)
- Request compression and caching
- Load balancing between backend instances
- Security headers injection
- Request logging and monitoring

**Configuration:**
- Port 80: Redirects to HTTPS
- Port 443: Handles HTTPS traffic
- `/api/*` paths proxied to FastAPI backend
- Static assets cached with long TTLs
- WebSocket support for real-time features

### 2. Frontend (React)

**Responsibilities:**
- User interface and user experience
- Client-side routing and navigation
- Form validation and error handling
- State management for application data
- Local storage for preferences/tokens

**Key Directories:**
- `/src/components`: React components
- `/src/pages`: Page components
- `/src/services`: API client logic
- `/src/hooks`: Custom React hooks
- `/src/utils`: Helper functions

**Build Process:**
- Development: `npm start` with hot reload
- Production: `npm run build` creates optimized bundle

### 3. FastAPI Backend

**Responsibilities:**
- RESTful API endpoints
- Database operations via SQLAlchemy ORM
- User authentication and authorization
- Business logic and data validation
- Error handling and logging
- Request/response serialization

**Project Structure:**
```
server/
├── main.py                 # Application entry point
├── requirements.txt        # Python dependencies
├── app/
│   ├── __init__.py
│   ├── models/            # SQLAlchemy models
│   ├── schemas/           # Pydantic schemas
│   ├── routes/            # API endpoints
│   ├── services/          # Business logic
│   ├── middleware/        # Middleware (auth, logging, etc.)
│   ├── utils/             # Helper functions
│   └── config.py          # Configuration
├── db/
│   ├── init.sql           # Database initialization
│   ├── migrations/        # Alembic migrations
│   └── backup/            # Backup files
├── logs/                  # Application logs
├── tests/                 # Test suite
└── scripts/               # Utility scripts
```

**Key Features:**
- JWT token-based authentication
- Rate limiting
- CORS handling
- Database connection pooling
- Request validation with Pydantic
- Comprehensive logging

### 4. PostgreSQL Database

**Database Name:** `shdt_db`

**Key Tables:**

| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `users` | User authentication and info | id, email, password_hash, role, created_at |
| `housing_units` | Housing properties/units | id, name, address, coordinates (PostGIS), status |
| `occupancy` | Current and historical occupancy | id, unit_id, resident_count, capacity, updated_at |
| `household_data` | Household information | id, unit_id, head_of_household, members, income, special_needs |
| `address_geocoding` | Cached geocoding results | id, address, latitude, longitude, geocoded_at |
| `audit_logs` | Activity tracking | id, user_id, action, entity, changes, timestamp |
| `import_logs` | Data import history | id, filename, row_count, status, timestamp |
| `api_sessions` | User sessions | id, user_id, token, expires_at, last_activity |

**Spatial Features:**
- PostGIS extension enabled for geographic queries
- Geometry column in housing_units table
- Spatial indexing for efficient location-based searches
- Buffer queries for proximity analysis

**Backup and Recovery:**
- Daily automated backups via `pg_dump`
- Backups stored with timestamp: `shdt_YYYYMMDD_HHMMSS.sql`
- Point-in-time recovery available
- Volume-based persistence in Docker

## Data Flow

### User Registration/Authentication Flow
```
User Input
    ↓
React Form → Frontend Validation
    ↓
POST /api/auth/register
    ↓
FastAPI Endpoint
    ↓
Pydantic Schema Validation
    ↓
SQLAlchemy ORM → PostgreSQL
    ↓
JWT Token Generation
    ↓
Response to Frontend
    ↓
Token Storage (localStorage)
```

### Housing Data Import Flow
```
CSV File Upload
    ↓
Frontend Validation (size, format)
    ↓
POST /api/import/upload
    ↓
Backend Storage (temporary)
    ↓
Parse CSV
    ↓
Geocode Addresses (batch)
    ↓
Validate Data
    ↓
Database Transaction
    ↓
Import Status Response
    ↓
Log Results
```

### Geographic Query Flow
```
Frontend Map/Location Query
    ↓
GET /api/housing?location=lat,lng&radius=5
    ↓
FastAPI Route Handler
    ↓
Build PostGIS Query (ST_DWithin)
    ↓
Execute Spatial Query
    ↓
Format Results
    ↓
Return GeoJSON to Frontend
    ↓
Render on Map
```

## Deployment Architecture

### Docker Compose Services

**Container Network:** `shdt_network`

| Service | Image | Purpose | Port |
|---------|-------|---------|------|
| postgres | postgis:15-3.3 | Database | 5432 |
| backend | custom:python3.11 | FastAPI server | 8000 |
| frontend | custom:node18+nginx | React app | 3000 |
| nginx | nginx:alpine | Reverse proxy | 80, 443 |

### Volume Mounts

| Volume | Mount Point | Purpose |
|--------|-------------|---------|
| postgres_data | /var/lib/postgresql/data | Database persistence |
| ./server/logs | /app/logs | Backend application logs |
| ./client/logs | /var/log/nginx | Frontend/nginx logs |
| ./nginx/ssl | /etc/nginx/ssl | SSL certificates |

### Health Checks

Each service includes configured health checks:
- **PostgreSQL**: `pg_isready` command
- **Backend**: HTTP GET to `/health` endpoint
- **Frontend**: HTTP GET to `/` with nginx
- **Nginx**: HTTP GET to `/health` endpoint

## Security Architecture

### Network Security
- Services communicate via isolated Docker network
- Nginx handles all external traffic with SSL/TLS
- Internal traffic unencrypted (private network)
- Firewall rules restrict external access to ports 80/443

### Application Security
- JWT token-based API authentication
- Password hashing with bcrypt
- CORS restrictions on API endpoints
- CSRF protection via token verification
- Input validation and sanitization
- SQL injection prevention via ORM

### Data Security
- Database backups encrypted and stored securely
- Sensitive config in environment variables
- SSL certificates for HTTPS
- Secret key rotation support
- Audit logging for compliance

## Scaling Considerations

### Horizontal Scaling
- Run multiple backend instances behind load balancer
- Use separate PostgreSQL server (not containerized)
- Centralized Redis for session/cache management
- Kubernetes for orchestration

### Vertical Scaling
- Increase Gunicorn workers: `GUNICORN_WORKERS`
- Adjust PostgreSQL connection pools
- Increase Nginx worker connections
- Allocate more container resources

### Database Optimization
- Create indexes on frequently queried columns
- Partition large tables by date/region
- Implement query caching with Redis
- Regular VACUUM and ANALYZE operations
- Connection pooling with PgBouncer

## Monitoring and Observability

### Logging
- Application logs in JSON format
- Structured logging for parsing
- Separate logs per service
- Rotation to prevent disk fill

### Metrics
- Request/response times
- Error rates and types
- Database query performance
- Resource utilization (CPU, memory)
- API endpoint usage statistics

### Alerting
- Health check failures
- High error rates
- Slow query detection
- Disk space warnings
- Certificate expiration alerts

## Development vs Production

### Key Differences

| Aspect | Development | Production |
|--------|-------------|-----------|
| SSL/TLS | Self-signed or none | Let's Encrypt |
| Debug | true | false |
| Log Level | DEBUG | INFO |
| Database | Single container | Managed PostgreSQL |
| Backups | Manual | Automated daily |
| Gunicorn Workers | 1 | 4+ |
| Cache | In-memory | Redis |
| Error Pages | Verbose | Generic |
| Monitoring | Basic | Comprehensive |

## Related Documentation

- **DEPLOYMENT.md**: Step-by-step production deployment
- **DATA_GUIDE.md**: CSV format and data import specifications
- **USER_GUIDE.md**: End-user feature documentation
