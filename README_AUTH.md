# SHDT Authentication & Multi-Tenancy System

A complete, production-ready authentication and multi-tenancy system for SHDT (Smart Historic Data Tracking).

## Features

- JWT-based authentication with access and refresh tokens
- Role-based access control (Admin, Manager, Viewer)
- Organisation-level multi-tenancy with complete data isolation
- Secure password hashing with bcrypt (12 rounds)
- Automatic token refresh (every 25 minutes)
- Protected React routes with role validation
- Admin user management interface
- Clean, composable dependency injection
- TypeScript support throughout
- Production-ready error handling

## Quick Start

### 1. Database Setup (5 minutes)

```bash
# Apply migration
psql -h localhost -U postgres -d shdt -f database/migrations/003_auth.sql

# Seed default organisation and admin user
python data/seed_org.py
```

### 2. Backend Setup (5 minutes)

Add to `requirements.txt`:
```
fastapi>=0.104.0
python-jose[cryptography]>=3.3.0
bcrypt>=4.0.0
psycopg2-binary>=2.9.0
pydantic[email]>=2.0.0
```

Update your `main.py`:
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from server.middleware.auth import auth_middleware
from server.routers import auth, admin

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.middleware("http")(auth_middleware)
app.include_router(auth.router)
app.include_router(admin.router)

# Your other routers here...
```

Create `.env`:
```
SECRET_KEY=your-random-secret-key-at-least-32-characters
DB_HOST=localhost
DB_PORT=5432
DB_NAME=shdt
DB_USER=postgres
DB_PASSWORD=postgres
```

### 3. Frontend Setup (5 minutes)

```bash
npm install react-router-dom
```

Create `.env`:
```
REACT_APP_API_URL=http://localhost:8000
```

Update `main.tsx`:
```typescript
import { AuthProvider } from './context/AuthContext';

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

Update routes in `App.tsx`:
```typescript
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Map from './pages/Map';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/map" element={<Map />} />
      </Route>
      <Route path="*" element={<Navigate to="/map" replace />} />
    </Routes>
  );
}
```

### 4. Test It

1. Start backend: `python main.py`
2. Start frontend: `npm start`
3. Navigate to `http://localhost:3000/login`
4. Login with demo credentials:
   - Email: `admin@shdt.local`
   - Password: `changeme123`
5. Should redirect to `/map`

## API Endpoints

### Authentication

```
POST   /api/auth/register      Create account (first user creates org)
POST   /api/auth/login         Login with email/password
POST   /api/auth/refresh       Refresh access token
GET    /api/auth/me            Get current user profile
```

### Admin (Requires Admin Role)

```
GET    /api/admin/users        List organisation users
POST   /api/admin/users        Invite new user
PATCH  /api/admin/users/{id}   Update user role
DELETE /api/admin/users/{id}   Deactivate user
```

## Frontend Components

### AuthContext (State Management)

```typescript
import { useAuth } from './context/AuthContext';

function MyComponent() {
  const { user, login, logout, isAuthenticated } = useAuth();

  return isAuthenticated ? (
    <p>Welcome {user?.name}!</p>
  ) : (
    <p>Please login</p>
  );
}
```

### Protected Routes

```typescript
import ProtectedRoute from './components/ProtectedRoute';

<Routes>
  <Route element={<ProtectedRoute />}>
    <Route path="/map" element={<Map />} />
  </Route>
  <Route element={<ProtectedRoute requiredRole="admin" />}>
    <Route path="/admin" element={<AdminPanel />} />
  </Route>
</Routes>
```

### API Requests

```typescript
import { apiGet, apiPost } from './utils/api';
import { useAuth } from './context/AuthContext';

function MyComponent() {
  const { accessToken } = useAuth();

  const handleFetch = async () => {
    const data = await apiGet('/api/properties', accessToken);
    console.log(data);
  };

  return <button onClick={handleFetch}>Load Properties</button>;
}
```

## Backend: Protecting Routes

```python
from fastapi import APIRouter, Depends
from server.middleware.auth import get_current_user, require_admin, CurrentUser

router = APIRouter(prefix="/api")

@router.get("/properties")
async def list_properties(current_user: CurrentUser = Depends(get_current_user)):
    # current_user.user_id: User UUID
    # current_user.org_id: Organisation UUID
    # current_user.role: 'admin', 'manager', or 'viewer'
    return {"message": f"Hello {current_user.name}"}

@router.delete("/properties/{id}")
async def delete_property(
    property_id: str,
    current_user: CurrentUser = Depends(require_admin)  # Admin only
):
    # Only admins can access this
    return {"deleted": True}
```

## Database Schema

### Organisations

```sql
CREATE TABLE organisations (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE,
    logo_url VARCHAR(2048),
    created_at TIMESTAMP
);
```

### Users

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) CHECK (role IN ('admin', 'manager', 'viewer')),
    organisation_id UUID REFERENCES organisations,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP,
    last_login TIMESTAMP,
    UNIQUE (email, organisation_id)
);
```

### Properties (Modified)

```sql
ALTER TABLE properties ADD COLUMN organisation_id UUID REFERENCES organisations;
```

## Security

- **Passwords:** Hashed with bcrypt (12 rounds), never stored in plaintext
- **Tokens:** JWT with 30-minute expiry (access) and 7-day expiry (refresh)
- **Multi-tenancy:** Strict organisation-level isolation, all queries scoped to user's org
- **Roles:** Three-tier hierarchy - Admin > Manager > Viewer
- **HTTPS:** Required in production (configure CORS appropriately)

## Role Hierarchy

| Role | Permissions |
|------|-----------|
| Admin | Full access, manage users, manage properties |
| Manager | View/edit properties, view reports |
| Viewer | Read-only access |

## Default Credentials

After running `seed_org.py`:

- **Email:** `admin@shdt.local`
- **Password:** `changeme123`

**⚠️ Change this password immediately after first login!**

## Environment Variables

### Backend

```env
# Security
SECRET_KEY=your-random-secret-key-min-32-chars
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

### Frontend

```env
REACT_APP_API_URL=http://localhost:8000
REACT_APP_ENV=development
```

## File Locations

| File | Purpose |
|------|---------|
| `database/migrations/003_auth.sql` | Database schema |
| `server/routers/auth.py` | Authentication endpoints |
| `server/routers/admin.py` | Admin user management |
| `server/middleware/auth.py` | JWT verification |
| `data/seed_org.py` | Database initialization |
| `client/src/pages/Login.tsx` | Login form |
| `client/src/context/AuthContext.tsx` | Auth state management |
| `client/src/components/ProtectedRoute.tsx` | Route protection |
| `client/src/utils/api.ts` | API helpers |

## Documentation

- **AUTH_SETUP.md** - Complete setup guide
- **INTEGRATION_CHECKLIST.md** - Step-by-step integration
- **EXAMPLES.md** - Code examples and patterns
- **AUTHENTICATION_SYSTEM_SUMMARY.md** - System overview

## Common Tasks

### Add a Protected Endpoint

```python
from server.middleware.auth import get_current_user, require_admin, CurrentUser

@router.get("/api/secure")
async def secure_endpoint(current_user: CurrentUser = Depends(get_current_user)):
    return {"user_id": current_user.user_id}

@router.delete("/api/resource/{id}")
async def admin_only_endpoint(
    resource_id: str,
    current_user: CurrentUser = Depends(require_admin)
):
    return {"deleted": True}
```

### Invite a New User

```python
from server.middleware.auth import require_admin
from server.routers.admin import invite_user

# Via API: POST /api/admin/users
# {
#   "email": "user@example.com",
#   "name": "User Name",
#   "role": "viewer"
# }
```

### Check User Role in Frontend

```typescript
import { useAuth } from './context/AuthContext';

function MyComponent() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  if (!isAdmin) return <p>Admin only</p>;
  return <AdminPanel />;
}
```

### Make Authenticated API Request

```typescript
import { apiGet } from './utils/api';
import { useAuth } from './context/AuthContext';

const { accessToken } = useAuth();
const data = await apiGet('/api/protected', accessToken);
```

## Troubleshooting

### "Invalid token" error
- Check SECRET_KEY matches between frontend and backend
- Verify token hasn't expired (refresh after 30 minutes)
- Clear localStorage and login again

### CORS errors
- Update CORS_ORIGINS in backend .env
- Check preflight OPTIONS requests are allowed
- Verify frontend and backend URLs match environment

### Database errors
- Verify PostgreSQL is running
- Check credentials in .env file
- Ensure database exists: `psql -l`
- Run migration: `psql ... -f 003_auth.sql`

### Login fails with correct credentials
- Check if user exists: `SELECT * FROM users WHERE email='admin@shdt.local';`
- Verify is_active is TRUE
- Re-seed if needed: `python seed_org.py`

## Production Checklist

- [ ] Change SECRET_KEY to a strong random value
- [ ] Enable HTTPS for all requests
- [ ] Update CORS_ORIGINS to your domain
- [ ] Use environment-specific .env files
- [ ] Setup database backups
- [ ] Enable audit logging
- [ ] Setup monitoring and alerting
- [ ] Change default admin password
- [ ] Configure rate limiting
- [ ] Review and lock down database access
- [ ] Setup SSL certificates
- [ ] Enable database encryption at rest

## Future Enhancements

- Email verification for new users
- Password reset flow
- Two-factor authentication for admins
- OAuth/SSO integration (Google, Azure)
- Activity audit logging
- Session management and revocation
- Advanced permission scoping
- Team-based access control
- API key authentication for services

## Support

For issues or questions:
1. Check EXAMPLES.md for code patterns
2. Review INTEGRATION_CHECKLIST.md for setup steps
3. Consult AUTH_SETUP.md for detailed documentation
4. Check browser console and server logs for errors

---

**System ready to use!** 🚀 Follow the Quick Start section to begin.
