// Model provider: OpenRouter only (OpenAI-compatible) serving Anthropic Claude
// models. OPENROUTER_API_KEY is required; there is no secondary provider.
//
// The rest of the app talks in Anthropic block shapes; this module translates
// them both ways so tool-calling behavior is identical on both paths.
// Nothing here touches crisis handling — detectCrisis() runs before any call.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Bare Anthropic model ids used across the app → OpenRouter model slugs. */
const OPENROUTER_MODEL_MAP: Record<string, string> = {
  "claude-sonnet-5": "anthropic/claude-sonnet-4.5",
  "claude-sonnet-4-5": "anthropic/claude-sonnet-4.5",
  "claude-haiku-4-5": "anthropic/claude-haiku-4.5",
};

function toOpenRouterModel(model: string): string {
  if (model.includes("/")) return model;
  return OPENROUTER_MODEL_MAP[model] ?? `anthropic/${model}`;
}

export type LlmContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

export type LlmMessage = { role: "user" | "assistant"; content: string | LlmContentBlock[] };

export type LlmTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type LlmResponse = {
  content: LlmContentBlock[];
  stop_reason: string | null;
  /** Which provider actually answered — useful for logs. */
  provider: "openrouter";
  /** Token counts for this single call (0 when the provider omits `usage`). */
  usage: { inputTokens: number; outputTokens: number };
};

export class LlmError extends Error {}

function openRouterKey() {
  return process.env["OPENROUTER_API_KEY"] ?? null;
}

// --- OpenAI-compatible translation ----------------------------------------

/**
 * Anthropic's ephemeral prompt cache, reachable through OpenRouter by marking a
 * content part with `cache_control`. The system prompt is large and identical on
 * every turn of a conversation, so caching it means repeat calls pay the much
 * cheaper cache-read rate instead of full input price. No behaviour change.
 */
type CacheableTextPart = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
};

type GatewayMessage =
  | { role: "system"; content: CacheableTextPart[] }
  | { role: "system" | "user" | "assistant"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls: {
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

function toGatewayMessages(system: string, messages: LlmMessage[]): GatewayMessage[] {
  const out: GatewayMessage[] = [
    {
      role: "system",
      // Static across the whole conversation -> cache it.
      content: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    },
  ];

  for (const message of messages) {
    if (typeof message.content === "string") {
      out.push({ role: message.role, content: message.content });
      continue;
    }

    const text = message.content
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    const toolUses = message.content.filter(
      (
        block,
      ): block is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } =>
        block.type === "tool_use",
    );
    const toolResults = message.content.filter(
      (block): block is { type: "tool_result"; tool_use_id: string; content: string } =>
        block.type === "tool_result",
    );

    if (message.role === "assistant") {
      if (toolUses.length) {
        out.push({
          role: "assistant",
          content: text || null,
          tool_calls: toolUses.map((call) => ({
            id: call.id,
            type: "function" as const,
            function: { name: call.name, arguments: JSON.stringify(call.input ?? {}) },
          })),
        });
      } else {
        out.push({ role: "assistant", content: text });
      }
      continue;
    }

    // user role: tool results become dedicated tool messages
    if (toolResults.length) {
      for (const result of toolResults) {
        out.push({ role: "tool", tool_call_id: result.tool_use_id, content: result.content });
      }
      if (text) out.push({ role: "user", content: text });
      continue;
    }
    out.push({ role: "user", content: text });
  }

  return out;
}

function toGatewayTools(tools: LlmTool[]) {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  }));
}

function parseOpenAiPayload(payload: unknown, provider: LlmResponse["provider"]): LlmResponse {
  const typed = payload as {
    choices?: {
      finish_reason?: string;
      message?: {
        content?: string | null;
        tool_calls?: { id: string; function?: { name?: string; arguments?: string } }[];
      };
    }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const choice = typed.choices?.[0];
  const blocks: LlmContentBlock[] = [];
  const text = choice?.message?.content;
  if (text) blocks.push({ type: "text", text });
  for (const call of choice?.message?.tool_calls ?? []) {
    let input: Record<string, unknown> = {};
    try {
      input = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
    } catch {
      input = {};
    }
    blocks.push({ type: "tool_use", id: call.id, name: call.function?.name ?? "", input });
  }

  const hasToolUse = blocks.some((block) => block.type === "tool_use");
  return {
    content: blocks,
    stop_reason: hasToolUse ? "tool_use" : (choice?.finish_reason ?? null),
    provider,
    usage: {
      inputTokens: typed.usage?.prompt_tokens ?? 0,
      outputTokens: typed.usage?.completion_tokens ?? 0,
    },
  };
}

async function callOpenRouter(
  apiKey: string,
  model: string,
  maxTokens: number,
  system: string,
  messages: LlmMessage[],
  tools: LlmTool[],
): Promise<LlmResponse> {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "Kalm",
    },
    body: JSON.stringify({
      model: toOpenRouterModel(model),
      max_tokens: maxTokens,
      messages: toGatewayMessages(system, messages),
      ...(tools.length ? { tools: toGatewayTools(tools) } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new LlmError(`OpenRouter error ${response.status}: ${body.slice(0, 300)}`);
  }

  const payload = await response.json();
  return parseOpenAiPayload(payload, "openrouter");
}

// --- Streaming ---------------------------------------------------------
// Same OpenAI-compatible wire format as above, but reading the response body
// as an SSE stream (`data: {...}\n\n` lines, terminated by `data: [DONE]`) and
// emitting text as it arrives instead of waiting for the full completion.
// Tool-call deltas arrive fragmented (arguments streamed as partial JSON
// strings, keyed by `index`) and are accumulated here into the same
// LlmContentBlock[] shape callCompanionModel returns, so callers that already
// handle tool_use blocks don't need to know the difference.

type StreamToolCallAccumulator = { id: string; name: string; arguments: string };

async function* readSseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let separatorIndex: number;

      while ((separatorIndex = buffer.indexOf("\n\n")) !== -1) {
        const chunk = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        for (const line of chunk.split("\n")) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data:")) yield trimmed.slice(5).trim();
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Consumes an OpenAI-compatible SSE stream, calling `onDelta` with each text
 * fragment as it arrives, and returns the fully-accumulated LlmResponse once
 * the stream ends (mirroring parseOpenAiPayload's shape).
 */
async function consumeOpenAiStream(
  response: Response,
  provider: LlmResponse["provider"],
  onDelta: (text: string) => void,
): Promise<LlmResponse> {
  if (!response.body) throw new LlmError("Streaming response had no body");

  let text = "";
  let finishReason: string | null = null;
  let inputTokens = 0;
  let outputTokens = 0;
  const toolCalls = new Map<number, StreamToolCallAccumulator>();

  for await (const data of readSseEvents(response.body)) {
    if (data === "[DONE]") break;
    let event: {
      choices?: {
        delta?: {
          content?: string | null;
          tool_calls?: {
            index: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }[];
        };
        finish_reason?: string | null;
      }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    try {
      event = JSON.parse(data);
    } catch {
      continue; // a stray keep-alive/comment line — ignore rather than fail the whole reply
    }

    const choice = event.choices?.[0];
    const delta = choice?.delta?.content;
    if (delta) {
      text += delta;
      onDelta(delta);
    }
    for (const call of choice?.delta?.tool_calls ?? []) {
      const existing = toolCalls.get(call.index) ?? { id: "", name: "", arguments: "" };
      if (call.id) existing.id = call.id;
      if (call.function?.name) existing.name = call.function.name;
      if (call.function?.arguments) existing.arguments += call.function.arguments;
      toolCalls.set(call.index, existing);
    }
    if (choice?.finish_reason) finishReason = choice.finish_reason;
    if (event.usage) {
      inputTokens = event.usage.prompt_tokens ?? inputTokens;
      outputTokens = event.usage.completion_tokens ?? outputTokens;
    }
  }

  const blocks: LlmContentBlock[] = [];
  if (text) blocks.push({ type: "text", text });
  for (const call of toolCalls.values()) {
    let input: Record<string, unknown> = {};
    try {
      input = call.arguments ? JSON.parse(call.arguments) : {};
    } catch {
      input = {};
    }
    blocks.push({ type: "tool_use", id: call.id, name: call.name, input });
  }

  return {
    content: blocks,
    stop_reason: toolCalls.size > 0 ? "tool_use" : finishReason,
    provider,
    usage: { inputTokens, outputTokens },
  };
}

async function streamOpenRouter(
  apiKey: string,
  model: string,
  maxTokens: number,
  system: string,
  messages: LlmMessage[],
  tools: LlmTool[],
  onDelta: (text: string) => void,
): Promise<LlmResponse> {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "Kalm",
    },
    body: JSON.stringify({
      model: toOpenRouterModel(model),
      max_tokens: maxTokens,
      messages: toGatewayMessages(system, messages),
      stream: true,
      stream_options: { include_usage: true },
      ...(tools.length ? { tools: toGatewayTools(tools) } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new LlmError(`OpenRouter error ${response.status}: ${body.slice(0, 300)}`);
  }
  return consumeOpenAiStream(response, "openrouter", onDelta);
}

/**
 * Streaming counterpart to `callCompanionModel`: calls `onDelta` with text
 * fragments as they arrive instead of returning only once the reply is ready.
 */
export async function streamCompanionModel(
  options: {
    model: string;
    maxTokens: number;
    system: string;
    messages: LlmMessage[];
    tools?: LlmTool[];
  },
  onDelta: (text: string) => void,
): Promise<LlmResponse> {
  const { model, maxTokens, system, messages } = options;
  const tools = options.tools ?? [];
  const key = openRouterKey();
  if (!key) throw new LlmError("The AI companion isn't configured yet.");

  return streamOpenRouter(key, model, maxTokens, system, messages, tools, onDelta);
}

/**
 * Call OpenRouter (Claude). Callers keep a single Anthropic-shaped contract.
 */
export async function callCompanionModel(options: {
  model: string;
  maxTokens: number;
  system: string;
  messages: LlmMessage[];
  tools?: LlmTool[];
}): Promise<LlmResponse> {
  const { model, maxTokens, system, messages } = options;
  const tools = options.tools ?? [];
  const key = openRouterKey();
  if (!key) throw new LlmError("The AI companion isn't configured yet.");

  return callOpenRouter(key, model, maxTokens, system, messages, tools);
}
