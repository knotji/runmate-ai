import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { aiFailureMessage } from "@/lib/constants";

export type AISource = "gemini" | "openai" | "fallback";
export type AIErrorCode =
  | "AI_PROVIDER_ERROR"
  | "AI_TIMEOUT"
  | "AI_INVALID_JSON"
  | "AI_EMPTY_RESPONSE"
  | "UNKNOWN_ERROR";

export type JSONAIResult<T> = {
  data: T;
  source: AISource;
  usedFallback?: boolean;
  errorCode?: AIErrorCode;
  errorMessage?: string;
};

const provider = (process.env.AI_PROVIDER || "gemini").toLowerCase();
const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const openaiModel = process.env.OPENAI_MODEL || "gpt-4o-mini";

export const gemini = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

export const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export async function jsonFromAI<T>({
  system,
  user,
  imageDataUrl,
  imageDataUrls,
  fallback,
}: {
  system: string;
  user: string;
  imageDataUrl?: string;
  imageDataUrls?: string[];
  fallback: T;
}): Promise<JSONAIResult<T>> {
  const prompt = `${system}\n\nReturn valid JSON only. Do not wrap it in markdown.\n\n${user}`;
  const images = imageDataUrls?.length ? imageDataUrls : imageDataUrl ? [imageDataUrl] : [];

  if (provider === "gemini" && gemini) {
    try {
      const response = await gemini.models.generateContent({
        model: geminiModel,
        contents: buildGeminiContents(prompt, images),
        config: {
          responseMimeType: "application/json",
          temperature: 0.3,
        },
      });
      const raw = response.text || "";
      if (!raw.trim()) throw new AIEmptyResponseError("Empty Gemini response");
      return { data: parseJson<T>(raw), source: "gemini", usedFallback: false };
    } catch (error) {
      logAIError(error);
      // Fall through to the OpenAI branch below when it's configured, instead
      // of returning here — otherwise a Gemini failure never actually falls
      // back to OpenAI despite that being the documented behavior.
      if (!openai) {
        return fallbackResult(fallback, classifyAIError(error), error);
      }
    }
  }

  if (openai) {
    try {
      const content: ChatCompletionMessageParam["content"] = images.length
        ? [
            { type: "text", text: user },
            ...images.map((url) => ({ type: "image_url" as const, image_url: { url } })),
          ]
        : user;

      const response = await openai.chat.completions.create({
        model: openaiModel,
        messages: [
          { role: "system", content: system },
          { role: "user", content },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });

      const raw = response.choices[0]?.message.content;
      if (!raw?.trim()) throw new AIEmptyResponseError("Empty OpenAI response");
      return { data: parseJson<T>(raw), source: "openai", usedFallback: false };
    } catch (error) {
      logAIError(error);
      return fallbackResult(fallback, classifyAIError(error), error);
    }
  }

  return fallbackResult(fallback, "AI_PROVIDER_ERROR", new Error("No configured AI provider"));
}

export async function textFromAI({
  system,
  messages,
  imageDataUrl,
  fallback,
}: {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  imageDataUrl?: string;
  fallback: string;
}): Promise<{ message: string; source: AISource }> {
  const images = imageDataUrl ? [imageDataUrl] : [];

  if (provider === "gemini" && gemini) {
    try {
      const transcript = messages.map((message) => `${message.role}: ${message.content}`).join("\n");
      const prompt = `${system}\n\nConversation:\n${transcript}`;
      
      const contents = buildGeminiContents(prompt, images);

      const response = await gemini.models.generateContent({
        model: geminiModel,
        contents,
        config: { temperature: 0.4 },
      });
      return { message: response.text || fallback, source: "gemini" };
    } catch (error) {
      logAIError(error);
      // Fall through to OpenAI when configured — same fallback fix as jsonFromAI.
      if (!openai) {
        return { message: fallback, source: "fallback" };
      }
    }
  }

  if (openai) {
    try {
      const formattedMessages = messages.map((msg, idx) => {
        if (msg.role === "user" && images.length > 0 && idx === messages.length - 1) {
          return {
            role: "user" as const,
            content: [
              { type: "text" as const, text: msg.content },
              ...images.map((url) => ({ type: "image_url" as const, image_url: { url } })),
            ],
          };
        }
        return {
          role: msg.role,
          content: msg.content,
        };
      });

      const response = await openai.chat.completions.create({
        model: openaiModel,
        temperature: 0.4,
        messages: [{ role: "system" as const, content: system }, ...formattedMessages],
      });
      return { message: response.choices[0]?.message.content || fallback, source: "openai" };
    } catch (error) {
      logAIError(error);
    }
  }

  return { message: fallback, source: "fallback" };
}

function buildGeminiContents(prompt: string, imageDataUrls: string[]) {
  if (!imageDataUrls.length) return prompt;
  const imageParts = imageDataUrls
    .map(parseDataUrl)
    .filter((image): image is { mimeType: string; base64: string } => Boolean(image))
    .map((image) => ({
      inlineData: {
        mimeType: image.mimeType,
        data: image.base64,
      },
    }));

  return [{ text: prompt }, ...imageParts];
}

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

class AIJsonParseError extends Error {
  constructor(message: string, readonly rawPrefix: string) {
    super(message);
    this.name = "AIJsonParseError";
  }
}

class AIEmptyResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIEmptyResponseError";
  }
}

function parseJson<T>(raw: string): T {
  const trimmed = normalizeJsonText(raw);
  try {
    return JSON.parse(trimmed) as T;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[ai-json-parse-error]", {
        errorMessage: error instanceof Error ? error.message : String(error),
        responseLength: trimmed.length,
      });
    }
    throw new AIJsonParseError(error instanceof Error ? error.message : "Invalid JSON response", trimmed.slice(0, 600));
  }
}

function normalizeJsonText(raw: string): string {
  const withoutFence = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  if (withoutFence.startsWith("{") && withoutFence.endsWith("}")) return withoutFence;
  const extracted = extractFirstJsonObject(withoutFence);
  return extracted ?? withoutFence;
}

function extractFirstJsonObject(value: string): string | null {
  const start = value.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < value.length; i++) {
    const char = value[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") depth++;
    if (char === "}") {
      depth--;
      if (depth === 0) return value.slice(start, i + 1);
    }
  }
  return null;
}

function fallbackResult<T>(fallback: T, errorCode: AIErrorCode, error: unknown): JSONAIResult<T> {
  return {
    data: fallback,
    source: "fallback",
    usedFallback: true,
    errorCode,
    errorMessage: error instanceof Error ? error.message : String(error),
  };
}

function classifyAIError(error: unknown): AIErrorCode {
  if (error instanceof AIJsonParseError) return "AI_INVALID_JSON";
  if (error instanceof AIEmptyResponseError) return "AI_EMPTY_RESPONSE";
  const message = error instanceof Error ? error.message : String(error);
  if (/timeout|timed out|deadline/i.test(message)) return "AI_TIMEOUT";
  if (message) return "AI_PROVIDER_ERROR";
  return "UNKNOWN_ERROR";
}

function logAIError(error: unknown) {
  console.error(aiFailureMessage, {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
    code: classifyAIError(error),
  });
}
