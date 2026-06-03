"""Tests for the SecretsProvider abstraction."""
from __future__ import annotations

import os

import pytest

from config.secrets import (
    DotenvSecrets,
    EnvSecrets,
    SecretMissing,
)


def test_env_secrets_reads_environment(monkeypatch):
    monkeypatch.setenv("SHDT_TEST_KEY", "hello")
    secrets = EnvSecrets()
    assert secrets.get("SHDT_TEST_KEY") == "hello"


def test_env_secrets_default(monkeypatch):
    monkeypatch.delenv("SHDT_TEST_KEY_MISSING", raising=False)
    secrets = EnvSecrets()
    assert secrets.get("SHDT_TEST_KEY_MISSING", default="fallback") == "fallback"


def test_env_secrets_required_raises(monkeypatch):
    monkeypatch.delenv("SHDT_TEST_KEY_MISSING", raising=False)
    secrets = EnvSecrets()
    with pytest.raises(SecretMissing):
        secrets.get("SHDT_TEST_KEY_MISSING", required=True)


@pytest.mark.parametrize("raw,expected", [
    ("true", True),
    ("True", True),
    ("1", True),
    ("yes", True),
    ("on", True),
    ("false", False),
    ("0", False),
    ("no", False),
    ("", False),
])
def test_get_bool(monkeypatch, raw, expected):
    monkeypatch.setenv("SHDT_BOOL", raw)
    assert EnvSecrets().get_bool("SHDT_BOOL") is expected


def test_get_int(monkeypatch):
    monkeypatch.setenv("SHDT_INT", "42")
    assert EnvSecrets().get_int("SHDT_INT") == 42


def test_get_int_returns_none_when_unset(monkeypatch):
    monkeypatch.delenv("SHDT_INT_MISSING", raising=False)
    assert EnvSecrets().get_int("SHDT_INT_MISSING") is None
