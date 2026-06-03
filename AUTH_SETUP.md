# SHDT Authentication & Multi-Tenancy Setup Guide

## Overview

This document describes the authentication and multi-tenancy system for SHDT (Smart Historic Data Tracking). The system uses JWT tokens for authentication and implements role-based access control (RBAC) with organisation-level multi-tenancy.

## Architecture

### Database Schema

#### Organisations Table
- `id` (UUID): Primary key
- `name` (VARCHAR): Organisation name
- `slug` (VARCHAR, UNIQUE): URL-friendly identifier
- `logo_url` (VARCHAR): Optional logo URL
- `created_at` (TIMESTAMP): Creation timestamp

#### Users Table
- `id` (UUID): Primary key
- `email` (VARCHAR): User email address
- `password_hash` (VARCHAR): Bcrypt hashed password
- `name` (VARCHAR): User display name
- `role` (ENUM): admin, manager, or viewer
- `organisation_id` (UUID FK): References organisations
- `is_active` (BOOLEAN): Account status
- `created_at` (TIMESTAMP): Creation timestamp
- `last_login` (TIMESTAMP): Last login timestamp

**Indexes:**
- `idx_users_email`: For login queries
- `idx_users_organisation_id`: For organisation-scoped queries
- `idx_users_email_organisation`: Composite index for scoped lookups
- `unique_email_per_org`: Email is unique per organisation

#### Properties Table (Modified)
- `organisation_id` (UUID FK): Links properties to organisation

### Role Hierarchy

1. **Admin**: Full access to organisation, can manage users and properties
2. **Manager**: Can manage properties and view reports
3. **Viewer**: Read-only access to properties and reports

## Backend Implementation

### Dependencies

Add to `requirements.txt`:
```
fastapi>=0.104.0
python-jose[cryptography]>=3.3.0
bcrypt>=4.0.0
psycopg2-binary>=2.9.0
SQLAlchemy>=2.0.0
pydantic[email]>=2.0.0
```

### Environment Variables

Create `.env` file:
```
SECRET_KEY=your-secret-key-change-in-production-to-random-string
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

DB_HOST=localhost
DB_PORT=5432
DB_NAME=shdt
DB_USER=postgres
DB_PASSWORD=postgres
```

### Running Migrations

```bash
# 1. Run migration to create tables
psql -h localhost -U postgres -d shdt -f database/migrations/003_auth.sql

# 2. Seed database with default organisation and admin user
python data/seed_org.py
```

After seeding, you can login with:
- Email: `admin@shdt.local`
- Password: `changeme123`

**Important**: Change the admin password immediately after first login.

### API Endpoints

#### Authentication Endpoints

**POST /api/auth/register**
```json
{
  "email": "user@example.com",
  "password": "secure_password",
  "name": "User Name",
  "org_name": "Organisation Name"  // Optional, required for first user
}
```

Response:
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "token_type": "bearer",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "User Name",
    "role": "admin",
    "organisation_id": "uuid"
  }
}
```

**POST /api/auth/login**
```json
{
  "email": "admin@shdt.local",
  "password": "changeme123"
}
```

Response: Same as register

**POST /api/auth/refresh**
```json
{
  "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGc..."
}
```

Response: Returns new access token and user info

**GET /api/auth/me**

Requires: `Authorization: Bearer <access_token>`

Response:
```json
{
  "id": "uuid",
  "email": "admin@shdt.local",
  "name": "Admin User",
  "role": "admin",
  "organisation_id": "uuid"
}
```

#### Admin Endpoints

**GET /api/admin/users**

Requires: Admin role

Response:
```json
{
  "users": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "name": "User Name",
      "role": "viewer",
      "is_active": true,
      "created_at": "2024-03-17T10:00:00Z",
      "last_login": null
    }
  ],
  "total": 1
}
```

**POST /api/admin/users**

Requires: Admin role

```json
{
  "email": "newuser@example.com",
  "name": "New User",
  "role": "viewer"
}
```

Response:
```json
{
  "id": "uuid",
  "email": "newuser@example.com",
  "name": "New User",
  "role": "viewer",
  "message": "User invited. They should login with their email and the temporary password.",
  "temporary_password": "random_secure_password"
}
```

**PATCH /api/admin/users/{user_id}**

Requires: Admin role

```json
{
  "name": "Updated Name",
  "role": "manager"
}
```

Response: Updated user object

**DELETE /api/admin/users/{user_id}**

Requires: Admin role

Response: 204 No Content

### Middleware Usage

The auth middleware provides dependency functions for protecting routes:

```python
from fastapi import FastAPI, Depends
from server.middleware.auth import (
    get_current_user,
    require_admin,
    require_manager,
    CurrentUser
)

app = FastAPI()

@app.get("/api/protected")
async def protected_route(current_user: CurrentUser = Depends(get_current_user)):
    return {
        "message": f"Hello {current_user.name}",
        "organisation": current_user.org_id
    }

@app.get("/api/admin-only")
async def admin_only_route(current_user: CurrentUser = Depends(require_admin)):
    return {"message": "Admin access granted"}

@app.get("/api/manager-or-admin")
async def manager_route(current_user: CurrentUser = Depends(require_manager)):
    return {"message": "Manager access granted"}
```

## Frontend Implementation

### Setup

Install dependencies:
```bash
npm install react-router-dom
```

Environment variables (`.env`):
```
REACT_APP_API_URL=http://localhost:8000
```

### AuthContext Usage

The `AuthContext` provides all authentication state and methods:

```typescript
import { useAuth } from '../context/AuthContext';

function MyComponent() {
  const { user, accessToken, login, logout, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <p>Please login</p>;
  }

  return <p>Welcome {user?.name}!</p>;
}
```

### Protected Routes

Wrap routes that require authentication:

```typescript
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute, AdminOnly } from './components/ProtectedRoute';
import Login from './pages/Login';
import Map from './pages/Map';
import AdminPanel from './pages/AdminPanel';

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/map" element={<Map />} />
          <Route path="/admin/*" element={<AdminOnly><AdminPanel /></AdminOnly>} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
```

### Auto Token Refresh

The `AuthContext` automatically refreshes tokens every 25 minutes (before the 30-minute expiry). No manual intervention needed - tokens will be refreshed transparently in the background.

If refresh fails, the user is logged out automatically.

### API Requests with Authorization

Use the access token in request headers:

```typescript
const { accessToken } = useAuth();

const response = await fetch('http://localhost:8000/api/protected', {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});
```

## Security Considerations

### Password Hashing

Passwords are hashed using bcrypt with 12 rounds. Never store plain-text passwords.

### JWT Tokens

- **Access tokens**: 30-minute expiry, used for API requests
- **Refresh tokens**: 7-day expiry, used to obtain new access tokens
- Both tokens are stored in localStorage (consider using httpOnly cookies in production)

### Multi-Tenancy Isolation

- Every API query filters by `organisation_id` from the JWT token
- Users can only access data from their organisation
- Properties are assigned to organisations at the database level

### HTTPS Requirement

In production:
- Use HTTPS for all requests
- Set `secure` flag on JWT cookies
- Implement CORS properly
- Use environment-specific SECRET_KEY values

## Development Workflow

### 1. Initial Setup

```bash
# Run migrations
psql -h localhost -U postgres -d shdt -f database/migrations/003_auth.sql

# Seed default data
python data/seed_org.py

# Start backend
cd server && python main.py

# Start frontend
cd client && npm start
```

### 2. Testing Login

1. Navigate to http://localhost:3000/login
2. Use demo credentials:
   - Email: `admin@shdt.local`
   - Password: `changeme123`
3. Should redirect to `/map`

### 3. Adding New Users (Admin)

1. Call `POST /api/admin/users` with user details
2. Receive temporary password
3. User logs in and changes password (implementation pending)

### 4. Debugging

Check browser console for auth errors. JWT tokens can be decoded at https://jwt.io to inspect claims.

## Future Enhancements

1. **Email Verification**: Verify email addresses before activating accounts
2. **Password Reset**: Implement forgot password flow
3. **Two-Factor Authentication**: Add 2FA for admin accounts
4. **OAuth Integration**: Support Google/Azure login
5. **Activity Logging**: Track user actions for audit
6. **Invite Tokens**: More secure user invitations
7. **Session Management**: Track and revoke active sessions

## Troubleshooting

### "Invalid email or password" on login

- Verify credentials in database: `SELECT email, is_active FROM users;`
- Check password hash: `SELECT password_hash FROM users WHERE email='admin@shdt.local';`
- Re-seed if needed: `python data/seed_org.py`

### Token refresh failing

- Check SECRET_KEY matches between frontend and backend
- Verify refresh token hasn't expired (7 days)
- Check database connection

### Organisation isolation not working

- Verify `organisation_id` is in JWT token
- Check all queries include `WHERE organisation_id = :org_id`
- Verify properties have `organisation_id` set

## Files Created

1. `/sessions/relaxed-kind-darwin/mnt/dt/shdt/database/migrations/003_auth.sql` - Database schema
2. `/sessions/relaxed-kind-darwin/mnt/dt/shdt/server/routers/auth.py` - Auth endpoints
3. `/sessions/relaxed-kind-darwin/mnt/dt/shdt/server/middleware/auth.py` - JWT verification
4. `/sessions/relaxed-kind-darwin/mnt/dt/shdt/server/routers/admin.py` - Admin endpoints
5. `/sessions/relaxed-kind-darwin/mnt/dt/shdt/data/seed_org.py` - Seed script
6. `/sessions/relaxed-kind-darwin/mnt/dt/shdt/client/src/pages/Login.tsx` - Login form
7. `/sessions/relaxed-kind-darwin/mnt/dt/shdt/client/src/context/AuthContext.tsx` - Auth state
8. `/sessions/relaxed-kind-darwin/mnt/dt/shdt/client/src/components/ProtectedRoute.tsx` - Route protection
9. `/sessions/relaxed-kind-darwin/mnt/dt/shdt/client/src/styles/Login.css` - Login styling
