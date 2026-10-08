"""Registro de acceso sin credenciales de rutas, consultas ni cabeceras."""

accesslog = '-'
# MCP admite claves dentro de la URL. Conservamos diagnóstico de resultado y
# latencia sin copiar la petición, el Referer ni las cookies al registro.
access_log_format = '%(t)s metodo=%(m)s estado=%(s)s bytes=%(B)s duracion_us=%(D)s'
