import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { aiFailureMessage } from "@/lib/constants";

export type AISource = "gemini" | "openai" | "fallback";

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
}): Promise<{ data: T; source: AISource }> {
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
      return { data: parseJson<T>(response.text || ""), source: "gemini" };
    } catch (error) {
      console.error(aiFailureMessage, error);
      return { data: fallback, source: "fallback" };
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
      if (!raw) throw new Error("Empty OpenAI response");
      return { data: parseJson<T>(raw), source: "openai" };
    } catch (error) {
      console.error(aiFailureMessage, error);
    }
  }

  return { data: fallback, source: "fallback" };
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
      console.error(aiFailureMessage, error);
      return { message: fallback, source: "fallback" };
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
      console.error(aiFailureMessage, error);
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

function parseJson<T>(raw: string): T {
  const trimmed = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "");
  try {
    return JSON.parse(trimmed) as T;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[ai-json-parse-error]", {
        errorMessage: error instanceof Error ? error.message : String(error),
        rawResponsePrefix: trimmed.slice(0, 600),
      });
    }
    throw error;
  }
}
