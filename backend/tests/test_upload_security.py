from io import BytesIO

from werkzeug.datastructures import FileStorage

from backend.security.uploads import is_allowed_fit_upload, is_allowed_image_upload


def _file_storage(filename, mimetype):
    return FileStorage(stream=BytesIO(b"test"), filename=filename, content_type=mimetype)


def test_image_upload_accepts_supported_images():
    assert is_allowed_image_upload(_file_storage("perfil.webp", "image/webp"))
    assert is_allowed_image_upload(_file_storage("perfil.jpg", "image/jpeg"))


def test_image_upload_rejects_extension_or_mimetype_mismatch():
    assert not is_allowed_image_upload(_file_storage("perfil.svg", "image/svg+xml"))
    assert not is_allowed_image_upload(_file_storage("perfil.png", "application/octet-stream"))


def test_fit_upload_accepts_fit_files():
    assert is_allowed_fit_upload(_file_storage("actividad.fit", "application/octet-stream"))
    assert is_allowed_fit_upload(_file_storage("actividad.fit", "application/vnd.ant.fit"))


def test_fit_upload_rejects_non_fit_files():
    assert not is_allowed_fit_upload(_file_storage("actividad.gpx", "application/octet-stream"))
    assert not is_allowed_fit_upload(_file_storage("actividad.fit", "text/plain"))
