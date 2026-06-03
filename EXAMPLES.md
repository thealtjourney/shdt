# Authentication & Multi-Tenancy Implementation Examples

## Frontend Examples

### Example 1: Using Auth Context in Components

```typescript
import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export function Header() {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <header>
      <div className="header-content">
        <h1>SHDT</h1>
        <div className="user-menu">
          <span>Welcome, {user?.name}</span>
          <button onClick={handleLogout}>Logout</button>
        </div>
      </div>
    </header>
  );
}
```

### Example 2: Making API Requests with Auth

```typescript
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiGet, getErrorMessage } from '../utils/api';

export function PropertiesList() {
  const { accessToken } = useAuth();
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProperties = async () => {
      try {
        const data = await apiGet('/api/properties', accessToken);
        setProperties(data);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };

    if (accessToken) {
      fetchProperties();
    }
  }, [accessToken]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <ul>
      {properties.map((property: any) => (
        <li key={property.id}>{property.name}</li>
      ))}
    </ul>
  );
}
```

### Example 3: Role-Based UI Rendering

```typescript
import React from 'react';
import { useAuth } from '../context/AuthContext';
import { AdminPanel } from './AdminPanel';

export function Dashboard() {
  const { user } = useAuth();

  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'manager' || isAdmin;

  return (
    <div className="dashboard">
      <h1>Dashboard</h1>

      {/* Show to all users */}
      <section>
        <h2>Properties Overview</h2>
        {/* Property list */}
      </section>

      {/* Show to managers and admins */}
      {isManager && (
        <section>
          <h2>Analytics</h2>
          {/* Analytics data */}
        </section>
      )}

      {/* Show to admins only */}
      {isAdmin && (
        <section>
          <AdminPanel />
        </section>
      )}
    </div>
  );
}
```

### Example 4: Admin User Management

```typescript
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost, apiPatch, apiDelete, getErrorMessage } from '../utils/api';

export function UserManagement() {
  const { accessToken, user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newUser, setNewUser] = useState({ email: '', name: '', role: 'viewer' });

  useEffect(() => {
    fetchUsers();
  }, [accessToken]);

  const fetchUsers = async () => {
    try {
      const data = await apiGet('/api/admin/users', accessToken);
      setUsers(data.users);
    } catch (err) {
      console.error('Failed to fetch users:', getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiPost('/api/admin/users', newUser, accessToken);
      setNewUser({ email: '', name: '', role: 'viewer' });
      await fetchUsers();
    } catch (err) {
      alert(getErrorMessage(err));
    }
  };

  const handleUpdateRole = async (userId: string, newRole: string) => {
    try {
      await apiPatch(`/api/admin/users/${userId}`, { role: newRole }, accessToken);
      await fetchUsers();
    } catch (err) {
      alert(getErrorMessage(err));
    }
  };

  const handleDeactivateUser = async (userId: string) => {
    if (!confirm('Are you sure?')) return;
    try {
      await apiDelete(`/api/admin/users/${userId}`, accessToken);
      await fetchUsers();
    } catch (err) {
      alert(getErrorMessage(err));
    }
  };

  if (!user?.role || user.role !== 'admin') {
    return <div>Access denied</div>;
  }

  return (
    <div className="user-management">
      <h2>User Management</h2>

      <form onSubmit={handleAddUser} className="invite-form">
        <input
          type="email"
          placeholder="Email"
          value={newUser.email}
          onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
          required
        />
        <input
          type="text"
          placeholder="Name"
          value={newUser.name}
          onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
          required
        />
        <select
          value={newUser.role}
          onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
        >
          <option value="viewer">Viewer</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
        </select>
        <button type="submit">Invite User</button>
      </form>

      {loading ? (
        <p>Loading users...</p>
      ) : (
        <table className="users-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Role</th>
              <th>Last Login</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u: any) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{u.name}</td>
                <td>
                  <select
                    value={u.role}
                    onChange={(e) => handleUpdateRole(u.id, e.target.value)}
                  >
                    <option value="viewer">Viewer</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td>{u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}</td>
                <td>
                  <button onClick={() => handleDeactivateUser(u.id)}>Deactivate</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

## Backend Examples

### Example 1: Protecting API Routes

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from server.middleware.auth import get_current_user, require_admin, CurrentUser

router = APIRouter(prefix="/api/properties", tags=["properties"])

# Public endpoint (no auth)
@router.get("/public")
async def public_properties():
    return {"message": "This is public"}

# Authenticated endpoint (any logged-in user)
@router.get("/")
async def list_properties(
    current_user: CurrentUser = Depends(get_current_user),
    db = Depends(get_db)
):
    """List properties for current organisation"""
    result = db.execute(
        text("""
            SELECT id, name, address, organisation_id
            FROM properties
            WHERE organisation_id = :org_id
            ORDER BY name
        """),
        {"org_id": current_user.org_id}
    ).fetchall()
    return [dict(row) for row in result]

# Admin-only endpoint
@router.delete("/{property_id}")
async def delete_property(
    property_id: str,
    current_user: CurrentUser = Depends(require_admin),
    db = Depends(get_db)
):
    """Delete a property (admin only)"""
    # Verify property belongs to user's org
    result = db.execute(
        text("""
            SELECT id FROM properties
            WHERE id = :id AND organisation_id = :org_id
        """),
        {"id": property_id, "org_id": current_user.org_id}
    ).first()

    if not result:
        raise HTTPException(status_code=404, detail="Property not found")

    db.execute(text("DELETE FROM properties WHERE id = :id"), {"id": property_id})
    db.commit()
    return {"message": "Property deleted"}

# Endpoint with role-based logic
@router.patch("/{property_id}")
async def update_property(
    property_id: str,
    update_data: PropertyUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db = Depends(get_db)
):
    """Update property - managers can update, viewers can only view"""
    if not current_user.is_manager():
        raise HTTPException(status_code=403, detail="Manager access required")

    # Verify property belongs to user's org
    result = db.execute(
        text("""
            SELECT id FROM properties
            WHERE id = :id AND organisation_id = :org_id
        """),
        {"id": property_id, "org_id": current_user.org_id}
    ).first()

    if not result:
        raise HTTPException(status_code=404, detail="Property not found")

    # Update only allowed fields
    db.execute(
        text("""
            UPDATE properties
            SET name = :name, address = :address, updated_at = NOW()
            WHERE id = :id
        """),
        {
            "id": property_id,
            "name": update_data.name,
            "address": update_data.address
        }
    )
    db.commit()
    return {"message": "Property updated"}
```

### Example 2: Multi-Tenancy Query Pattern

```python
from server.middleware.auth import get_current_user, CurrentUser
from fastapi import Depends
from sqlalchemy import text

async def list_users_in_org(
    current_user: CurrentUser = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Always filter by organisation_id from the authenticated user.
    This ensures data isolation between organisations.
    """
    query = """
        SELECT id, email, name, role, created_at
        FROM users
        WHERE organisation_id = :org_id
        AND is_active = TRUE
        ORDER BY created_at DESC
    """

    result = db.execute(
        text(query),
        {"org_id": current_user.org_id}
    ).fetchall()

    return [dict(row) for row in result]

async def get_property_analytics(
    property_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Pattern: Always JOIN through organisation to ensure multi-tenancy
    """
    query = """
        SELECT p.id, p.name, COUNT(m.id) as measurement_count
        FROM properties p
        LEFT JOIN measurements m ON p.id = m.property_id
        WHERE p.id = :property_id
        AND p.organisation_id = :org_id
        GROUP BY p.id, p.name
    """

    result = db.execute(
        text(query),
        {"property_id": property_id, "org_id": current_user.org_id}
    ).first()

    if not result:
        raise HTTPException(status_code=404, detail="Property not found")

    return dict(result)
```

### Example 3: Audit Logging

```python
from datetime import datetime
from sqlalchemy import text

async def log_user_action(
    db,
    user_id: str,
    org_id: str,
    action: str,
    resource_type: str,
    resource_id: str,
    details: dict = None
):
    """Log user actions for audit trail"""
    db.execute(
        text("""
            INSERT INTO audit_logs (
                user_id, organisation_id, action, resource_type,
                resource_id, details, created_at
            )
            VALUES (
                :user_id, :org_id, :action, :resource_type,
                :resource_id, :details, :created_at
            )
        """),
        {
            "user_id": user_id,
            "org_id": org_id,
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "details": details,
            "created_at": datetime.utcnow()
        }
    )
    db.commit()

# Usage in endpoint
@router.post("/properties")
async def create_property(
    request: PropertyCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db = Depends(get_db)
):
    property_id = str(uuid4())

    db.execute(
        text("""
            INSERT INTO properties (id, name, organisation_id)
            VALUES (:id, :name, :org_id)
        """),
        {"id": property_id, "name": request.name, "org_id": current_user.org_id}
    )
    db.commit()

    # Log the action
    await log_user_action(
        db,
        user_id=current_user.user_id,
        org_id=current_user.org_id,
        action="CREATE",
        resource_type="property",
        resource_id=property_id,
        details={"name": request.name}
    )

    return {"id": property_id}
```

### Example 4: Custom Dependency for Org-Scoped Data

```python
from typing import Optional
from fastapi import Depends, HTTPException, status
from sqlalchemy import text

async def get_organisation(
    current_user: CurrentUser = Depends(get_current_user),
    db = Depends(get_db)
):
    """Get current user's organisation"""
    result = db.execute(
        text("SELECT id, name, slug FROM organisations WHERE id = :id"),
        {"id": current_user.org_id}
    ).first()

    if not result:
        raise HTTPException(status_code=404, detail="Organisation not found")

    return dict(result)

async def get_org_property(
    property_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db = Depends(get_db)
):
    """Get property that belongs to user's organisation"""
    result = db.execute(
        text("""
            SELECT * FROM properties
            WHERE id = :id AND organisation_id = :org_id
        """),
        {"id": property_id, "org_id": current_user.org_id}
    ).first()

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Property not found"
        )

    return dict(result)

# Usage
@router.get("/properties/{property_id}")
async def get_property(
    property: dict = Depends(get_org_property),
    current_user: CurrentUser = Depends(get_current_user)
):
    """Automatically validates property belongs to user's org"""
    return property

@router.get("/org/info")
async def get_org_info(
    org: dict = Depends(get_organisation)
):
    """Get organisation information"""
    return org
```

## Testing Examples

### Example 1: Test Protected Endpoint

```python
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_protected_endpoint_without_auth():
    """Should return 403 without auth"""
    response = client.get("/api/properties")
    assert response.status_code == 403

def test_protected_endpoint_with_auth(auth_token):
    """Should return 200 with valid auth"""
    response = client.get(
        "/api/properties",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response.status_code == 200

def test_admin_only_endpoint(viewer_token):
    """Should return 403 for non-admin"""
    response = client.delete(
        "/api/properties/123",
        headers={"Authorization": f"Bearer {viewer_token}"}
    )
    assert response.status_code == 403
```

### Example 2: Test Multi-Tenancy Isolation

```python
def test_user_cannot_access_other_org_data(client, org1_user_token, org2_property_id):
    """User from org1 should not see org2's properties"""
    response = client.get(
        f"/api/properties/{org2_property_id}",
        headers={"Authorization": f"Bearer {org1_user_token}"}
    )
    assert response.status_code == 404
```

## Deployment Configuration Examples

### Example nginx Configuration

```nginx
server {
    listen 80;
    server_name api.shdt.example.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # CORS headers
        add_header 'Access-Control-Allow-Origin' 'https://app.shdt.example.com' always;
        add_header 'Access-Control-Allow-Credentials' 'true' always;
    }
}
```

### Example Docker Setup

```dockerfile
# Dockerfile for backend
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  db:
    image: postgres:15
    environment:
      POSTGRES_DB: shdt
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data

  backend:
    build: .
    environment:
      SECRET_KEY: ${SECRET_KEY}
      DB_HOST: db
    depends_on:
      - db
    ports:
      - "8000:8000"

  frontend:
    build: ./client
    environment:
      REACT_APP_API_URL: http://localhost:8000
    ports:
      - "3000:3000"

volumes:
  postgres_data:
```
