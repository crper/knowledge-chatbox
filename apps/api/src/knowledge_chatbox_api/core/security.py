"""安全核心模块。"""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from jwt import ExpiredSignatureError, InvalidTokenError


class PasswordManager:
    """封装密码哈希与校验逻辑。"""

    def __init__(self) -> None:
        self._hasher = PasswordHasher()

    def hash_password(self, password: str) -> str:
        """对密码进行哈希。"""
        return self._hasher.hash(password)

    def verify_password(self, password_hash: str, password: str) -> tuple[bool, str | None]:
        """校验密码是否匹配。"""
        try:
            verified = self._hasher.verify(password_hash, password)
        except VerifyMismatchError:
            return False, None

        updated_hash = None
        if verified and self._hasher.check_needs_rehash(password_hash):
            updated_hash = self._hasher.hash(password)

        return verified, updated_hash


def generate_session_token() -> str:
    """生成随机会话令牌。"""
    return secrets.token_urlsafe(32)


def hash_session_token(token: str) -> str:
    """计算会话令牌的哈希值。"""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_access_token(
    *,
    algorithm: str,
    expires_in_minutes: int,
    issued_at: datetime | None = None,
    role: str,
    secret_key: str,
    user_id: int,
) -> str:
    """生成 access token。"""
    now = issued_at or datetime.now(UTC)
    payload = {
        "exp": int((now + timedelta(minutes=expires_in_minutes)).timestamp()),
        "iat": int(now.timestamp()),
        "role": role,
        "sub": str(user_id),
        "typ": "access",
    }
    return jwt.encode(payload, secret_key, algorithm=algorithm)


def decode_access_token(*, algorithm: str, secret_key: str, token: str) -> dict[str, object]:
    """校验并解析 access token。"""
    try:
        payload = jwt.decode(
            token,
            secret_key,
            algorithms=[algorithm],
            options={"require": ["exp", "iat", "sub", "typ"]},
        )
    except ExpiredSignatureError as error:
        raise ValueError("Token expired.") from error
    except InvalidTokenError as error:
        raise ValueError("Invalid token.") from error

    if payload.get("typ") != "access":
        raise ValueError("Invalid token type.")

    return payload
