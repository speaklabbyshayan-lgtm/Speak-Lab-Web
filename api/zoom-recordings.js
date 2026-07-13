export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const zoomAccountId = process.env.ZOOM_ACCOUNT_ID;
  const zoomClientId = process.env.ZOOM_CLIENT_ID;
  const zoomClientSecret = process.env.ZOOM_CLIENT_SECRET;

  if (!zoomAccountId || !zoomClientId || !zoomClientSecret) {
    return res.status(500).json({ success: false, message: "Zoom credentials not configured." });
  }

  try {
    // 1. Get Access Token
    const tokenResponse = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${zoomAccountId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${zoomClientId}:${zoomClientSecret}`).toString('base64')}`
      }
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error("Zoom Token Error:", errText);
      throw new Error("Failed to authenticate with Zoom.");
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // 2. Get Users (to find the host's user ID)
    const usersResponse = await fetch('https://api.zoom.us/v2/users?status=active', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    if (!usersResponse.ok) {
      throw new Error("Failed to fetch Zoom users.");
    }

    const usersData = await usersResponse.json();
    if (!usersData.users || usersData.users.length === 0) {
      return res.status(200).json({ success: true, recordings: [], message: "No users found on this Zoom account." });
    }

    // Usually the primary host is the first user
    const hostUserId = usersData.users[0].id;

    // 3. Get Recordings for the host (Checking last 2 months for better coverage)
    const today = new Date();
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(today.getMonth() - 2);

    const fromDate = twoMonthsAgo.toISOString().split('T')[0];
    const toDate = today.toISOString().split('T')[0];

    const recordingsResponse = await fetch(`https://api.zoom.us/v2/users/${hostUserId}/recordings?from=${fromDate}&to=${toDate}&page_size=300`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!recordingsResponse.ok) {
      // If we ask for >1 month, Zoom might fail. Let's fallback to default 1 month range if it fails
      const fallbackResponse = await fetch(`https://api.zoom.us/v2/users/${hostUserId}/recordings?page_size=300`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      if (!fallbackResponse.ok) {
        throw new Error("Failed to fetch Zoom recordings.");
      }
      
      const fallbackData = await fallbackResponse.json();
      return processRecordingsData(res, fallbackData);
    }

    const recordingsData = await recordingsResponse.json();
    return processRecordingsData(res, recordingsData);

  } catch (error) {
    console.error("Zoom API Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

function processRecordingsData(res, data) {
  if (!data.meetings || data.meetings.length === 0) {
    return res.status(200).json({ success: true, recordings: [], message: "No recordings found." });
  }

  // Filter and map the recordings to a clean format for the frontend
  const cleanRecordings = data.meetings.map(meeting => {
    return {
      id: meeting.uuid,
      topic: meeting.topic,
      start_time: meeting.start_time,
      duration: meeting.duration,
      play_url: meeting.share_url,
      // Zoom doesn't provide thumbnails via API without downloading, 
      // so we use a placeholder that matches the SpeakLabs vibe
      thumbnail_url: "https://images.unsplash.com/photo-1543269865-cbf427effbad?q=80&w=600&auto=format&fit=crop"
    };
  });

  // Sort by newest first
  cleanRecordings.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));

  return res.status(200).json({
    success: true,
    recordings: cleanRecordings
  });
}
