import secrets

from flask import Blueprint, jsonify, redirect, session, url_for


bp = Blueprint("system", __name__)


@bp.route('/csrf-token', methods=['GET'])
def get_csrf_token():
    if 'csrf_token' not in session:
        session['csrf_token'] = secrets.token_urlsafe(32)
    return jsonify({'csrf_token': session['csrf_token']})


@bp.route('/')
def index():
    return redirect(url_for('static', filename='login.html'))
