# ChatbotSeguros — Diseño (Spec)

**Fecha:** 2026-07-15
**Estado:** Borrador para revisión
**Autor:** Director (con panel de auditoría multi-agente)

---

## 1. Visión y propósito

Chatbot conversacional para un **seguro educacional infantil**: cobertura de educación de los hijos si los padres fallecen (variante de seguro de vida con beneficiario menor y finalidad educativa). El bot cumple dos funciones:

1. **Atención y soporte (FAQ)** — responde dudas sobre el producto, coberturas, términos y trámites.
2. **Cotización guiada** — conduce al usuario por un wizard y entrega una prima estimada.

**Objetivo del MVP:** un bot "completamente inteligente" de atención al cliente y soporte, con cotización funcional usando **datos de ejemplo**. Los costos y términos reales se cargan al ir a producción.

## 2. Contexto y restricciones

- **Canal MVP:** Telegram (sin Meta/WhatsApp Business API). Diseño multicanal para sumar WhatsApp después.
- **Bot de referencia:** `C:\Users\MIPC\Desktop\DESARROLLOS\telegram-ai-bot` (Node 18 ESM, `node-telegram-bot-api`, Groq `llama-3.3-70b-versatile`). Aporta **patrones** (adapter `processMessage({reply})`, clasificación de intención), **no código**. Anti-patrones a no heredar documentados en §11.
- **Proveedor de IA:** Groq o GLM (z-ai) — rápidos y económicos, **intercambiables** vía puerto.
- **Cotización:** no existe API/core externa. Se construye el "cerebro" desde cero con datos de ejemplo.
- **PII:** default-off por diseño. Activación de persistencia de PII real = gate go/no-go (§10).
- **Mercado:** LATAM/Panamá, español. Dominio emocionalmente sensible y con datos de menores (categoría de protección máxima).

## 3. Stack tecnológico

| Capa | Tecnología |
|---|---|
| Runtime | Node 20 LTS + TypeScript + ESM |
| Telegram | grammY + `@grammyjs/conversations` + `@grammyjs/stateless-question` |
| LLM | Groq (`llama-3.3-70b-versatile` chat, `whisper-large-v3` audio) / GLM vía puerto |
| Embeddings (solo Fase 2) | `nomic-embed-text` (Ollama local) u OpenAI `text-embedding-3-small` |
| Query/DB | Drizzle ORM + better-sqlite3 (dev) → pg (prod) |
| Vector store (solo Fase 2) | sqlite-vec (puerto `VectorStore` lo abstrae) |
| Validación | Zod |
| Logging/métricas | pino + asyncLocalStorage + prom-client |
| Tokenizer (poda de memoria) | `gpt-tokenizer` (cl100k_base) |
| Tests | vitest (projects unit/contract/e2e) + nock (cassettes) |
| Secretos | `.env` + gitleaks/trufflehog en pre-commit y pipeline |
| Infra | Docker + GitHub Actions |

## 4. Arquitectura (hexagonal / Ports & Adapters)

```
┌─────────────────────────────────────────────────────────────┐
│  CHANNELS      │  Telegram (grammY)  ←→  WhatsApp (después)   │
│                │  implementan interfaz ChannelAdapter        │
├─────────────────────────────────────────────────────────────┤
│  CONVERSATION  │  SessionManager · @grammyjs/conversations ·  │
│                │  Router (tools scoped al estado del wizard) │
├─────────────────────────────────────────────────────────────┤
│  BRAIN         │  LLMProvider (Groq↔GLM↔Gemini) + tool-call   │
│                │  Tools: calculateQuote, lookupKnowledge,    │
│                │          getProductInfo, escalateToHuman     │
│                │  Guardrails: Input / Output / Hallucination │
│                │              / Distress · CostGuard          │
├─────────────────────────────────────────────────────────────┤
│  DOMAIN (puro) │  QuoteEngine (determinista, sin LLM)         │
│                │  KnowledgeBase (RAG sobre docs del producto) │
├─────────────────────────────────────────────────────────────┤
│  PERSISTENCE   │  Drizzle + SQLite → portable a Postgres      │
│                │  sesiones · historial · leads · tarifas     │
├─────────────────────────────────────────────────────────────┤
│  INFRA         │  config (Zod) · pino · http (health/metrics) │
└─────────────────────────────────────────────────────────────┘
```

**Principio:** `domain/` y `brain/` importan **solo** de `src/shared/ports/`. La composition root (`index.ts`) es el único punto que toca implementaciones concretas (grammY, better-sqlite3, Groq).

### Puertos (`src/shared/ports/`)
- `LLMProvider { chat(req): Promise<{content?, toolCalls?, usage}> }`
- `ChannelAdapter { normalizeIn(update): NormalizedMessage; send(chatId, text): Promise<void> }`
- `SessionRepository { get(chatId); save(s) }`
- `QuoteRepository`, `KnowledgeRepository`, `VectorStore` (Fase 2)
- `Logger`, `Config`

## 5. Estructura de carpetas

```
ChatbotSeguros/
├── src/
│   ├── shared/ports/              # interfaces (hexagonal)
│   ├── channels/                  # transporte
│   │   ├── telegram.channel.ts
│   │   └── types.ts
│   ├── conversation/              # sesión + wizard + router
│   │   ├── session.manager.ts
│   │   ├── router.ts              # construye tools[] según estado
│   │   └── conversations/quote.ts # grammY wizard de cotización
│   ├── brain/
│   │   ├── llm.provider.ts        # dispatcher
│   │   ├── providers/{groq,glm,gemini}.provider.ts
│   │   ├── tools/{registry.ts, calculateQuote.tool.ts, lookupKnowledge.tool.ts, ...}
│   │   ├── guardrails/{input,output,hallucination,distress}.ts
│   │   ├── cost.guard.ts
│   │   └── prompts/v1.system.md   # prompt externo y versionado
│   ├── domain/
│   │   ├── quote/{QuoteEngine.ts, quote.schema.ts, tariffs.example.json}
│   │   └── knowledge/{product.md, faq.md, terms.example.md, rag.ts}
│   ├── persistence/
│   │   ├── db.ts · schema.ts (Drizzle) · migrations/
│   │   └── repositories/
│   ├── infra/{config.ts, logger.ts, http.server.ts}
│   └── index.ts                   # composition root (async main + graceful shutdown)
├── tests/{unit,contract,e2e}/
├── evals/cases.yaml               # ~50 casos golden
├── data/                          # sqlite + vector store
├── docs/                          # compliance, transfer-map, arco, slo, errors-learned
├── .env.example · Dockerfile · docker-compose.yml
└── package.json
```

## 6. Flujo de datos (conversación + cotización)

```
Mensaje (Telegram)
  → [1] ChannelAdapter.normalizeIn  → NormalizedMessage
  → [2] Idempotencia: processed_updates INSERT OR IGNORE (return 200 si existe)
  → [3] Rate-limit (msgs/min por chat + tope global de cotizaciones/min)
  → [4] SessionManager.loadOrCreate(chatId) → {history, quote_state, consent_parent_at}
  → [5] ¿Wizard activo? SÍ → resume @grammyjs/conversations
         NO → [6] InputGuardrail (scrubber de PII)
              → [7] armar messages[]: system(v1) + history(podada) + RAG(en user msg con delimitadores)
              → [8] LLMProvider.chat({messages, tools[]})  ← tools scoped al estado
              → [9] Tool loop (máx 3 rondas/turno): safeParse → handler → ToolResult (error structurado)
              → [10] HallucinationGuard (números monetarios vs QuoteResult)
              → [11] OutputGuardrail → ChannelAdapter.send
  → [12] Persistir session + processed_updates; CostGuard += tokens/costo
         (si LLM_DAILY_BUDGET_USD excedido → circuito abierto → escala a humano)
```

### Wizard de cotización
```
trigger → [0] CONSENTIMIENTO (botones Sí/No) → consent_parent_at = now()
        → [1] edad padre (rango) + edad niño (rango)   [botones; free-text aceptado vía scrubber]
        → [2] monto cobertura (selector) + plazo (selector)
        → [3] LLM invoca calculateQuote(...) → QuoteResult {primaMensual, cobertura, terms[Ejemplo]}
        → [4] presentación + disclaimer "datos de ejemplo, términos reales en producción"
        → [5] (opcional) captura de lead sin PII → escalateToHuman (con cooldown)
```

## 7. Manejo de errores y guardrails

- **`InputGuardrail`** (pre-LLM, **obligatorio** por free-text): regex de CI panameño `X-XXX-XXXX`, fechas, teléfonos, NER de nombres → masking antes de armar `messages[]`. Cascada por costo (regex barato siempre; LLM solo si ambiguo).
- **`OutputGuardrail`** (post-LLM): bloquea `src/`, `sk-`, `process.env`, números de cuenta, rutas.
- **`HallucinationGuard`**: extrae números monetarios de la respuesta final, compara contra `QuoteResult`. Discrepancia → re-prompt o número canónico.
- **`DistressRouter`**: detecta señales de urgencia/dolor → escala a humano con prioridad.
- **Tool dispatcher**: `safeParse` (Zod) → error structurado devuelto al LLM para autocorrección (no excepción). Máx 3 rondas tool/turno.
- **Fallback de proveedor LLM**: solo en frontera de turno, nunca mid-tool-loop. Estado `session_tool_calls {proposed, executed, result}` persistido.
- **CostGuard**: `LLM_DAILY_BUDGET_USD` → abre circuito y escala a humano si se excede.

## 8. Testing y observabilidad

### Tests (vitest, projects separados)
- **Unit** del `QuoteEngine` (puro): snapshots, casos edge (edad 0/18, suma fuera de rango), idempotencia. Gate 90% solo en `src/domain/quote/**`.
- **Contract** de `LLMProvider` con cassettes nock (Groq + GLM). `npm run test:record` graba; CI reproduce sin red.
- **E2E** con grammY `bot.api.config.use(mockApi)` + SQLite `:memory:`: FAQ, wizard completo, fuera-de-alcance→escalate, recuperación tras input inválido, cancelar.
- **Red-team suite**: intenta invocar tools fuera de estado del wizard → debe bloquear merge.
- Gate de coverage por **no-regresión** (threshold = cobertura de main −2%), no fijo global.

### Eval harness
- `evals/cases.yaml` (~50 casos) medidos en groundedness/safety/correctness.
- Juez = **Gemini 2.5 Flash** (proveedor distinto al del bot, evita self-preference).
- CI de PR: subset determinista (~10 casos) con regex → **bloquea merge**.
- Nocturno: eval completo con juez LLM → **señal** con banda de tolerancia, abre issue (no bloquea).

### Observabilidad
- pino estructurado con `conversation_id` vía `asyncLocalStorage`.
- Redactor de PII explícito + scrubber de contenido (no logear texto literal del usuario por defecto).
- Log por tool-call (name, latency, tokens, cost).
- `/health` (DB SELECT 1 + LLM ping + webhook) y `/metrics` Prometheus.
- Smoke cada 13 min = solo `/health` (sin tokens conversacionales).

## 9. Cumplimiento (compliance) — decisiones

| # | Decisión | Estado |
|---|---|---|
| C1 | **PII default-off** como contrato de datos + TTL (sesiones 24h, historial 30d, leads 90d) + job de purga + `PRAGMA secure_delete=ON` + VACUUM. | Cerrado |
| C2 | **Free-text permitido** → `InputGuardrail` PII-scrubber obligatorio pre-LLM. | Cerrado (decisión usuario) |
| C3 | **Transferencia internacional con aviso** (Ley 81 Art. 48): aviso en el primer mensaje + `docs/transfer-map.md`. Groq (EEUU)/GLM (China). | Cerrado (decisión usuario) |
| C4 | **Consentimiento parental como gate**: `consent_parent_at` NOT NULL en `leads`; router no expone `calculateQuote` hasta que exista. | Cerrado |
| C5 | **Registro PND + derechos ARCO** = deuda documentada (`docs/arco-procedure.md`, `docs/compliance.md`). Gate go/no-go antes de activar persistencia de PII real. | Deuda (decisión usuario) |
| C6 | **Cifrado** envelope (KEK en gestor externo, DEK por registro, rotación 90d) + gitleaks/trufflehog + `.env` fuera del Dockerfile. | Cerrado |
| C7 | **KYC del menor/tutor fuera del MVP** (canal separado); el consentimiento es attestation, no verificación de identidad. | Cerrado |

## 10. SLOs (`docs/slo.md`)
- 99% de respuestas en <15s p95.
- 100% de cotizaciones con número del `QuoteEngine` (no del LLM).
- ≥95% pass en eval golden.
- 100% fuera-de-alcance → escalate.
- 0 consejos legal/médico sin disclaimer.

## 11. Anti-patrones del bot de referencia (a NO heredar — `docs/errors-learned.md`)
- `index.js:269` refresh token por chat.
- `index.js:284` prompt secreto embebido en código.
- `messageProcessor.js:48` RAG concatenado al system prompt (debe ir en user msg con delimitadores).
- `intentDetector.js:52-73` `JSON.parse` frágil (usar tool-calling nativo).
- Sin rate-limit ni auth de webhook.
- **Secretos filtrados en archivo `env`** → revocar antes de cualquier reutilización.

## 12. Fases
- **MVP (este spec):** Telegram + FAQ (RAG FTS5) + wizard de cotización con datos de ejemplo + guardrails + tests + eval + observabilidad. PII off.
- **Fase 2 (condicional):** RAG con embeddings (sqlite-vec) si precision@1 < 0.85 o corpus > 50 docs. Streaming a Telegram.
- **Fase 3:** canal WhatsApp (sin tocar brain/domain). Activación de PII (gate PND/ARCO + KYC).

## 13. Decisiones del panel de auditoría (multi-agente) integradas
Las 22 recomendaciones de alto consenso del panel de 4 especialistas (backend, seguridad, LLM, QA) con debate cruzado quedan incorporadas: puertos hexagonales reales, tool registry con Zod, `QuoteEngine` puro + 90% coverage, grammY conversations, Drizzle, PII default-off + TTL, idempotencia de updates, guardrails, prompt versionado, eval harness con juez externo, consentimiento como gate, RAG en user msg, observabilidad con `conversation_id` + CostGuard, RAG por fases, rate-limit + webhook con secret_token, y las 3 decisiones de compliance del §9.
