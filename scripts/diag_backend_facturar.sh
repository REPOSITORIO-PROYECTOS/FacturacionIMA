#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:8008}"
echo "[DIAG] Probando endpoints de facturación en base: $BASE_URL"
BODY='[{"id":"test","total":1,"cliente_data":{"cuit_o_dni":"0","nombre_razon_social":"TEST","condicion_iva":"CONSUMIDOR_FINAL"}}]'

for path in "/facturador/facturar-por-cantidad" "/api/facturador/facturar-por-cantidad"; do
  echo "\n[DIAG] -> POST $BASE_URL$path"
  curl -i -s -o /tmp/diag_resp.txt -w "HTTP_STATUS:%{http_code}\n" \
    -H 'Content-Type: application/json' \
    -d "$BODY" \
    "$BASE_URL$path" | tee /tmp/diag_status.txt
  STATUS=$(grep HTTP_STATUS /tmp/diag_status.txt | sed 's/HTTP_STATUS://')
  echo "[DIAG] Status: $STATUS"
  head -n 5 /tmp/diag_resp.txt | sed 's/^/[DIAG] Body /'
done

echo "\n[DIAG] Listo. La variante que devuelva 200/422 es la que está viva. La que responda 404/405 no existe en backend actual."