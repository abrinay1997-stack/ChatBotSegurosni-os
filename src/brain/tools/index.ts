// Barrel — composition root importa los tools desde acá.
export { makeCalculateQuoteTool } from "./calculateQuote.tool.js";
export { makeLookupKnowledgeTool } from "./lookupKnowledge.tool.js";
export { makeGetProductInfoTool, PRODUCT_INFO } from "./getProductInfo.tool.js";
export { makeEscalateToHumanTool } from "./escalateToHuman.tool.js";
export { defineTool, runToolLoop, toolToJsonSchema } from "./registry.js";
export type { Tool, ToolCtx, ToolResult, ToolLoopResult, JSONSchema } from "./registry.js";
