from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, EmailStr
from datetime import datetime, timedelta
from typing import Optional
import uuid
import bcrypt
from jose import JWTError, jwt
import os
from sqlalchemy import text

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7

# Models
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
    org_name: Optional[str] = None  # For first user registration

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: dict

class UserProfile(BaseModel):
    id: str
    email: str
    name: str
    role: str
    organisation_id: str

class RefreshTokenRequest(BaseModel):
    refresh_token: str

# Utility functions
def hash_password(password: str) -> str:
    """Hash password using bcrypt"""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode(), salt).decode()

def verify_password(password: str, password_hash: str) -> bool:
    """Verify password against hash"""
    return bcrypt.checkpw(password.encode(), password_hash.encode())

def create_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create JWT token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(token: str) -> dict:
    """Verify JWT token"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None

async def get_db():
    """Placeholder for database dependency"""
    # This will be injected by the main app
    pass

@router.post("/register", response_model=TokenResponse)
async def register(request: RegisterRequest, db = Depends(get_db)):
    """
    Register a new user.
    - First user can create a new organisation (admin)
    - Existing organisations require admin invitation
    """
    try:
        # Check if user exists in any organisation
        result = db.execute(
            text("SELECT id FROM users WHERE email = :email"),
            {"email": request.email}
        ).first()

        if result:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )

        user_id = str(uuid.uuid4())
        org_id = str(uuid.uuid4())
        password_hash = hash_password(request.password)

        # First user creates organisation
        if request.org_name:
            org_slug = request.org_name.lower().replace(" ", "-")
            db.execute(
                text("""
                    INSERT INTO organisations (id, name, slug)
                    VALUES (:id, :name, :slug)
                """),
                {"id": org_id, "name": request.org_name, "slug": org_slug}
            )
        else:
            # Use default organisation (created by seed)
            result = db.execute(
                text("SELECT id FROM organisations LIMIT 1")
            ).first()
            if not result:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="No organisation found. Please provide org_name for first registration."
                )
            org_id = result[0]

        # Create user
        db.execute(
            text("""
                INSERT INTO users (id, email, password_hash, name, role, organisation_id)
                VALUES (:id, :email, :password_hash, :name, :role, :organisation_id)
            """),
            {
                "id": user_id,
                "email": request.email,
                "password_hash": password_hash,
                "name": request.name,
                "role": "admin" if request.org_name else "viewer",
                "organisation_id": org_id
            }
        )
        db.commit()

        # Create tokens
        access_token = create_token(
            {"sub": user_id, "org_id": org_id},
            timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        refresh_token = create_token(
            {"sub": user_id, "org_id": org_id, "type": "refresh"},
            timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        )

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            user={
                "id": user_id,
                "email": request.email,
                "name": request.name,
                "role": "admin" if request.org_name else "viewer",
                "organisation_id": org_id
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest, db = Depends(get_db)):
    """Login with email and password"""
    try:
        result = db.execute(
            text("""
                SELECT id, password_hash, name, role, organisation_id, is_active
                FROM users
                WHERE email = :email
            """),
            {"email": request.email}
        ).first()

        if not result:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )

        user_id, password_hash, name, role, org_id, is_active = result

        if not is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is deactivated"
            )

        if not verify_password(request.password, password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )

        # Update last_login
        db.execute(
            text("UPDATE users SET last_login = :now WHERE id = :id"),
            {"now": datetime.utcnow(), "id": user_id}
        )
        db.commit()

        # Create tokens
        access_token = create_token(
            {"sub": user_id, "org_id": org_id},
            timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        refresh_token = create_token(
            {"sub": user_id, "org_id": org_id, "type": "refresh"},
            timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        )

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            user={
                "id": user_id,
                "email": request.email,
                "name": name,
                "role": role,
                "organisation_id": org_id
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.post("/refresh", response_model=TokenResponse)
async def refresh(request: RefreshTokenRequest, db = Depends(get_db)):
    """Refresh access token using refresh token"""
    try:
        payload = verify_token(request.refresh_token)
        if not payload or payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token"
            )

        user_id = payload.get("sub")
        org_id = payload.get("org_id")

        result = db.execute(
            text("SELECT email, name, role FROM users WHERE id = :id"),
            {"id": user_id}
        ).first()

        if not result:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )

        email, name, role = result

        access_token = create_token(
            {"sub": user_id, "org_id": org_id},
            timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        )

        return TokenResponse(
            access_token=access_token,
            refresh_token=request.refresh_token,
            user={
                "id": user_id,
                "email": email,
                "name": name,
                "role": role,
                "organisation_id": org_id
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )

@router.get("/me", response_model=UserProfile)
async def get_current_user(db = Depends(get_db)):
    """Get current user profile"""
    # This will be intercepted by auth middleware
    # The user info should be in request.state.user
    pass
