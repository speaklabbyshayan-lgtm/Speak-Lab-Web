export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
  // Updated model to latest available on user's NVIDIA account
  const NVIDIA_MODEL = "meta/llama-3.3-70b-instruct";

  if (!NVIDIA_API_KEY) {
    return res.status(500).json({ message: 'NVIDIA API key not configured on server' });
  }

  try {
    const { messages } = req.body;

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
  } catch (error) {
    console.error('Chat API Error:', error);
    res.status(500).json({ message: error.message });
  }
}
