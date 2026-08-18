import hashlib
import warnings


def parse_fit_metrics_fitparse(file_path):
    try:
        from fitparse import FitFile  # type: ignore
    except Exception as exc:
        raise RuntimeError('fitparse no está instalado') from exc

    fit = FitFile(file_path)

    def _get_value(msg, name):
        try:
            return msg.get_value(name)
        except Exception:
            return None

    metrics = {
        'duracion_seg': None,
        'distancia_m': None,
        'ritmo_medio_seg_km': None,
        'fc_media': None,
        'fc_max': None,
        'cadencia_media': None,
    }

    session_msg = None
    for msg in fit.get_messages('session'):
        session_msg = msg
        break

    if session_msg is not None:
        duracion = _get_value(session_msg, 'total_timer_time')
        distancia = _get_value(session_msg, 'total_distance')
        avg_speed = _get_value(session_msg, 'avg_speed')
        fc_media = _get_value(session_msg, 'avg_heart_rate')
        fc_max = _get_value(session_msg, 'max_heart_rate')
        cadencia = _get_value(session_msg, 'avg_cadence')

        if duracion is not None:
            metrics['duracion_seg'] = float(duracion)
        if distancia is not None:
            metrics['distancia_m'] = float(distancia)
        if avg_speed:
            try:
                avg_speed = float(avg_speed)
                if avg_speed > 0:
                    metrics['ritmo_medio_seg_km'] = 1000.0 / avg_speed
            except Exception:
                pass
        if fc_media is not None:
            metrics['fc_media'] = float(fc_media)
        if fc_max is not None:
            metrics['fc_max'] = float(fc_max)
        if cadencia is not None:
            metrics['cadencia_media'] = float(cadencia)

    needs_fallback = any(metrics[k] is None for k in ('duracion_seg', 'distancia_m', 'fc_media', 'fc_max', 'cadencia_media'))
    if needs_fallback:
        timestamps = []
        distances = []
        hr_values = []
        cad_values = []
        for msg in fit.get_messages('record'):
            ts = _get_value(msg, 'timestamp')
            dist = _get_value(msg, 'distance')
            hr = _get_value(msg, 'heart_rate')
            cad = _get_value(msg, 'cadence')
            if ts is not None:
                timestamps.append(ts)
            if dist is not None:
                distances.append(dist)
            if hr is not None:
                hr_values.append(hr)
            if cad is not None:
                cad_values.append(cad)

        if metrics['duracion_seg'] is None and len(timestamps) >= 2:
            try:
                metrics['duracion_seg'] = (max(timestamps) - min(timestamps)).total_seconds()
            except Exception:
                pass
        if metrics['distancia_m'] is None and distances:
            try:
                metrics['distancia_m'] = float(max(distances))
            except Exception:
                pass
        if metrics['fc_media'] is None and hr_values:
            metrics['fc_media'] = float(sum(hr_values) / len(hr_values))
        if metrics['fc_max'] is None and hr_values:
            metrics['fc_max'] = float(max(hr_values))
        if metrics['cadencia_media'] is None and cad_values:
            metrics['cadencia_media'] = float(sum(cad_values) / len(cad_values))

        if metrics['ritmo_medio_seg_km'] is None:
            dist = metrics['distancia_m']
            dur = metrics['duracion_seg']
            if dist and dur and dist > 0:
                metrics['ritmo_medio_seg_km'] = float(dur) / (float(dist) / 1000.0)

    return metrics


def parse_fit_metrics_fitdecode(file_path):
    try:
        from fitdecode import FitReader  # type: ignore
        from fitdecode.records import FitDataMessage  # type: ignore
    except Exception as exc:
        raise RuntimeError('fitdecode no está instalado') from exc

    metrics = {
        'duracion_seg': None,
        'distancia_m': None,
        'ritmo_medio_seg_km': None,
        'fc_media': None,
        'fc_max': None,
        'cadencia_media': None,
    }

    def _get_value(msg, name):
        try:
            return msg.get_value(name)
        except Exception:
            return None

    with warnings.catch_warnings():
        warnings.simplefilter('ignore')
        session_msg = None
        records = []
        with FitReader(file_path) as fit:
            for frame in fit:
                if not isinstance(frame, FitDataMessage):
                    continue
                if frame.name == 'session' and session_msg is None:
                    session_msg = frame
                if frame.name == 'record':
                    records.append(frame)

        if session_msg is not None:
            duracion = _get_value(session_msg, 'total_timer_time')
            distancia = _get_value(session_msg, 'total_distance')
            avg_speed = _get_value(session_msg, 'avg_speed')
            fc_media = _get_value(session_msg, 'avg_heart_rate')
            fc_max = _get_value(session_msg, 'max_heart_rate')
            cadencia = _get_value(session_msg, 'avg_cadence')

            if duracion is not None:
                metrics['duracion_seg'] = float(duracion)
            if distancia is not None:
                metrics['distancia_m'] = float(distancia)
            if avg_speed:
                try:
                    avg_speed = float(avg_speed)
                    if avg_speed > 0:
                        metrics['ritmo_medio_seg_km'] = 1000.0 / avg_speed
                except Exception:
                    pass
            if fc_media is not None:
                metrics['fc_media'] = float(fc_media)
            if fc_max is not None:
                metrics['fc_max'] = float(fc_max)
            if cadencia is not None:
                metrics['cadencia_media'] = float(cadencia)

        needs_fallback = any(metrics[k] is None for k in ('duracion_seg', 'distancia_m', 'fc_media', 'fc_max', 'cadencia_media'))
        if needs_fallback and records:
            timestamps = []
            distances = []
            hr_values = []
            cad_values = []
            for rec in records:
                ts = _get_value(rec, 'timestamp')
                dist = _get_value(rec, 'distance')
                hr = _get_value(rec, 'heart_rate')
                cad = _get_value(rec, 'cadence')
                if ts is not None:
                    timestamps.append(ts)
                if dist is not None:
                    distances.append(dist)
                if hr is not None:
                    hr_values.append(hr)
                if cad is not None:
                    cad_values.append(cad)

            if metrics['duracion_seg'] is None and len(timestamps) >= 2:
                try:
                    metrics['duracion_seg'] = (max(timestamps) - min(timestamps)).total_seconds()
                except Exception:
                    pass
            if metrics['distancia_m'] is None and distances:
                try:
                    metrics['distancia_m'] = float(max(distances))
                except Exception:
                    pass
            if metrics['fc_media'] is None and hr_values:
                metrics['fc_media'] = float(sum(hr_values) / len(hr_values))
            if metrics['fc_max'] is None and hr_values:
                metrics['fc_max'] = float(max(hr_values))
            if metrics['cadencia_media'] is None and cad_values:
                metrics['cadencia_media'] = float(sum(cad_values) / len(cad_values))

            if metrics['ritmo_medio_seg_km'] is None:
                dist = metrics['distancia_m']
                dur = metrics['duracion_seg']
                if dist and dur and dist > 0:
                    metrics['ritmo_medio_seg_km'] = float(dur) / (float(dist) / 1000.0)

    return metrics


def parse_fit_metrics(file_path):
    try:
        return parse_fit_metrics_fitparse(file_path)
    except Exception as exc_fitparse:
        try:
            return parse_fit_metrics_fitdecode(file_path)
        except Exception as exc_fitdecode:
            raise RuntimeError(f"fitparse: {exc_fitparse}; fitdecode: {exc_fitdecode}")


def hash_file_sha256(file_path):
    h = hashlib.sha256()
    with open(file_path, 'rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()
