document.addEventListener('DOMContentLoaded', () => {
  fetchRecordings();
});

async function fetchRecordings() {
  const grid = document.getElementById('recordings-grid');
  const liveBtn = document.getElementById('join-live-btn');

  try {
    // The API verifies this token — recordings are paid course content.
    let token = null;
    if (window.supabaseClient) {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      token = session?.access_token || null;
    }
    if (!token) {
      window.location.replace('login.html?redirect=live-class.html');
      return;
    }

    const response = await fetch('/api/zoom-recordings', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.status === 401) {
      window.location.replace('login.html?redirect=live-class.html');
      return;
    }
    const data = await response.json();
    
    if (data.success) {
      // Clear the loader
      grid.innerHTML = '';
      
      if (data.active_meeting_url) {
        liveBtn.href = data.active_meeting_url;
      }
      
      if (data.recordings && data.recordings.length > 0) {
        data.recordings.forEach(rec => {
          // Format date
          const dateObj = new Date(rec.start_time);
          const dateStr = dateObj.toLocaleDateString('en-US', { 
            weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' 
          });
          
          const card = document.createElement('div');
          card.className = 'recording-card';
          
          card.innerHTML = `
            <a href="${rec.play_url}" target="_blank" class="recording-thumbnail">
              <img src="${rec.thumbnail_url || 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?q=80&w=600&auto=format&fit=crop'}" alt="${rec.topic}">
              <div class="play-icon">
                <svg viewBox="0 0 24 24">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
              </div>
            </a>
            <div class="recording-info">
              <span class="recording-date">${dateStr}</span>
              <h3 class="recording-title">${rec.topic}</h3>
              <div class="recording-meta">
                <span class="duration-tag">${rec.duration} mins</span>
                <a href="${rec.play_url}" target="_blank" class="watch-btn">Watch Now &rarr;</a>
              </div>
            </div>
          `;
          
          grid.appendChild(card);
        });
      } else {
        grid.innerHTML = '<div style="color: #888; text-align: center; width: 100%; padding: 40px;">No recordings available yet.</div>';
      }
    } else {
      throw new Error(data.message || 'Failed to fetch recordings');
    }
  } catch (error) {
    console.error('Error fetching zoom recordings:', error);
    grid.innerHTML = `<div style="color: #ff455b; text-align: center; width: 100%; padding: 40px;">Failed to load recordings: ${error.message}. Please check back later.</div>`;
  }
}
