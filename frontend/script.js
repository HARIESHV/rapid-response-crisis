// Determine the correct API base URL
let API_BASE = '/api';
if (window.location.port === '8000' || window.location.protocol === 'file:') {
    API_BASE = 'http://localhost:5000/api';
}
console.log(`Rapid Crisis API initialized at: ${API_BASE}`);
let lastAlertCount = 0;
let selectedAlertId = null;
let currentFilter = 'Active';
let lastTriggeredAlert = null; // Store last triggered alert for follow-ups

// --- Auth Functions ---

async function handleLogin() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    if (!email || !password) return showToast('Please fill all fields');
    
    setLoading('loginBtn', true);
    try {
        const res = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        
        if (data.token) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            showToast('Success! Redirecting...');
            setTimeout(() => {
                window.location.href = data.user.role === 'Admin' ? 'admin.html' : 'dashboard.html';
            }, 1000);
        } else {
            showToast(data.error || 'Login failed');
        }
    } catch (e) {
        showToast('Server error');
    }
    setLoading('loginBtn', false);
}

async function handleRegister() {
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;

    if (!name || !email || !password) return showToast('Please fill all fields');

    setLoading('regBtn', true);
    try {
        const res = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });
        const data = await res.json();
        if (res.ok) {
            showToast('Registered! Please login.');
            toggleForm();
        } else {
            showToast(data.error || 'Registration failed');
        }
    } catch (e) {
        showToast('Server error');
    }
    setLoading('regBtn', false);
}

function logout() {
    localStorage.clear();
    window.location.href = 'index.html';
}

// --- Staff Functions ---

async function submitEmergency() {
    const hotelName = document.getElementById('hotelName').value.trim();
    const address = document.getElementById('manualAddress').value.trim();
    const country = document.getElementById('country') ? document.getElementById('country').value.trim() : '';
    const phoneNumber = document.getElementById('phoneNumber') ? document.getElementById('phoneNumber').value.trim() : '';
    const problemType = document.querySelector('input[name="problemType"]:checked').value;
    
    if (!hotelName || !address) {
        return showToast('❌ Please fill in both Hotel Name and Address');
    }

    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = 'Transmitting...';
    }

    // Reuse the triggerAlert logic but with manual values
    triggerAlert(problemType, address, hotelName, country, phoneNumber);
}

async function triggerAlert(type, manualAddress = null, manualHotel = null, country = '', phoneNumber = '') {
    showToast(`🚨 Transmitting ${type} Emergency...`);

    const success = async (pos) => {
        const latitude = pos ? pos.coords.latitude : 0;
        const longitude = pos ? pos.coords.longitude : 0;
        console.log(`Location: ${latitude}, ${longitude}`);
        
        let address = manualAddress || "Fetching address...";
        let hotelName = manualHotel || "Not Specified";
        
        // If not manually provided, try to fetch from GPS
        if (!manualAddress && pos) {
            try {
                const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`, {
                    headers: { 'User-Agent': 'RapidCrisisResponseSystem/1.0' }
                });
                const geoData = await geoRes.json();
                address = geoData.display_name || "Unknown Location";
            } catch (err) {
                console.error("Geocoding failed:", err);
                address = "GPS acquired, but address could not be resolved.";
            }
        }

        try {
            const token = localStorage.getItem('token');
            if (!token) throw new Error("No auth token found. Please login again.");

            const res = await fetch(`${API_BASE}/create-alert`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ type, address, hotel_name: hotelName, country, phone_number: phoneNumber })
            });
            const data = await res.json();
            
            if (res.ok) {
                showToast('✅ Alert Transmitted Successfully!');
                lastTriggeredAlert = { type, hotelName, address }; // Save for follow-up
                
                const hotelEl = document.getElementById('transmittedHotel');
                const addressEl = document.getElementById('transmittedAddress');
                if (hotelEl) hotelEl.innerText = hotelName;
                if (addressEl) addressEl.innerText = address;
                
                document.getElementById('mainDashboard').classList.add('hidden');
                document.getElementById('alertStatus').classList.remove('hidden');

                // Fire event so dashboard.html can begin polling for admin reply
                if (data.alert_id) {
                    localStorage.setItem('staffAlertId', String(data.alert_id));
                    document.dispatchEvent(new CustomEvent('alertSent', { detail: { alertId: data.alert_id } }));
                }
            } else {
                showToast(`❌ Error: ${data.error || 'Failed to trigger alert'}`);
                resetSubmitBtn();
            }
        } catch (e) {
            console.error('Alert Error:', e);
            showToast(`❌ Network Error: ${e.message}`);
            resetSubmitBtn();
        }
    };

    const error = (err) => {
        let msg = '❌ Location error';
        if (err.code === 1) msg = '❌ Location permission denied. Please enable GPS.';
        if (err.code === 2) msg = '❌ Location unavailable.';
        if (err.code === 3) msg = '❌ Location request timed out.';
        showToast(msg);
        resetSubmitBtn();
    };

    function resetSubmitBtn() {
        const btn = document.getElementById('submitBtn');
        if (btn) {
            btn.disabled = false;
            btn.innerText = 'Submit Emergency';
        }
    }

    if (manualAddress && manualHotel) {
        // Bypass GPS if manual data is provided
        success(null);
    } else {
        if (!navigator.geolocation) {
            return showToast('❌ Geolocation not supported by browser');
        }
        const geoOptions = {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        };
        navigator.geolocation.getCurrentPosition(success, error, geoOptions);
    }
}

async function sendFollowUp() {
    if (!lastTriggeredAlert) return;
    
    const btn = document.getElementById('followUpBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerText = 'Sending Follow-up...';
    }

    const message = `🚨 URGENT FOLLOW-UP: Dear Admin, this is a reminder about the pending ${lastTriggeredAlert.type} alert at ${lastTriggeredAlert.hotelName}. It is time-sensitive and awaiting your response.`;

    try {
        const res = await fetch(`${API_BASE}/send-message`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ content: message })
        });
        
        if (res.ok) {
            showToast('✅ Follow-up message sent to Admin!');
            if (btn) btn.innerText = 'Follow-up Sent';
        }
    } catch (e) {
        showToast('Error sending follow-up');
        if (btn) {
            btn.disabled = false;
            btn.innerText = 'Send Urgent Follow-up';
        }
    }
}

// startLiveTracking removed as requested

// --- Admin Functions ---

let cachedAlerts = []; // Store alerts globally to avoid passing huge JSON strings in HTML

async function fetchAlerts(status = 'Active', isSilent = false) {
    currentFilter = status;
    console.log(`Fetching ${status} alerts...`);
    
    // Update Button UI
    const btnActive = document.getElementById('btnActive');
    const btnResolved = document.getElementById('btnResolved');
    
    if (btnActive && btnResolved) {
        if (status === 'Active') {
            btnActive.className = "px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-bold transition-all";
            btnResolved.className = "px-4 py-2 rounded-xl bg-slate-800 text-slate-400 text-sm font-bold hover:bg-slate-700 transition-all";
        } else {
            btnResolved.className = "px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-bold transition-all";
            btnActive.className = "px-4 py-2 rounded-xl bg-slate-800 text-slate-400 text-sm font-bold hover:bg-slate-700 transition-all";
        }
    }

    const titleEl = document.getElementById('listTitle');
    if (titleEl) {
        titleEl.innerText = status === 'Active' ? 'Incoming Emergencies' : 'Resolved Emergencies';
    }

    try {
        const token = localStorage.getItem('token');
        if (!token) {
            console.error("No token found!");
            return;
        }

        const res = await fetch(`${API_BASE}/get-alerts?status=${status}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) {
            const err = await res.json();
            console.error("Fetch failed:", err);
            return;
        }

        const alerts = await res.json();
        console.log(`Received ${alerts.length} alerts`, alerts);
        
        if (!Array.isArray(alerts)) return;
        cachedAlerts = alerts; // Update global cache

        // Sound Notification for NEW active alerts
        if (status === 'Active' && alerts.length > lastAlertCount) {
            const sound = document.getElementById('alertSound');
            if (sound && !isSilent) {
                sound.currentTime = 0;
                sound.play().catch(e => console.log('Audio blocked by browser.'));
            }
            if (!isSilent) showToast('🚨 NEW EMERGENCY ALERT RECEIVED');
            
            // Pulse effect on the Active button
            if (btnActive) btnActive.classList.add('animate-pulse');
            setTimeout(() => {
                if (btnActive) btnActive.classList.remove('animate-pulse');
            }, 5000);

            // Auto-select the newest alert if none is selected
            if (!selectedAlertId && alerts.length > 0) {
                selectAlert(alerts[0].id);
            }
        }
        if (status === 'Active') lastAlertCount = alerts.length;

        renderAlertList(alerts, status);
        
        // Update details if an alert is selected
        if (selectedAlertId) {
            const current = alerts.find(a => a.id === selectedAlertId);
            if (current) {
                renderAlertDetails(current);
            }
        }
    } catch (e) {
        console.error('Fetch error:', e);
    }
}

function renderAlertList(alerts, status) {
    const container = document.getElementById('alertList');
    if (!container) return;
    
    if (alerts.length === 0) {
        container.innerHTML = `<div class="text-center py-10 text-slate-500">No ${status} alerts</div>`;
        return;
    }

    const accentColor = status === 'Active' ? 'red' : 'green';

    container.innerHTML = alerts.map(alert => {
        const isSelected = alert.id === selectedAlertId;
        return `
            <div onclick="selectAlert(${alert.id})" 
                 class="glass-card p-5 rounded-2xl cursor-pointer border-l-4 ${isSelected ? `border-${accentColor}-500 bg-white/5` : 'border-transparent'} hover:bg-white/10 transition-all mb-4 relative overflow-hidden">
                ${isSelected ? `<div class="absolute inset-0 bg-${accentColor}-600/5 animate-pulse"></div>` : ''}
                <div class="flex justify-between items-start mb-2 relative z-10">
                    <span class="px-2 py-1 rounded-lg bg-${accentColor}-600/20 text-${accentColor}-500 text-[10px] font-black uppercase tracking-widest">${alert.type}</span>
                    <span class="text-slate-500 text-[10px]">${new Date(alert.timestamp).toLocaleTimeString()}</span>
                </div>
                <h4 class="text-white font-bold relative z-10">${alert.staff_name}</h4>
                <p class="text-slate-300 text-[11px] mt-1 relative z-10 font-bold">${alert.hotel_name || 'No Hotel'}</p>
                <p class="text-slate-500 text-[10px] relative z-10 truncate">${alert.address || 'Updating location...'}</p>
                ${alert.country ? `<p class="text-slate-500 text-[9px] mt-1 relative z-10 uppercase tracking-tighter">🌍 ${alert.country}</p>` : ''}
                <p class="text-slate-500 text-[9px] mt-1 relative z-10 uppercase tracking-tighter">Status: ${alert.status}</p>
            </div>
        `;
    }).join('');
}

async function createTestAlert() {
    showToast('🛠️ Sending System Test Alert...');
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE}/create-alert`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ 
                type: 'Security', 
                address: '123 Command Way (SYSTEM TEST)', 
                hotel_name: 'Command Center' 
            })
        });
        if (res.ok) {
            showToast('✅ Test Alert Created!');
            fetchAlerts('Active');
        } else {
            showToast('❌ Test Alert Failed');
        }
    } catch (e) {
        showToast('❌ Connection Error');
    }
}

function selectAlert(alertId) {
    console.log(`Selecting alert ID: ${alertId}`);
    selectedAlertId = alertId;
    const alert = cachedAlerts.find(a => a.id === alertId);
    if (alert) {
        renderAlertDetails(alert);
    }
    // Refresh list to show selection
    renderAlertList(cachedAlerts, currentFilter);
}

function renderAlertDetails(alert) {
    // UI Updates
    const noAlertSelected = document.getElementById('noAlertSelected');
    const alertDetails = document.getElementById('alertDetails');
    
    if (noAlertSelected) noAlertSelected.classList.add('hidden');
    if (alertDetails) alertDetails.classList.remove('hidden');
    
    document.getElementById('detailType').innerText = alert.type;
    document.getElementById('detailStaff').innerText = alert.staff_name;
    document.getElementById('detailTime').innerText = `Triggered ${new Date(alert.timestamp).toLocaleTimeString()}`;
    
    // Inject Background Icon based on type
    const bgIconEl = document.getElementById('detailBgIcon');
    if (bgIconEl) {
        const icons = {
            'Fire': `<svg class="w-96 h-96" fill="currentColor" viewBox="0 0 24 24"><path d="M17.657 18.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`,
            'Medical': `<svg class="w-96 h-96" fill="currentColor" viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>`,
            'Security': `<svg class="w-96 h-96" fill="currentColor" viewBox="0 0 24 24"><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>`
        };
        bgIconEl.innerHTML = icons[alert.type] || '';
        bgIconEl.className = `absolute -bottom-20 -right-20 opacity-5 pointer-events-none transform rotate-12 ${alert.type === 'Fire' ? 'text-red-500' : alert.type === 'Medical' ? 'text-blue-500' : 'text-orange-500'}`;
    }
    
    // Display Hotel & Address
    const coordsEl = document.getElementById('detailCoords');
    if (coordsEl) {
        coordsEl.innerHTML = `
            <div class="text-red-400 font-black text-xl mb-1 uppercase tracking-tighter">${alert.hotel_name || "No Hotel Specified"}</div>
            <div class="text-white font-medium mb-1">${alert.address || "No address provided."}</div>
        `;
    }

    const countryEl = document.getElementById('detailCountry');
    if (countryEl) countryEl.innerText = alert.country || 'N/A';

    const phoneEl = document.getElementById('detailPhone');
    if (phoneEl) phoneEl.innerText = alert.phone_number || 'N/A';

    // Display Dispatched Services
    const dispatchedEl = document.getElementById('dispatchedList');
    if (dispatchedEl) {
        dispatchedEl.innerText = alert.dispatched_services ? `DISPATCHED: ${alert.dispatched_services}` : '';
    }

    // Resolve Button logic — show 'Mark Resolved' only for Active; show badge for Resolved
    const resolveBtn = document.getElementById('resolveBtn');
    if (alert.status === 'Resolved') {
        resolveBtn.classList.add('hidden');
        // Show a Resolved badge if not already present
        let badge = document.getElementById('resolvedBadge');
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'resolvedBadge';
            badge.className = 'bg-green-600/20 border border-green-600/30 text-green-400 px-6 py-3 rounded-2xl font-black uppercase text-xs tracking-widest';
            badge.innerText = '✅ Resolved';
            resolveBtn.parentNode.appendChild(badge);
        } else {
            badge.classList.remove('hidden');
        }
    } else {
        resolveBtn.classList.remove('hidden');
        resolveBtn.onclick = () => resolveAlert(alert.id);
        // Remove Resolved badge if switching back to active alert
        const badge = document.getElementById('resolvedBadge');
        if (badge) badge.classList.add('hidden');
    }

    // Show existing admin reply if any
    const prevEl = document.getElementById('previousReply');
    const prevText = document.getElementById('previousReplyText');
    const replyInput = document.getElementById('adminReplyInput');
    if (replyInput) replyInput.value = '';
    if (prevEl && prevText) {
        if (alert.admin_reply) {
            prevText.innerText = alert.admin_reply;
            prevEl.classList.remove('hidden');
        } else {
            prevEl.classList.add('hidden');
        }
    }
}

function quickReply(message) {
    const input = document.getElementById('adminReplyInput');
    if (input) input.value = message;
}

async function sendAdminReply() {
    if (!selectedAlertId) return showToast('Select an alert first');
    const input = document.getElementById('adminReplyInput');
    const reply = input ? input.value.trim() : '';
    if (!reply) return showToast('Please type or select a reply');

    try {
        const res = await fetch(`${API_BASE}/admin-reply`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ alert_id: selectedAlertId, reply })
        });
        if (res.ok) {
            showToast('✅ Reply sent to staff!');
            if (input) input.value = '';
            const prevEl = document.getElementById('previousReply');
            const prevText = document.getElementById('previousReplyText');
            if (prevEl && prevText) {
                prevText.innerText = reply;
                prevEl.classList.remove('hidden');
            }
            // Update the cached alert's admin_reply so re-renders show it
            const cached = cachedAlerts.find(a => a.id === selectedAlertId);
            if (cached) cached.admin_reply = reply;
        } else {
            showToast('❌ Failed to send reply');
        }
    } catch(e) {
        showToast('❌ Connection error');
    }
}

async function dispatch(service) {
    if (!selectedAlertId) return;
    try {
        const res = await fetch(`${API_BASE}/dispatch-service`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ alert_id: selectedAlertId, service })
        });
        if (res.ok) {
            showToast(`✅ ${service} Dispatched!`);
            fetchAlerts('Active', true); // Refresh to show the new service in the list
        }
    } catch (e) {
        showToast('Error dispatching service');
    }
}

async function resolveAlert(alertId) {
    try {
        const res = await fetch(`${API_BASE}/resolve-alert`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ alert_id: alertId })
        });
        if (res.ok) {
            showToast('✅ Alert marked as Resolved!');
            selectedAlertId = null;
            document.getElementById('alertDetails').classList.add('hidden');
            if (document.getElementById('noAlertSelected')) {
                document.getElementById('noAlertSelected').classList.remove('hidden');
            }
            // Switch to Resolved tab so admin can see the resolved alert
            fetchAlerts('Resolved');
            const btnActive = document.getElementById('btnActive');
            const btnResolved = document.getElementById('btnResolved');
            if (btnActive) { btnActive.classList.remove('bg-red-600', 'text-white'); btnActive.classList.add('bg-slate-800', 'text-slate-400'); }
            if (btnResolved) { btnResolved.classList.remove('bg-slate-800', 'text-slate-400'); btnResolved.classList.add('bg-green-600', 'text-white'); }
        }
    } catch (e) {
        showToast('Error resolving alert');
    }
}

// --- UI Helpers ---

function showToast(msg) {
    console.log('[Toast]', msg);
    const toast = document.getElementById('toast');
    if (!toast) return; // Safety: toast element may not exist on all pages
    toast.innerText = msg;
    toast.style.opacity = '1';
    setTimeout(() => {
        toast.style.opacity = '0';
    }, 3000);
}

function setLoading(btnId, isLoading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (isLoading) {
        btn.disabled = true;
        btn.dataset.oldText = btn.innerText;
        btn.innerText = 'Processing...';
    } else {
        btn.disabled = false;
        btn.innerText = btn.dataset.oldText;
    }
}
