# Procedimiento ARCO (deuda administrativa — gate pre-producción)

Decisión del usuario (2026-07-15): PND/ARCO queda como **deuda documentada**, no bloquea el MVP. **Gate go/no-go** antes de activar persistencia de PII real.

## Acceso
- Logs estructurados (pino) con `conversation_id`. Acceso restringido a admins.
- No se loguea contenido literal del usuario por defecto (solo `session_id` + intent + tool_calls + métricas).

## Rectificación / Cancelación / Oposición
- Comando "borra mis datos" → `DELETE` real de `sessions` y `leads` por `chat_id` + confirmación al usuario.
- (No implementado en MVP — gate pre-producción.)

## Gate de activación de PII
Antes de persistir PII real del menor/tutor:
1. Registro de base de datos ante la PND.
2. KYC del tutor en canal separado (el consentimiento del bot es *attestation*, no verificación de identidad).
3. Procedimiento ARCO funcional + responsable de tratamiento designado.

## TTL (MVP, sin PII persistida)
- Sesiones: 24h · Historial: 30d · Leads no convertidos: 90d.
- Job de purga con `PRAGMA secure_delete=ON` + VACUUM periódico.
