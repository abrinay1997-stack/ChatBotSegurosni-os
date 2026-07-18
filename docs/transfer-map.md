# Mapa de transferencia de datos (Ley 81 de Panamá, Art. 48)

Decisiones del usuario (2026-07-15): transferencia internacional **aceptada con aviso**.

## Destinos de los datos
- **Groq** (proveedor `llama-3.3-70b-versatile`): servidores en **EEUU**. El contenido del chat se procesa allí.
- **GLM / z-ai** (`glm-4-plus`): servidores en **China**.
- **NVIDIA** (`meta/llama-3.1-70b-instruct`, vía `integrate.api.nvidia.com`): servidores en **EEUU**. Fallback automático desde 2026-07-17 — ver `src/brain/providers/fallback.provider.ts` (`createFallbackProvider`, activo si `NVIDIA_API_KEY` está seteada). Se probó `moonshotai/kimi-k2.6` primero pero el endpoint devuelve 404 incluso desde el Playground oficial de NVIDIA (backend roto del lado de ellos) — queda pendiente reintentarlo cuando lo arreglen.
- **SQLite local** (región del deploy, idealmente Panamá): sesiones, historial, leads. **No sale del país.**

## Mitigaciones activas
- **Aviso al usuario**: el primer mensaje del bot informa que los datos pueden procesarse en proveedores fuera de Panamá (system prompt `v1.system.md`).
- **`InputGuardrail`** (scrubber de PII): enmascara CI/nombre/fecha/teléfono **antes** de enviar el texto al LLM, reduzca la exposición.
- **Flag `LLM_PROVIDER_RESIDENT_ONLY`**: si se setea `true`, el bot debe restringirse a proveedores residentes (no implementado en MVP — dejar gate pre-producción).

## Multiplicación de exposición (cascade)
Cada proveedor adicional = jurisdicción distinta. Con el fallback Groq→NVIDIA activo, el mismo contenido puede pasar por dos proveedores distintos en EEUU (nunca ambos a la vez — el fallback solo se dispara si el primario falla, ver §Mitigaciones). Si además se usa GLM como primario, el cascade cruza EEUU y China. Motivo de activación: cuota diaria de Groq agotada en producción (2026-07-17, ver `docs/errors-learned.md`).

## Deuda
- Inventario formal de transferencias ante la PND: pendiente (gate pre-producción).
