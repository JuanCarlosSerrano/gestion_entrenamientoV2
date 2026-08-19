import hashlib

from backend.services.fit_service import hash_file_sha256


def test_hash_file_sha256(tmp_path):
    fit_file = tmp_path / "actividad.fit"
    fit_file.write_bytes(b"mindpace-fit-test")

    assert hash_file_sha256(fit_file) == hashlib.sha256(b"mindpace-fit-test").hexdigest()
