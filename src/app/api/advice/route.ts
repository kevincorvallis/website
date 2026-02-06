import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const note = formData.get("note") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Only image files are allowed" },
        { status: 400 }
      );
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File must be under 10MB" },
        { status: 400 }
      );
    }

    // 1. Upload to Cloudinary
    const cloudinaryForm = new FormData();
    cloudinaryForm.append("file", file);
    cloudinaryForm.append(
      "upload_preset",
      process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "portfolio_unsigned"
    );
    cloudinaryForm.append("folder", "advice_submissions");

    const cloudinaryRes = await fetch(
      `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: "POST", body: cloudinaryForm }
    );

    if (!cloudinaryRes.ok) {
      return NextResponse.json(
        { error: "Failed to upload image" },
        { status: 500 }
      );
    }

    const cloudinaryData = await cloudinaryRes.json();
    const imageUrl = cloudinaryData.secure_url;
    const cloudinaryId = cloudinaryData.public_id;

    // 2. Send to Claude for analysis
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Convert file to base64
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const mediaType = file.type as
      | "image/jpeg"
      | "image/png"
      | "image/gif"
      | "image/webp";

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            {
              type: "text",
              text: 'Look at this photo and generate a single piece of timeless, heartfelt advice inspired by what you see. The advice should be 1-2 sentences, feel personal and reflective — like wisdom from a close friend. Do not describe the photo. Just give the advice. Return only the advice text, no quotes or attribution.',
            },
          ],
        },
      ],
    });

    const aiText =
      message.content[0].type === "text"
        ? message.content[0].text
        : "Unable to generate advice.";

    // 3. Save to Supabase as pending
    const { data, error } = await supabase
      .from("advice_submissions")
      .insert({
        image_url: imageUrl,
        cloudinary_id: cloudinaryId,
        ai_generated_text: aiText,
        submitter_note: note || null,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        { error: "Failed to save submission" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      advice: aiText,
      id: data.id,
    });
  } catch (err) {
    console.error("API error:", err);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
