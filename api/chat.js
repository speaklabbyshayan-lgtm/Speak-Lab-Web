export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const NVIDIA_MODEL = "meta/llama-3.3-70b-instruct";
  const GEMINI_MODEL = "gemini-3.5-flash"; // Using the latest working Gemini model

  if (!NVIDIA_API_KEY && !GEMINI_API_KEY) {
    return res.status(500).json({ message: 'API keys not configured on server' });
  }

  try {
    const { messages } = req.body;
    let geminiError = null;

    // Try Gemini API First
    if (GEMINI_API_KEY) {
      try {
        const geminiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${GEMINI_API_KEY}`
          },
          body: JSON.stringify({
            model: GEMINI_MODEL,
            messages: messages,
            temperature: 0.7,
            max_tokens: 1024,
            stream: false
          })
        });

        if (geminiResponse.ok) {
          const data = await geminiResponse.json();
          return res.status(200).json(data);
        } else {
          const errText = await geminiResponse.text();
          console.error("Gemini API Error:", errText);
          geminiError = new Error(`Gemini API error: ${geminiResponse.status} - ${errText}`);
        }
      } catch (err) {
        console.error("Gemini Fetch Error:", err);
        geminiError = err;
      }
    }

    // Fallback to NVIDIA API if Gemini failed or is not configured
    if (NVIDIA_API_KEY) {
      console.log("Falling back to NVIDIA API...");
      const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${NVIDIA_API_KEY}`
        },
        body: JSON.stringify({
          model: NVIDIA_MODEL,
          messages: messages,
          temperature: 0.7,
          max_tokens: 1024,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`NVIDIA API error: ${response.statusText}`);
      }

      const data = await response.json();
      return res.status(200).json(data);
    } else {
      if (geminiError) throw geminiError;
      throw new Error("No NVIDIA API Key to fallback to.");
    }
  } catch (error) {
    console.error('Chat API Error:', error);
    res.status(500).json({ message: error.message });
  }
}
