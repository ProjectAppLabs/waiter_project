#!/bin/sh
# Lo corre la imagen de MySQL una sola vez, al crear la base. Carga las zonas horarias: sin ellas las métricas por día
# de cada organización (TruncDate en su zona) devuelven vacío.
mysql_tzinfo_to_sql /usr/share/zoneinfo 2>/dev/null | mysql -uroot -p"$MYSQL_ROOT_PASSWORD" mysql
