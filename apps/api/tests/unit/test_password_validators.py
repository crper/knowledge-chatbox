from __future__ import annotations

import pydantic
import pytest
from pydantic import ValidationError

from knowledge_chatbox_api.schemas._validators import (
    PasswordStr,
    _validate_password_complexity,
)


class TestValidatePasswordComplexity:
    def test_rejects_lowercase_only(self):
        with pytest.raises(ValueError, match="at least 3"):
            _validate_password_complexity("abcdefgh")

    def test_rejects_uppercase_only(self):
        with pytest.raises(ValueError, match="at least 3"):
            _validate_password_complexity("ABCDEFGH")

    def test_rejects_digits_only(self):
        with pytest.raises(ValueError, match="at least 3"):
            _validate_password_complexity("12345678")

    def test_rejects_special_only(self):
        with pytest.raises(ValueError, match="at least 3"):
            _validate_password_complexity("!@#$%^&*")

    def test_rejects_two_categories(self):
        with pytest.raises(ValueError, match="at least 3"):
            _validate_password_complexity("abcd1234")

    def test_accepts_three_categories(self):
        assert _validate_password_complexity("Admin123") == "Admin123"

    def test_accepts_four_categories(self):
        assert _validate_password_complexity("Admin123!") == "Admin123!"

    def test_passes_through_short_password(self):
        assert _validate_password_complexity("abc") == "abc"


class TestPasswordStr:
    def test_rejects_short_password(self):
        with pytest.raises(ValidationError):
            pydantic.TypeAdapter(PasswordStr).validate_python("abc")

    def test_accepts_valid_password(self):
        result = pydantic.TypeAdapter(PasswordStr).validate_python("Admin123")
        assert result == "Admin123"

    def test_rejects_weak_password(self):
        with pytest.raises(ValidationError):
            pydantic.TypeAdapter(PasswordStr).validate_python("abcdefgh")
