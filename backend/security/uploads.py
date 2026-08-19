import os

from werkzeug.utils import secure_filename


def is_allowed_image_upload(file_storage):
    if not file_storage or not file_storage.filename:
        return False
    filename = secure_filename(file_storage.filename)
    ext = os.path.splitext(filename)[1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
        return False
    mimetype = (file_storage.mimetype or "").lower()
    return mimetype in {"image/jpeg", "image/png", "image/webp"}


def is_allowed_fit_upload(file_storage):
    if not file_storage or not file_storage.filename:
        return False
    filename = secure_filename(file_storage.filename)
    ext = os.path.splitext(filename)[1].lower()
    if ext != ".fit":
        return False
    mimetype = (file_storage.mimetype or "").lower()
    return mimetype in {"", "application/octet-stream", "application/vnd.ant.fit"}
