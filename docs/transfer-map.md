# Mapa de transferencia de datos (Ley 81 de Panamá, Art. 48)

Decisiones del usuario (2026-07-15): transferencia internacional **aceptada con aviso**.

## Destinos de los datos
- **Groq** (proveedor `llama-3.3-70b-versatile`): servidores en **EEUU**. El contenido del chat se procesa allí.
- **GLM / z-ai** (`glm-4-plus`): servidores en **China**.
- **SQLite local** (región del deploy, idealmente Panamá): sesiones, historial, leads. **No sale del país.**

## Mitigaciones activas
- **Aviso al usuario**: el primer mensaje del bot informa que los datos pueden procesarse en proveedores fuera de Panamá (system prompt `v1.system.md`).
- **`InputGuardrail`** (scrubber de PII): enmascara CI/nombre/fecha/teléfono **antes** de enviar el texto al LLM, reduzca la exposición.
- **Flag `LLM_PROVIDER_RESIDENT_ONLY`**: si se setea `true`, el bot debe restringirse a proveedores residentes (no implementado en MVP — dejar gate pre-producción).

## Multiplicación de exposición (cascade)
Cada proveedor adicional = jurisdicción distinta. Si se habilita fallback Groq↔GLM, el mismo contenido puede pasar por EEUU y China. Documentar antes de activar fallback.

## Deuda
- Inventario formal de transferencias ante la PND: pendiente (gate pre-producción).
