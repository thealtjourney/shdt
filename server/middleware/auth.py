from fastapi import HTTPException, status, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthCredentials
from jose import JWTError, jwt
import os
from typing import Optional, Callable
from functools import wraps

# Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"

security = HTTPBearer()

class CurrentUser:
    """Current user context"""
    def __init__(self, user_id: str, org_id: str, email: str, name: str, role: str):
        self.user_id = user_id
        self.org_id = org_id
        self.email = email
        self.name = name
        self.role = role

    def is_admin(self) -> bool:
        return self.role == "admin"

    def is_manager(self) -> bool:
        return self.role in ("admin", "manager")

    def is_viewer(self) -> bool:
        return self.role in ("admin", "manager", "viewer")

def verify_token(token: str) -> dict:
    """Verify JWT token and return payload"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None

async def get_current_user(credentials: HTTPAuthCredentials = Depends(security)) -> CurrentUser:
    """
    Dependency to get current authenticated user.
    Extracts user info from JWT token.
    """
    token = credentials.credentials
    payload = verify_token(token)

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    org_id = payload.get("org_id")

    if not user_id or not org_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token claims",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Note: In production, you'd fetch user details from DB here
    # For now, we trust the JWT payload
    return CurrentUser(
        user_id=user_id,
        org_id=org_id,
        email=payload.get("email", ""),
        name=payload.get("name", ""),
        role=payload.get("role", "viewer")
    )

async def require_admin(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """Dependency to require admin role"""
    if not current_user.is_admin():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user

async def require_manager(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """Dependency to require manager or admin role"""
    if not current_user.is_manager():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Manager access required"
        )
    return current_user

async def require_viewer(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """Dependency to require at least viewer access"""
    if not current_user.is_viewer():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    return current_user

async def optional_user(request: Request) -> Optional[CurrentUser]:
    """
    Optional user dependency - doesn't fail if no auth provided.
    Useful for public endpoints that can be accessed with or without auth.
    """
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        return None

    token = auth_header.split(" ")[1]
    payload = verify_token(token)

    if not payload:
        return None

    return CurrentUser(
        user_id=payload.get("sub"),
        org_id=payload.get("org_id"),
        email=payload.get("email", ""),
        name=payload.get("name", ""),
        role=payload.get("role", "viewer")
    )

async def auth_middleware(request: Request, call_next):
    """
    Middleware to attach user info to request state.
    Can be used for automatic auth injection.
    """
    auth_header = request.headers.get("authorization", "")

    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        payload = verify_token(token)

        if payload:
            request.state.user = CurrentUser(
                user_id=payload.get("sub"),
                org_id=payload.get("org_id"),
                email=payload.get("email", ""),
                name=payload.get("name", ""),
                role=payload.get("role", "viewer")
            )
        else:
            request.state.user = None
    else:
        request.state.user = None

    response = await call_next(request)
    return response

def get_user_from_request(request: Request) -> Optional[CurrentUser]:
    """Helper to extract user from request state"""
    return getattr(request.state, "user", None)

def require_user_from_request(request: Request) -> CurrentUser:
    """Helper to require user from request state"""
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )
    return user
