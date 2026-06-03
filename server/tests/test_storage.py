"""Tests for the Storage abstraction (LocalFilesystem implementation)."""
from __future__ import annotations

import io
import pytest

from storage import LocalFilesystemStorage, StorageError


@pytest.fixture
def storage(tmp_path):
    return LocalFilesystemStorage(tmp_path)


def test_put_and_get_bytes(storage):
    obj = storage.put_bytes("hello.txt", b"world", content_type="text/plain")
    assert obj.key == "hello.txt"
    assert obj.size == 5
    assert obj.content_type == "text/plain"
    assert storage.get_bytes("hello.txt") == b"world"


def test_put_stream(storage):
    src = io.BytesIO(b"abcdefghij" * 100)
    obj = storage.put_stream("large.bin", src)
    assert obj.size == 1000
    assert storage.exists("large.bin")


def test_overwrite(storage):
    storage.put_bytes("k", b"first")
    storage.put_bytes("k", b"second")
    assert storage.get_bytes("k") == b"second"


def test_exists_and_delete(storage):
    storage.put_bytes("foo", b"x")
    assert storage.exists("foo")
    storage.delete("foo")
    assert not storage.exists("foo")


def test_delete_missing_is_idempotent(storage):
    storage.delete("never-existed")  # must not raise


def test_get_missing_raises(storage):
    with pytest.raises(StorageError):
        storage.get_bytes("nope")


def test_traversal_rejected(storage):
    with pytest.raises(StorageError):
        storage.put_bytes("../escape.txt", b"x")


def test_list_with_prefix(storage):
    storage.put_bytes("a/1", b"x")
    storage.put_bytes("a/2", b"x")
    storage.put_bytes("b/1", b"x")
    keys = sorted(o.key for o in storage.list("a"))
    assert keys == ["a/1", "a/2"]


def test_url_for_returns_file_uri(storage):
    storage.put_bytes("k", b"x")
    url = storage.url_for("k")
    assert url.startswith("file://")
