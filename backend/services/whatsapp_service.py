import os
import re
import json
import socket
import urllib.error
import urllib.request

try:
    import requests  # type: ignore
except ImportError:
    class _FallbackTimeout(Exception):
        pass

    class _FallbackRequestException(Exception):
        pass

    class _FallbackResponse:
        def __init__(self, status_code, text):
            self.status_code = status_code
            self.text = text

        def json(self):
            return json.loads(self.text)

    class _RequestsFallback:
        Timeout = _FallbackTimeout
        RequestException = _FallbackRequestException

        @staticmethod
        def post(url, headers=None, json=None, timeout=10):
            data = None if json is None else __import__("json").dumps(json).encode("utf-8")
            req = urllib.request.Request(url, data=data, headers=headers or {}, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=timeout) as response:
                    return _FallbackResponse(response.status, response.read().decode("utf-8"))
            except socket.timeout as exc:
                raise _FallbackTimeout() from exc
            except urllib.error.HTTPError as exc:
                return _FallbackResponse(exc.code, exc.read().decode("utf-8"))
            except urllib.error.URLError as exc:
                raise _FallbackRequestException(str(exc)) from exc

    requests = _RequestsFallback()


FINAL_MESSAGE = "Consulta el entrenamiento completo en MindPace."


def whatsapp_enabled():
    return os.getenv("WHATSAPP_ENABLED", "false").strip().lower() in ("1", "true", "yes", "on")


def normalizar_telefono_whatsapp(telefono):
    if not telefono:
        return None
    digits = re.sub(r"\D+", "", str(telefono))
    if not digits:
        return None
    return digits


def generar_mensaje_entrenamiento(fecha_label, nombre, resumen=None):
    lineas = [
        f"🏃 {fecha_label or ''}".strip(),
        "",
        nombre or "Entrenamiento",
    ]
    if resumen:
        lineas.append(resumen)
    lineas.extend(["", FINAL_MESSAGE])
    return "\n".join(lineas)


def enviar_whatsapp(numero, mensaje):
    numero_normalizado = normalizar_telefono_whatsapp(numero)
    if not whatsapp_enabled():
        return {
            "ok": False,
            "disabled": True,
            "provider_message_id": None,
            "status_code": None,
            "response": None,
            "error": "WhatsApp deshabilitado",
        }
    if not numero_normalizado:
        return {
            "ok": False,
            "provider_message_id": None,
            "status_code": None,
            "response": None,
            "error": "Teléfono no válido para WhatsApp",
        }

    access_token = os.getenv("WHATSAPP_ACCESS_TOKEN", "").strip()
    phone_number_id = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "").strip()
    api_version = os.getenv("WHATSAPP_API_VERSION", "v23.0").strip() or "v23.0"
    if not access_token or not phone_number_id:
        return {
            "ok": False,
            "provider_message_id": None,
            "status_code": None,
            "response": None,
            "error": "Configuración WhatsApp incompleta",
        }

    url = f"https://graph.facebook.com/{api_version}/{phone_number_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": numero_normalizado,
        "type": "text",
        "text": {"body": mensaje},
    }
    try:
        response = requests.post(
            url,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=10,
        )
        try:
            response_data = response.json()
        except ValueError:
            response_data = {"text": response.text}
        provider_id = None
        messages = response_data.get("messages") if isinstance(response_data, dict) else None
        if isinstance(messages, list) and messages:
            provider_id = messages[0].get("id")
        if 200 <= response.status_code < 300 and provider_id:
            return {
                "ok": True,
                "provider_message_id": provider_id,
                "status_code": response.status_code,
                "response": response_data,
                "error": None,
            }
        return {
            "ok": False,
            "provider_message_id": provider_id,
            "status_code": response.status_code,
            "response": response_data,
            "error": str(response_data),
        }
    except requests.Timeout:
        return {
            "ok": False,
            "provider_message_id": None,
            "status_code": None,
            "response": None,
            "error": "Timeout enviando WhatsApp",
        }
    except requests.RequestException as exc:
        return {
            "ok": False,
            "provider_message_id": None,
            "status_code": None,
            "response": None,
            "error": str(exc),
        }
