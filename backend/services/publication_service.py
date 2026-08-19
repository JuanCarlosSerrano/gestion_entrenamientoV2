import json
import logging
from datetime import datetime

from flask import jsonify

try:
    from .whatsapp_service import (
        enviar_whatsapp,
        generar_mensaje_entrenamiento,
        normalizar_telefono_whatsapp,
    )
    from ..security.permissions import obtener_entrenamiento_asignado_autorizado
except ImportError:
    from services.whatsapp_service import (
        enviar_whatsapp,
        generar_mensaje_entrenamiento,
        normalizar_telefono_whatsapp,
    )
    from security.permissions import obtener_entrenamiento_asignado_autorizado


logger = logging.getLogger(__name__)


def estado_visibilidad_asignado(row):
    publicar_en = row.get("publicar_en") if isinstance(row, dict) else None
    visible = int(row.get("visible") or 0) if isinstance(row, dict) else 0
    if visible == 1:
        return "visible"
    if publicar_en:
        try:
            publicar_dt = datetime.fromisoformat(str(publicar_en).replace("Z", "+00:00"))
            if publicar_dt > datetime.now(publicar_dt.tzinfo):
                return "programado"
        except Exception:
            return "programado"
    return "oculto"


def normalizar_datetime_publicacion(valor):
    texto = (valor or "").strip()
    if not texto:
        return None
    try:
        return datetime.fromisoformat(texto.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        return None


def formato_fecha_whatsapp(valor):
    try:
        fecha = datetime.fromisoformat(str(valor).replace("Z", "+00:00"))
    except Exception:
        return str(valor or "")
    return fecha.strftime("%A %d").capitalize()


def resumen_whatsapp_entrenamiento(cur, asignado):
    cur.execute(
        """
        SELECT tipo_paso, objetivo_valor, unidad, zona, recuperacion_valor,
               recuperacion_unidad, descripcion
        FROM entrenamientos_asignados_detalle
        WHERE entrenamiento_asignado_id = ?
        ORDER BY
          CASE WHEN tipo_paso IN ('warmup', 'cooldown') THEN 1 ELSE 0 END,
          parent_id IS NOT NULL, orden, id
        LIMIT 1
        """,
        (asignado["id"],),
    )
    paso = cur.fetchone()
    paso = dict(paso) if paso else None
    resumen = ""
    if paso:
        partes = []
        if paso.get("descripcion"):
            partes.append(str(paso["descripcion"]))
        elif paso.get("objetivo_valor") and paso.get("unidad"):
            partes.append(f"{paso['objetivo_valor']}{paso['unidad']}")
        if paso.get("zona"):
            partes.append(str(paso["zona"]))
        if paso.get("recuperacion_valor"):
            rec_unidad = paso.get("recuperacion_unidad") or ""
            partes.append(f"Rec {paso['recuperacion_valor']}{rec_unidad}")
        resumen = " · ".join(partes)
    return resumen


def generar_mensaje_whatsapp_entrenamiento(cur, asignado):
    return generar_mensaje_entrenamiento(
        formato_fecha_whatsapp(asignado.get("fecha")),
        asignado.get("nombre") or "Entrenamiento",
        resumen_whatsapp_entrenamiento(cur, asignado),
    )


def registrar_envio_publicacion(cur, asignado, current_user, now):
    cur.execute(
        """
        SELECT id, mensaje_generado, estado, provider_message_id, error
        FROM entrenamientos_envios
        WHERE entrenamiento_asignado_id = ? AND canal = 'whatsapp'
          AND estado = 'enviado' AND provider_message_id IS NOT NULL
        ORDER BY id ASC
        LIMIT 1
        """,
        (asignado["id"],),
    )
    exitoso = cur.fetchone()
    if exitoso:
        envio = dict(exitoso)
        envio["idempotente"] = True
        return envio

    mensaje = generar_mensaje_whatsapp_entrenamiento(cur, asignado)
    telefono = normalizar_telefono_whatsapp(asignado.get("atleta_telefono"))
    resultado = enviar_whatsapp(telefono, mensaje)
    if resultado.get("ok"):
        estado = "enviado"
        sent_at = now
        error = None
        logger.info(
            "WhatsApp enviado entrenamiento_asignado_id=%s provider_message_id=%s",
            asignado["id"],
            resultado.get("provider_message_id"),
        )
    elif resultado.get("disabled"):
        estado = "deshabilitado"
        sent_at = None
        error = resultado.get("error")
    else:
        estado = "error"
        sent_at = None
        error = resultado.get("error")
        logger.warning(
            "Error WhatsApp entrenamiento_asignado_id=%s status=%s",
            asignado["id"],
            resultado.get("status_code"),
        )

    response_payload = resultado.get("response")
    if response_payload is not None:
        try:
            response_payload = json.dumps(response_payload, ensure_ascii=False)
        except TypeError:
            response_payload = str(response_payload)

    cur.execute(
        """
        SELECT id
        FROM entrenamientos_envios
        WHERE entrenamiento_asignado_id = ? AND canal = 'whatsapp'
        ORDER BY id ASC
        LIMIT 1
        """,
        (asignado["id"],),
    )
    existente = cur.fetchone()
    if existente:
        envio_id = dict(existente)["id"]
        cur.execute(
            """
            UPDATE entrenamientos_envios
            SET atleta_id = ?, entrenador_id = ?, telefono_destino = ?,
                mensaje_generado = ?, estado = ?, provider_message_id = ?,
                error = ?, url_publica = ?, sent_at = ?
            WHERE id = ?
            """,
            (
                asignado["atleta_id"],
                current_user["id"],
                telefono,
                mensaje,
                estado,
                resultado.get("provider_message_id"),
                error,
                response_payload,
                sent_at,
                envio_id,
            ),
        )
    else:
        cur.execute(
            """
            INSERT INTO entrenamientos_envios (
                entrenamiento_asignado_id, atleta_id, entrenador_id, canal,
                telefono_destino, mensaje_generado, estado, provider_message_id,
                error, url_publica, created_at, sent_at
            ) VALUES (?, ?, ?, 'whatsapp', ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                asignado["id"],
                asignado["atleta_id"],
                current_user["id"],
                telefono,
                mensaje,
                estado,
                resultado.get("provider_message_id"),
                error,
                response_payload,
                now,
                sent_at,
            ),
        )
        envio_id = cur.lastrowid
    return {
        "id": envio_id,
        "mensaje_generado": mensaje,
        "estado": estado,
        "provider_message_id": resultado.get("provider_message_id"),
        "error": error,
        "disabled": bool(resultado.get("disabled")),
    }


def _as_flask_error(error):
    return jsonify({"error": error["error"]}), error["status"]


def publicar_asignado(cur, current_user, asignado_id, now=None):
    now = now or datetime.now().isoformat(" ")
    asignado, error = obtener_entrenamiento_asignado_autorizado(cur, current_user, asignado_id, escritura=True)
    if error:
        return None, _as_flask_error(error)

    if int(asignado.get("visible") or 0) != 1 or not asignado.get("publicado_en"):
        cur.execute(
            """
            UPDATE entrenamientos_asignados
            SET visible = 1, publicar_en = NULL, publicado_en = COALESCE(publicado_en, ?),
                canal_comunicacion = 'whatsapp', updated_at = ?
            WHERE id = ?
            """,
            (now, now, asignado_id),
        )
        asignado["visible"] = 1
        asignado["publicado_en"] = asignado.get("publicado_en") or now
    envio = registrar_envio_publicacion(cur, asignado, current_user, now)
    cur.execute(
        """
        UPDATE entrenamientos_asignados
        SET estado_envio = ?, fecha_envio = COALESCE(fecha_envio, ?), updated_at = ?
        WHERE id = ?
        """,
        (envio.get("estado"), now if envio.get("estado") == "enviado" else None, now, asignado_id),
    )
    return {
        "id": asignado_id,
        "estado": "visible",
        "envio": envio,
    }, None


def programar_asignado(cur, current_user, asignado_id, publicar_en):
    publicar_dt = normalizar_datetime_publicacion(publicar_en)
    if not publicar_dt:
        return None, (jsonify({"error": "Fecha/hora de publicación inválida"}), 400)
    _, error = obtener_entrenamiento_asignado_autorizado(cur, current_user, asignado_id, escritura=True)
    if error:
        return None, _as_flask_error(error)
    now = datetime.now().isoformat(" ")
    cur.execute(
        """
        UPDATE entrenamientos_asignados
        SET visible = 0, publicar_en = ?, estado_envio = 'pendiente',
            fecha_envio = NULL, updated_at = ?
        WHERE id = ?
        """,
        (publicar_dt.isoformat(" "), now, asignado_id),
    )
    return {
        "id": asignado_id,
        "estado": "programado",
        "publicar_en": publicar_dt.isoformat(" "),
    }, None


def procesar_programadas_vencidas(cur, current_user):
    now = datetime.now().isoformat(" ")
    params = [now]
    where = ["COALESCE(ea.visible, 0) = 0", "ea.publicar_en IS NOT NULL", "ea.publicar_en <= ?"]
    if current_user["rol"] == "entrenador":
        where.append("u.entrenador_id = ?")
        params.append(current_user["id"])
    cur.execute(
        f"""
        SELECT ea.*
        FROM entrenamientos_asignados ea
        JOIN usuarios u ON u.id = ea.atleta_id
        WHERE {' AND '.join(where)}
        ORDER BY ea.publicar_en, ea.id
        """,
        tuple(params),
    )
    procesadas = []
    for row in cur.fetchall():
        result, error = publicar_asignado(cur, current_user, row["id"], now=now)
        if not error and result:
            procesadas.append(result)
    return procesadas
