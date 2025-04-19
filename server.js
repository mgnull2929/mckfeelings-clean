// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const emotionClusters = {
  calm: ["relaxed", "still", "peaceful"],
  content: ["satisfied", "comfortable", "okay"],
  reflective: ["thoughtful", "pensive", "introspective"],
  anxious: ["nervous", "uneasy", "worried"],
  angry: ["frustrated", "irritated", "resentful"],
  sad: ["down", "blue", "gloomy"],
  happy: ["joyful", "cheerful", "bright"],
  excited: ["energized", "thrilled", "pumped"],
  bored: ["disengaged", "uninterested", "dull"],
  motivated: ["driven", "focused", "determined"],
  overwhelmed: ["pressured", "tense", "burdened"],
  numb: ["blank", "detached", "flat"],
  hopeful: ["optimistic", "confident", "encouraged"],
  discouraged: ["hopeless", "defeated", "beaten"]
};

function fallbackEmotion() {
  return {
    emotion: "calm",
    definition: "Calm means feeling at ease, unbothered, and mentally quiet.",
    synonyms: emotionClusters["calm"]
  };
}

function getValenceArousal(answers) {
  let valence = null;
  let arousal = null;

  for (const a of answers) {
    const p = a.prompt.toLowerCase();
    if (p.includes("pleasant")) valence = a.value;
    if (p.includes("energized")) arousal = a.value;
  }

  return { valence, arousal };
}

app.post("/api/analyze", async (req, res) => {
  const { questions } = req.body;
  if (!questions || !Array.isArray(questions) || questions.length === 0) {
    return res.json(fallbackEmotion());
  }

  const { valence, arousal } = getValenceArousal(questions);

  if (valence >= 4 && arousal <= 3) {
    return res.json({
      emotion: "calm",
      definition: "You feel steady, settled, and unbothered.",
      synonyms: emotionClusters["calm"]
    });
  }

  if (valence <= 2 && arousal >= 4) {
    return res.json({
      emotion: "anxious",
      definition: "Anxious means feeling tense, uneasy, or uncertain.",
      synonyms: emotionClusters["anxious"]
    });
  }

  if (valence <= 2 && arousal <= 2) {
    return res.json({
      emotion: "numb",
      definition: "Numb means feeling emotionally disconnected or blank.",
      synonyms: emotionClusters["numb"]
    });
  }

  if (valence >= 4 && arousal >= 4) {
    return res.json({
      emotion: "excited",
      definition: "Excited means feeling energized, happy, and eager.",
      synonyms: emotionClusters["excited"]
    });
  }

  const formatted = questions
    .map((q, i) => `Q${i + 1}: ${q.prompt} → ${q.value}`)
    .join("\n");

  const prompt = `
You are an expert in emotional psychology. A user answered these slider-based prompts. Based on this, return:
1. One single-word emotion (lowercase).
2. A short, plain-language definition.
3. Three synonyms from the same emotion family.

Return only valid JSON like:
{
  "emotion": "emotion word",
  "definition": "clear explanation",
  "synonyms": ["syn1", "syn2", "syn3"]
}

Answers:
${formatted}
  `.trim();

  try {
    const chat = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5
    });

    const raw = chat.choices[0]?.message?.content?.trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const safeJSON = raw.slice(start, end + 1);
    const parsed = JSON.parse(safeJSON);

    const emotion = parsed.emotion?.toLowerCase();
    const definition = parsed.definition;
    const synonyms = Array.isArray(parsed.synonyms) ? parsed.synonyms : [];

    const validEmotion =
      emotion && !emotion.includes("unknown") && !emotion.includes("none");

    return res.json(
      validEmotion
        ? {
            emotion,
            definition,
            synonyms:
              synonyms.length === 3
                ? synonyms
                : emotionClusters[emotion] || []
          }
        : fallbackEmotion()
    );
  } catch (err) {
    console.error("Analyze error:", err);
    return res.json(fallbackEmotion());
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
