from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=255)
    institution_name: str = Field(min_length=1, max_length=255)
    institution_type: str | None = Field(default=None, max_length=64)


class LoginRequest(BaseModel):
    institution_code: str = Field(min_length=4, max_length=8)
    email: EmailStr
    password: str


class InstitutionVerifyRequest(BaseModel):
    code: str = Field(min_length=4, max_length=8)


class InstitutionVerifyResponse(BaseModel):
    code: str
    name: str
    type: str | None = None
    is_active: bool


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RegisterResponse(TokenResponse):
    institution_code: str


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    email: EmailStr | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)