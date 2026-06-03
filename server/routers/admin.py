from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, EmailStr
from typing import List
from uuid import uuid4
from datetime import datetime
import bcrypt
from sqlalchemy import text

from ..middleware.auth import get_current_user, require_admin, CurrentUser

router = APIRouter(prefix="/api/admin", tags=["admin"])

# Models
class UserBase(BaseModel):
    email: EmailStr
    name: str
    role: str

class UserCreateRequest(BaseModel):
    email: EmailStr
    name: str
    role: str = "viewer"

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    is_active: bool
    created_at: str
    last_login: str = None

    class Config:
        from_attributes = True

class UserListResponse(BaseModel):
    users: List[UserResponse]
    total: int

class UserUpdateRequest(BaseModel):
    name: str = None
    role: str = None

@router.get("/users", response_model=UserListResponse)
async def list_users(
    current_user: CurrentUser = Depends(require_admin),
    db = Depends(lambda: None)
):
    """
    List all users in the current organisation.
    Only admins can access this endpoint.
    """
    try:
        result = db.execute(
            text("""
                SELECT id, email, name, role, is_active, created_at, last_login
                FROM users
                WHERE organisation_id = :org_id
                ORDER BY created_at DESC
            """),
            {"org_id": current_user.org_id}
        ).fetchall()

        users = [
            UserResponse(
                id=row[0],
                email=row[1],
                name=row[2],
                role=row[3],
                is_active=row[4],
                created_at=row[5].isoformat() if row[5] else None,
                last_login=row[6].isoformat() if row[6] else None
            )
            for row in result
        ]

        return UserListResponse(users=users, total=len(users))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.post("/users", response_model=dict)
async def invite_user(
    request: UserCreateRequest,
    current_user: CurrentUser = Depends(require_admin),
    db = Depends(lambda: None)
):
    """
    Invite a new user to the organisation.
    - Admin only
    - Generates temporary password (user should change on first login)
    """
    try:
        # Check if user already exists in this org
        existing = db.execute(
            text("""
                SELECT id FROM users
                WHERE email = :email AND organisation_id = :org_id
            """),
            {"email": request.email, "org_id": current_user.org_id}
        ).first()

        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User already exists in this organisation"
            )

        # Generate temporary password
        import secrets
        temp_password = secrets.token_urlsafe(16)
        password_hash = bcrypt.hashpw(temp_password.encode(), bcrypt.gensalt(rounds=12)).decode()

        user_id = str(uuid4())
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
                "role": request.role,
                "organisation_id": current_user.org_id
            }
        )
        db.commit()

        return {
            "id": user_id,
            "email": request.email,
            "name": request.name,
            "role": request.role,
            "message": "User invited. They should login with their email and the temporary password.",
            "temporary_password": temp_password  # In production, send via email
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    request: UserUpdateRequest,
    current_user: CurrentUser = Depends(require_admin),
    db = Depends(lambda: None)
):
    """
    Update user information (name, role).
    Admin only. Can only update users in their organisation.
    """
    try:
        # Verify user belongs to same org
        user_result = db.execute(
            text("""
                SELECT id, email, name, role, is_active, created_at, last_login
                FROM users
                WHERE id = :id AND organisation_id = :org_id
            """),
            {"id": user_id, "org_id": current_user.org_id}
        ).first()

        if not user_result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        # Update fields
        updates = {}
        if request.name:
            updates["name"] = request.name
        if request.role:
            if request.role not in ("admin", "manager", "viewer"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid role"
                )
            updates["role"] = request.role

        if updates:
            set_clause = ", ".join([f"{k} = :{k}" for k in updates.keys()])
            updates["id"] = user_id
            db.execute(
                text(f"UPDATE users SET {set_clause} WHERE id = :id"),
                updates
            )
            db.commit()

        # Fetch updated user
        updated = db.execute(
            text("""
                SELECT id, email, name, role, is_active, created_at, last_login
                FROM users
                WHERE id = :id
            """),
            {"id": user_id}
        ).first()

        return UserResponse(
            id=updated[0],
            email=updated[1],
            name=updated[2],
            role=updated[3],
            is_active=updated[4],
            created_at=updated[5].isoformat() if updated[5] else None,
            last_login=updated[6].isoformat() if updated[6] else None
        )
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_user(
    user_id: str,
    current_user: CurrentUser = Depends(require_admin),
    db = Depends(lambda: None)
):
    """
    Deactivate a user account.
    Admin only. Cannot deactivate the last admin in organisation.
    """
    try:
        # Verify user belongs to same org
        user_result = db.execute(
            text("""
                SELECT id, role FROM users
                WHERE id = :id AND organisation_id = :org_id
            """),
            {"id": user_id, "org_id": current_user.org_id}
        ).first()

        if not user_result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        user_role = user_result[1]

        # Check if this is the last admin
        if user_role == "admin":
            admin_count = db.execute(
                text("""
                    SELECT COUNT(*) FROM users
                    WHERE organisation_id = :org_id AND role = 'admin' AND is_active = TRUE
                """),
                {"org_id": current_user.org_id}
            ).scalar()

            if admin_count == 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot deactivate the last admin in the organisation"
                )

        # Deactivate user
        db.execute(
            text("UPDATE users SET is_active = FALSE WHERE id = :id"),
            {"id": user_id}
        )
        db.commit()

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
