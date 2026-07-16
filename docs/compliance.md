# Compliance (resumen)

Decisiones del usuario (2026-07-15):

| # | Decisión | Estado |
|---|---|---|
| C1 | PII default-off como contrato + TTL (sesiones 24h, historial 30d, leads 90d) + purga + `secure_delete=ON` | Activo |
| C2 | Free-text permitido → `InputGuardrail` PII-scrubber obligatorio pre-LLM | Activo |
| C3 | Transferencia internacional **con aviso** (Ley 81 Art. 48) — aviso en primer mensaje + `transfer-map.md` | Activo |
| C4 | Consentimiento parental como **gate técnico**: `calculateQuote` no se expone sin `consent_parent_at` | Activo (testeado) |
| C5 | Registro PND + derechos ARCO = deuda documentada — gate go/no-go antes de activar PII real | Deuda |
| C6 | Cifrado envelope (KEK/DEK, rotación 90d) + gitleaks — pre-producción | Deuda |
| C7 | KYC del menor/tutor fuera del MVP (canal separado) | Cerrado |

## Frontera de cumplimiento = la llamada al LLM, no la DB
PII default-off en columnas **no exime** que el contenido del chat viaje a Groq (EEUU)/GLM (China). Por eso:
- Wizard estructurado por botones/opciones (edad por rango, plan por lista, monto por selector).
- `InputGuardrail` scrubber antes de armar `messages[]`.
- Consent gate como invariante técnica (imposible violar por prompt injection: el LLM no ve `calculateQuote` sin consentimiento).
