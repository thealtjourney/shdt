# Authentication & Multi-Tenancy Integration Checklist

## Backend Integration

### 1. Update main.py / app.py

Add auth middleware and routers:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from server.middleware.auth import auth_middleware
from server.routers import auth, admin

app = FastAPI()

# Add CORS middleware (configure for production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add auth middleware
app.middleware("http")(auth_middleware)

# Include routers
app.include_router(auth.router)
app.include_router(admin.router)

# Include existing routers with auth dependency
# app.include_router(properties.router)  # Wrap with auth

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

### 2. Update requirements.txt

```
fastapi>=0.104.0
python-jose[cryptography]>=3.3.0
bcrypt>=4.0.0
psycopg2-binary>=2.9.0
SQLAlchemy>=2.0.0
pydantic[email]>=2.0.0
uvicorn[standard]>=0.24.0
```

### 3. Update Database Connection

Ensure your database connection module is available as a dependency:

```python
# server/database.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os

DATABASE_URL = f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}:{os.getenv('DB_PORT')}/{os.getenv('DB_NAME')}"

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

### 4. Wrap Existing Routers with Auth

Example for properties router:

```python
from fastapi import APIRouter, Depends
from server.middleware.auth import get_current_user, CurrentUser

router = APIRouter(prefix="/api/properties", tags=["properties"])

@router.get("/")
async def list_properties(
    current_user: CurrentUser = Depends(get_current_user),
    db = Depends(get_db)
):
    # Query will automatically filter by organisation_id
    result = db.execute(
        text("""
            SELECT * FROM properties
            WHERE organisation_id = :org_id
        """),
        {"org_id": current_user.org_id}
    )
    return result.fetchall()
```

### 5. Run Migrations

```bash
# Create tables and indexes
psql -h localhost -U postgres -d shdt -f database/migrations/003_auth.sql

# Seed default organisation and admin
python data/seed_org.py
```

### 6. Test Auth Endpoints

```bash
# Register/Login
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@shdt.local",
    "password": "changeme123"
  }'

# Use returned access_token
curl http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer <access_token>"
```

## Frontend Integration

### 1. Update main.tsx/index.tsx

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
```

### 2. Update App.tsx Routes

```typescript
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Map from './pages/Map';
import AdminPanel from './pages/AdminPanel';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/map" element={<Map />} />
        <Route path="/admin/*" element={<AdminPanel />} />
      </Route>
      <Route path="*" element={<Navigate to="/map" replace />} />
    </Routes>
  );
}

export default App;
```

### 3. Update API Client

Create a utility for API requests with auth:

```typescript
// src/utils/api.ts
import { useAuth } from '../context/AuthContext';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

export async function apiCall(
  endpoint: string,
  options: RequestInit = {}
) {
  const { accessToken } = useAuth();

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'API request failed');
  }

  return response.json();
}
```

### 4. Update package.json

```json
{
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "react-router-dom": "^6.0.0"
  }
}
```

### 5. Test Login

```bash
# Start frontend
cd client
npm start
# Navigate to http://localhost:3000/login
# Use: admin@shdt.local / changeme123
```

## Environment Setup

### Backend .env

```
# API
SECRET_KEY=your-production-secret-key-here-change-this
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=shdt
DB_USER=postgres
DB_PASSWORD=postgres

# CORS
CORS_ORIGINS=http://localhost:3000,http://localhost:8000
```

### Frontend .env

```
REACT_APP_API_URL=http://localhost:8000
REACT_APP_ENV=development
```

## Security Checklist

- [ ] Change default admin password after first login
- [ ] Use strong SECRET_KEY in production (at least 32 characters)
- [ ] Enable HTTPS in production
- [ ] Configure CORS properly for your domain
- [ ] Add rate limiting to auth endpoints
- [ ] Implement refresh token rotation
- [ ] Add email verification for new users
- [ ] Set secure SameSite cookies
- [ ] Enable password requirements validation
- [ ] Add admin audit logging
- [ ] Implement account lockout after failed attempts
- [ ] Add two-factor authentication for admins
- [ ] Regular security audits and dependency updates

## Testing Scenarios

### Basic Flow
1. [ ] Navigate to /login
2. [ ] Login with admin@shdt.local / changeme123
3. [ ] Should redirect to /map
4. [ ] User profile should show in nav/header
5. [ ] Access token should be stored in localStorage

### Token Refresh
1. [ ] Login successfully
2. [ ] Wait 30+ minutes or manually expire token
3. [ ] Make API request
4. [ ] Should refresh automatically and succeed
5. [ ] Old token should be replaced in localStorage

### Multi-Tenancy
1. [ ] Create second organisation via register
2. [ ] Create users in both orgs with same email (should work)
3. [ ] Login as user in org1
4. [ ] User should only see org1's properties
5. [ ] Admin endpoints should only show org1's users

### Admin Functions
1. [ ] As admin, navigate to /admin/users
2. [ ] List all users in organisation
3. [ ] Invite new user
4. [ ] Update user role
5. [ ] Deactivate user
6. [ ] Cannot deactivate last admin

### Role-Based Access
1. [ ] Viewer cannot access /admin
2. [ ] Manager can view but not modify users
3. [ ] Admin can modify all
4. [ ] Logout clears tokens
5. [ ] Cannot access protected routes without token

## Deployment Checklist

- [ ] Run migrations on production database
- [ ] Seed production organisation and admin
- [ ] Set production SECRET_KEY
- [ ] Configure production CORS
- [ ] Enable HTTPS
- [ ] Setup database backups
- [ ] Configure logging and monitoring
- [ ] Test all auth flows in production
- [ ] Document password reset procedure
- [ ] Plan user onboarding workflow
- [ ] Setup alerting for failed logins
- [ ] Review and lock down database access

## Common Issues & Solutions

### "Invalid token" errors
- Verify SECRET_KEY matches between frontend and backend
- Check token hasn't expired
- Ensure Authorization header format: `Bearer <token>`

### CORS errors
- Update CORS_ORIGINS in backend .env
- Check browser console for actual error
- Verify preflight OPTIONS requests are allowed

### Database connection fails
- Check PostgreSQL is running
- Verify credentials in .env
- Check database exists: `psql -l`

### Tokens not persisting
- Check browser localStorage is enabled
- Look for third-party cookie restrictions
- Try private/incognito mode to test

## Support Files Location

- Migrations: `/sessions/relaxed-kind-darwin/mnt/dt/shdt/database/migrations/003_auth.sql`
- Auth Router: `/sessions/relaxed-kind-darwin/mnt/dt/shdt/server/routers/auth.py`
- Auth Middleware: `/sessions/relaxed-kind-darwin/mnt/dt/shdt/server/middleware/auth.py`
- Admin Router: `/sessions/relaxed-kind-darwin/mnt/dt/shdt/server/routers/admin.py`
- Seed Script: `/sessions/relaxed-kind-darwin/mnt/dt/shdt/data/seed_org.py`
- Login Page: `/sessions/relaxed-kind-darwin/mnt/dt/shdt/client/src/pages/Login.tsx`
- Auth Context: `/sessions/relaxed-kind-darwin/mnt/dt/shdt/client/src/context/AuthContext.tsx`
- Protected Route: `/sessions/relaxed-kind-darwin/mnt/dt/shdt/client/src/components/ProtectedRoute.tsx`
- Login CSS: `/sessions/relaxed-kind-darwin/mnt/dt/shdt/client/src/styles/Login.css`
- Setup Guide: `/sessions/relaxed-kind-darwin/mnt/dt/shdt/AUTH_SETUP.md`
