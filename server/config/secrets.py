"""
SecretsProvider — single interface for reading configuration values.

The aim is to keep call sites identical regardless of whether secrets come
from a local .env file (development), the process environment (CI), or
Azure Key Vault (production).

Usage:

    from config import get_secrets
    secrets = get_secrets()
    db_url = secrets.get("DATABASE_URL")
    smtp_pw = secrets.get("SMTP_PASSWORD", required=True)

The active provider is chosen by the SECRETS_BACKEND env var:
    SECRETS_BACKEND=dotenv  (default — reads .env then process env)
    SECRETS_BACKEND=env     (process env only — typical for CI / containers)
    SECRETS_BACKEND=keyvault (Azure Key Vault)

When using keyvault, set:
    AZURE_KEY_VAULT_URL=https://<vault-name>.vault.azure.net/

The Azure SDK is imported lazily so that local installs do not need it.
"""
from __future__ import annotations

import os
import threading
from abc import ABC, abstractmethod
from typing import Any


class SecretMissing(KeyError):
    """Raised when a required secret cannot be resolved."""


class SecretsProvider(ABC):
    """Abstract interface every backend implements."""

    @abstractmethod
    def get(self, key: str, default: Any = None, *, required: bool = False) -> Any:
        ...

    def get_int(self, key: str, default: int | None = None, *, required: bool = False) -> int | None:
        v = self.get(key, default=default, required=required)
        return int(v) if v is not None else None

    def get_bool(self, key: str, default: bool = False) -> bool:
        v = self.get(key, default=str(default))
        if isinstance(v, bool):
            return v
        return str(v).strip().lower() in {"1", "true", "yes", "on", "y", "t"}


class EnvSecrets(SecretsProvider):
    """Reads only the process environment. Used in containers / CI."""

    def get(self, key: str, default: Any = None, *, required: bool = False) -> Any:
        v = os.environ.get(key, default)
        if required and (v is None or v == ""):
            raise SecretMissing(f"Required secret '{key}' is not set")
        return v


class DotenvSecrets(EnvSecrets):
    """
    Reads .env (via python-dotenv) into the process environment, then defers
    to EnvSecrets. Default for local development.
    """

    def __init__(self, dotenv_path: str | None = None) -> None:
        try:
            from dotenv import load_dotenv
        except ImportError:  # pragma: no cover - python-dotenv is in requirements
            load_dotenv = None  # type: ignore
        if load_dotenv is not None:
            load_dotenv(dotenv_path=dotenv_path, override=False)


class AzureKeyVaultSecrets(SecretsProvider):
    """
    Reads from Azure Key Vault. Falls back to env on miss so per-secret
    overrides during local debugging are still possible.

    Lazy-imports azure-identity / azure-keyvault-secrets so that the package is
    only required in environments that actually use it. Add these to a
    requirements-azure.txt rather than the base requirements.txt.
    """

    def __init__(self, vault_url: str | None = None) -> None:
        self.vault_url = vault_url or os.environ.get("AZURE_KEY_VAULT_URL")
        if not self.vault_url:
            raise RuntimeError(
                "AzureKeyVaultSecrets requires AZURE_KEY_VAULT_URL or vault_url"
            )
        self._client = None
        self._lock = threading.Lock()
        self._cache: dict[str, str] = {}

    def _client_lazy(self):  # pragma: no cover - exercised only in Azure
        if self._client is not None:
            return self._client
        with self._lock:
            if self._client is None:
                from azure.identity import DefaultAzureCredential
                from azure.keyvault.secrets import SecretClient

                self._client = SecretClient(
                    vault_url=self.vault_url,
                    credential=DefaultAzureCredential(),
                )
        return self._client

    def get(self, key: str, default: Any = None, *, required: bool = False) -> Any:
        # Allow per-process env overrides (useful for debugging)
        env_v = os.environ.get(key)
        if env_v is not None and env_v != "":
            return env_v

        if key in self._cache:
            return self._cache[key]

        # Key Vault names cannot contain underscores; convention: replace _ with -
        kv_name = key.replace("_", "-").lower()
        try:  # pragma: no cover - exercised only in Azure
            client = self._client_lazy()
            secret = client.get_secret(kv_name)
            self._cache[key] = secret.value
            return secret.value
        except Exception as e:
            if required:
                raise SecretMissing(
                    f"Required secret '{key}' could not be resolved from Key Vault: {e}"
                ) from e
            return default


# ── Singleton accessor ──────────────────────────────────────
_provider_singleton: SecretsProvider | None = None
_provider_lock = threading.Lock()


def get_secrets() -> SecretsProvider:
    """Return the configured provider, picking based on SECRETS_BACKEND env."""
    global _provider_singleton
    if _provider_singleton is not None:
        return _provider_singleton
    with _provider_lock:
        if _provider_singleton is None:
            backend = os.environ.get("SECRETS_BACKEND", "dotenv").lower()
            if backend == "env":
                _provider_singleton = EnvSecrets()
            elif backend == "keyvault":
                _provider_singleton = AzureKeyVaultSecrets()
            else:
                _provider_singleton = DotenvSecrets()
    return _provider_singleton


__all__ = [
    "SecretsProvider",
    "SecretMissing",
    "EnvSecrets",
    "DotenvSecrets",
    "AzureKeyVaultSecrets",
    "get_secrets",
]
