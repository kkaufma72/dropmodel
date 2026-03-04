import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { openai } from "@/lib/openai";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { message?: string; systemPrompt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { message, systemPrompt } = body;
  if (!message || !systemPrompt) {
    return NextResponse.json({ error: "Missing message or systemPrompt" }, { status: 400 });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      max_tokens: 300,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `${message}\n\n(Note: You don't have any knowledge base context yet, so respond as you naturally would given your system instructions.)`,
        },
      ],
    });

    const response = completion.choices[0]?.message?.content?.trim() ?? "";
    return NextResponse.json({ response });
  } catch (err) {
    console.error("[onboarding/test-chat] error:", err);
    return NextResponse.json({ error: "Failed to generate response" }, { status: 500 });
  }
}
