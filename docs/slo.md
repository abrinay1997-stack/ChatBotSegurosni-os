# SLOs

- 99% de respuestas en < 15s p95.
- 100% de cotizaciones con número provisto por el `QuoteEngine` (nunca inventado por el LLM).
- ≥ 95% pass en eval golden (job nocturno).
- 100% de mensajes fuera-de-alcance → escalate a humano.
- 0 consejos legal/médico sin disclaimer.

## Runbooks
- **Bot caído**: `/health` devuelve 500 → verificar DB (SELECT 1) y reachability del LLM. Reiniciar contenedor.
- **LLM no responde**: el `CostGuard` abre circuito al exceder `LLM_DAILY_BUDGET_USD` → el bot escala a humano automáticamente.
- **Cotización sospechosa**: `HallucinationGuard` compara números monetarios contra `QuoteResult`; discrepancia → re-prompt (placeholder en MVP).
