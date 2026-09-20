const MAX_IMAGE_CHARS = 8_000_000;

function extractText(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const chunks = [];
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") chunks.push(content.text);
      if (typeof content?.output_text === "string") chunks.push(content.output_text);
    }
  }
  return chunks.join("\n").trim();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "OPENAI_API_KEY is not configured on the server."
    });
  }

  try {
    const image = req.body?.image;
    if (
      typeof image !== "string" ||
      !image.startsWith("data:image/") ||
      image.length > MAX_IMAGE_CHARS
    ) {
      return res.status(400).json({ error: "A valid frozen camera image is required." });
    }

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-5.6-luna",
        max_output_tokens: 1400,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  "You are the reading engine for Pocket Readers, a camera magnifier used by someone trying to read real-world print. " +
                  "Read ONLY text that is actually visible in this image. Mentally correct perspective, rotation, glare, curved packaging, and uneven layout. " +
                  "Ignore decorative shapes, isolated letter-like graphics, duplicated branding, barcodes, and visual noise unless they are clearly meaningful text. " +
                  "Do not guess missing words. If characters are too unclear, omit them rather than inventing text. " +
                  "Return the useful text in natural human reading order. Preserve sensible line breaks for labels, ingredients, directions, warnings, prices, dates, and nutrition facts. " +
                  "If the same text appears more than once because of packaging design, read it once. " +
                  "Output plain text only with no commentary, no markdown, and no preface."
              },
              {
                type: "input_image",
                image_url: image,
                detail: "high"
              }
            ]
          }
        ]
      })
    });

    const data = await openaiResponse.json();

    if (!openaiResponse.ok) {
      const message =
        data?.error?.message ||
        `OpenAI request failed with status ${openaiResponse.status}`;
      return res.status(openaiResponse.status).json({ error: message });
    }

    const text = extractText(data);
    if (!text) {
      return res.status(422).json({
        error: "I couldn't confidently read text from that image. Try moving closer, improving lighting, or freezing again."
      });
    }

    return res.status(200).json({ text });
  } catch (error) {
    console.error("Pocket Readers read error:", error);
    return res.status(500).json({
      error: "Something went wrong while reading the frozen image."
    });
  }
}
