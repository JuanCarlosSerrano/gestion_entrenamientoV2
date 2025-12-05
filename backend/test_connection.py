import os
import pymysql

# Leer datos desde variables de entorno
host = os.getenv("DB_HOST", "localhost")
port = int(os.getenv("DB_PORT", "3306"))
user = os.getenv("DB_USER")
password = os.getenv("DB_PASSWORD")
database = os.getenv("DB_NAME")

# Intentar conexión
try:
    conn = pymysql.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        database=database
    )
    print("✅ Conexión a MariaDB OK")
    conn.close()
except Exception as e:
    print("❌ Error al conectar:", e)
