const fs = require('fs');
let html = fs.readFileSync('404.html', 'utf8');
const headerEnd = html.indexOf('</nav>') + 6;
const footerStart = html.indexOf('<footer');
const topPart = html.substring(0, headerEnd);
const bottomPart = html.substring(footerStart);

const adminBody = `
  <style>
    .admin-container {
      max-width: 1200px;
      margin: 40px auto;
      padding: 20px;
    }
    .admin-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-bottom: 40px;
    }
    .stat-card {
      background: #fff;
      padding: 20px;
      border-radius: 10px;
      box-shadow: 0 4px 10px rgba(0,0,0,0.1);
      text-align: center;
      border-top: 5px solid #000;
    }
    .stat-card h3 {
      font-size: 1.2rem;
      color: #666;
      margin-bottom: 10px;
    }
    .stat-card .stat-val {
      font-size: 2.5rem;
      font-weight: bold;
      color: #000;
    }
    .admin-section {
      background: #fff;
      padding: 20px;
      border-radius: 10px;
      box-shadow: 0 4px 10px rgba(0,0,0,0.1);
      margin-bottom: 40px;
    }
    .admin-section h2 {
      margin-bottom: 20px;
      font-size: 1.8rem;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }
    th, td {
      padding: 12px 15px;
      border-bottom: 1px solid #ddd;
    }
    th {
      background-color: #f8f9fa;
      font-weight: bold;
    }
    .status-paid { color: #10b981; font-weight: bold; }
    .status-partial { color: #eab308; font-weight: bold; }
    .status-unpaid { color: #ef4444; font-weight: bold; }
    .unread-row {
      background-color: #e0f2fe;
    }
    select {
      padding: 5px;
      border-radius: 5px;
      border: 1px solid #ccc;
    }
    button.mark-read-btn {
      padding: 5px 10px;
      background: #3b82f6;
      color: #fff;
      border: none;
      border-radius: 5px;
      cursor: pointer;
    }
    button.mark-read-btn:hover { background: #2563eb; }
    
    /* Toggle switch */
    .switch {
      position: relative;
      display: inline-block;
      width: 40px;
      height: 20px;
    }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider {
      position: absolute;
      cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background-color: #ccc;
      transition: .4s;
      border-radius: 20px;
    }
    .slider:before {
      position: absolute;
      content: "";
      height: 16px; width: 16px;
      left: 2px; bottom: 2px;
      background-color: white;
      transition: .4s;
      border-radius: 50%;
    }
    input:checked + .slider {
      background-color: #10b981;
    }
    input:checked + .slider:before {
      transform: translateX(20px);
    }
  </style>

  <main class="admin-container">
    <div class="admin-stats">
      <div class="stat-card">
        <h3>Total Enrollments</h3>
        <div class="stat-val" id="stat-enrollments">0</div>
      </div>
      <div class="stat-card">
        <h3>Confirmed Seats</h3>
        <div class="stat-val" id="stat-confirmed">0</div>
      </div>
      <div class="stat-card">
        <h3>Pending Payments</h3>
        <div class="stat-val" id="stat-pending">0</div>
      </div>
      <div class="stat-card">
        <h3>Unread Messages</h3>
        <div class="stat-val" id="stat-messages">0</div>
      </div>
    </div>

    <div class="admin-section">
      <h2>Enrollments</h2>
      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Name</th>
              <th>WhatsApp</th>
              <th>Email</th>
              <th>City</th>
              <th>Payment Status</th>
              <th>Confirmed</th>
            </tr>
          </thead>
          <tbody id="enrollments-body">
            <tr><td colspan="7">Loading...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="admin-section">
      <h2>Contact Messages</h2>
      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Name</th>
              <th>Email</th>
              <th>WhatsApp</th>
              <th>Message</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody id="messages-body">
            <tr><td colspan="6">Loading...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </main>

  <script>
    // Password protection
    if (prompt("Enter Admin Password:") !== "speaklab2024") {
      window.location.href = "index.html";
    }

    // Helper to format date
    const formatDate = (ds) => {
      if (!ds) return '';
      const d = new Date(ds);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    };

    const loadDashboard = async () => {
      if (!window.supabase) return;
      
      try {
        // Fetch enrollments
        const { data: enrollments, error: eErr } = await supabase
          .from('enrollments')
          .select('*')
          .order('created_at', { ascending: false });
          
        if (eErr) throw eErr;

        // Fetch messages
        const { data: messages, error: mErr } = await supabase
          .from('contact_submissions')
          .select('*')
          .order('created_at', { ascending: false });
          
        if (mErr) throw mErr;

        // Stats
        let confirmed = 0;
        let pending = 0;
        enrollments.forEach(en => {
          if (en.seat_confirmed) confirmed++;
          if (en.payment_status !== 'paid') pending++;
        });

        let unread = 0;
        messages.forEach(msg => {
          if (!msg.is_read) unread++;
        });

        document.getElementById('stat-enrollments').textContent = enrollments.length;
        document.getElementById('stat-confirmed').textContent = confirmed;
        document.getElementById('stat-pending').textContent = pending;
        document.getElementById('stat-messages').textContent = unread;

        // Populate Enrollments Table
        const eBody = document.getElementById('enrollments-body');
        eBody.innerHTML = '';
        enrollments.forEach(en => {
          const selectColor = en.payment_status === 'paid' ? 'status-paid' : (en.payment_status === 'partial' ? 'status-partial' : 'status-unpaid');
          
          eBody.innerHTML += \`
            <tr>
              <td>\${formatDate(en.created_at)}</td>
              <td><strong>\${en.full_name || ''}</strong></td>
              <td>\${en.whatsapp || ''}</td>
              <td>\${en.email || ''}</td>
              <td>\${en.city || ''}</td>
              <td>
                <select class="\${selectColor}" onchange="updatePayment('\${en.id}', this.value, this)">
                  <option value="unpaid" \${en.payment_status === 'unpaid' ? 'selected' : ''}>Unpaid</option>
                  <option value="partial" \${en.payment_status === 'partial' ? 'selected' : ''}>Partial</option>
                  <option value="paid" \${en.payment_status === 'paid' ? 'selected' : ''}>Paid</option>
                </select>
              </td>
              <td>
                <label class="switch">
                  <input type="checkbox" \${en.seat_confirmed ? 'checked' : ''} onchange="updateSeat('\${en.id}', this.checked)">
                  <span class="slider"></span>
                </label>
              </td>
            </tr>
          \`;
        });
        if(enrollments.length === 0) eBody.innerHTML = '<tr><td colspan="7">No enrollments yet.</td></tr>';

        // Populate Messages Table
        const mBody = document.getElementById('messages-body');
        mBody.innerHTML = '';
        messages.forEach(msg => {
          const rowClass = msg.is_read ? '' : 'unread-row';
          const actionBtn = msg.is_read ? '<span style="color:#aaa;">Read</span>' : \`<button class="mark-read-btn" onclick="markRead('\${msg.id}')">Mark Read</button>\`;
          
          mBody.innerHTML += \`
            <tr class="\${rowClass}">
              <td>\${formatDate(msg.created_at)}</td>
              <td><strong>\${msg.full_name || ''}</strong></td>
              <td>\${msg.email || ''}</td>
              <td>\${msg.whatsapp || ''}</td>
              <td>\${msg.message || ''}</td>
              <td>\${actionBtn}</td>
            </tr>
          \`;
        });
        if(messages.length === 0) mBody.innerHTML = '<tr><td colspan="6">No messages yet.</td></tr>';

      } catch(err) {
        console.error('Error loading dashboard:', err);
      }
    };

    window.updatePayment = async (id, status, selectEl) => {
      try {
        const { error } = await supabase.from('enrollments').update({ payment_status: status }).eq('id', id);
        if (error) throw error;
        // Update color
        selectEl.className = status === 'paid' ? 'status-paid' : (status === 'partial' ? 'status-partial' : 'status-unpaid');
        loadDashboard(); // refresh stats
      } catch(err) {
        alert('Failed to update payment status');
        console.error(err);
      }
    };

    window.updateSeat = async (id, confirmed) => {
      try {
        const { error } = await supabase.from('enrollments').update({ seat_confirmed: confirmed }).eq('id', id);
        if (error) throw error;
        loadDashboard(); // refresh stats
      } catch(err) {
        alert('Failed to update seat status');
        console.error(err);
      }
    };

    window.markRead = async (id) => {
      try {
        const { error } = await supabase.from('contact_submissions').update({ is_read: true }).eq('id', id);
        if (error) throw error;
        loadDashboard(); // refresh UI
      } catch(err) {
        alert('Failed to mark as read');
        console.error(err);
      }
    };

    // Initial Load & Auto Refresh
    setTimeout(() => {
      loadDashboard();
      setInterval(loadDashboard, 30000);
    }, 1000);
  </script>
`;

const finalTop = topPart.replace(/<title>.*?<\/title>/, '<title>SpeakLabs - Admin Dashboard</title>');
fs.writeFileSync('admin.html', finalTop + adminBody + bottomPart);
console.log('Created admin.html');
