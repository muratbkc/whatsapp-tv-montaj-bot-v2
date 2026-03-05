// Admin panel client-side JavaScript
(function () {
    const $ = (sel) => document.querySelector(sel);
    let socket = null;
    let password = '';
    let botPaused = false;
    const STATUS_PENDING = '\u23F3 Bekliyor';
    const STATUS_COMPLETED = '\u2705 Tamamland\u0131';
    const STATUS_CANCELLED = '\u274C \u0130ptal';

    // --- Tab navigation ---
    window.showTab = function (tab) {
        document.querySelectorAll('.tab-content').forEach((el) => (el.style.display = 'none'));
        document.querySelectorAll('.tab-btn').forEach((el) => el.classList.remove('active'));

        const target = $(`#tab-${tab}`);
        if (target) target.style.display = 'block';

        const btn = document.querySelector(`.tab-btn[onclick="showTab('${tab}')"]`);
        if (btn) btn.classList.add('active');
    };

    // --- Login ---
    $('#loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        password = $('#passwordInput').value;

        const res = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password }),
        });

        if (res.ok) {
            $('#loginScreen').style.display = 'none';
            $('#dashboard').style.display = 'block';
            $('#resetSessionBtn').style.display = 'inline-flex';
            initSocket();
            await loadCustomers();
            await loadSettings();
            setInterval(loadCustomers, 30_000);
        } else {
            $('#loginError').style.display = 'block';
        }
    });

    // --- Socket.io ---
    function initSocket() {
        socket = io({ auth: { password } });

        socket.on('qr', (dataUrl) => {
            $('#qrImage').src = dataUrl;
            $('#qrImage').style.display = 'block';
            $('#qrStatus').style.display = 'none';
            $('#qrSection').style.display = 'flex';
            $('#statsSection').style.display = 'none';
            $('#tableSection').style.display = 'none';
            updateStatus(false);
        });

        socket.on('connected', () => {
            $('#qrSection').style.display = 'none';
            $('#statsSection').style.display = 'grid';
            $('#tableSection').style.display = 'block';
            $('#botControlBtn').style.display = 'inline-flex';
            $('#resetSessionBtn').style.display = 'inline-flex';
            updateStatus(true);
            loadCustomers();
        });

        socket.on('disconnected', () => {
            $('#botControlBtn').style.display = 'none';
            $('#resetSessionBtn').style.display = 'inline-flex';
            updateStatus(false);
        });

        socket.on('bot_paused', () => {
            botPaused = true;
            updateBotControlBtn();
        });

        socket.on('bot_resumed', () => {
            botPaused = false;
            updateBotControlBtn();
        });

        socket.on('new_customer', () => loadCustomers());
    }

    // --- Status badge ---
    function updateStatus(online) {
        const badge = $('#statusBadge');
        badge.className = online ? 'badge badge-online' : 'badge badge-offline';
        badge.textContent = online ? '● Bagli' : '● Bagli Degil';
    }

    // --- Bot control button ---
    function updateBotControlBtn() {
        const btn = $('#botControlBtn');
        if (!btn) return;
        if (botPaused) {
            btn.textContent = '▶ Botu Baslat';
            btn.className = 'btn-control btn-start';
        } else {
            btn.textContent = '⏸ Botu Durdur';
            btn.className = 'btn-control btn-stop';
        }
    }

    window.toggleBot = async function () {
        const endpoint = botPaused ? '/api/bot/start' : '/api/bot/stop';
        const btn = $('#botControlBtn');
        btn.disabled = true;
        try {
            const res = await fetch(endpoint, { method: 'POST', headers: { 'x-password': password } });
            if (res.ok) {
                const data = await res.json();
                botPaused = data.paused;
                updateBotControlBtn();
            }
        } catch (err) {
            console.error('Bot control error:', err);
        } finally {
            btn.disabled = false;
        }
    };

    window.resetWhatsappSession = async function () {
        const confirmed = window.confirm('Mevcut WhatsApp hesabi cikis yapacak ve yeni QR kodu olusturulacak. Devam etmek istiyor musunuz?');
        if (!confirmed) return;

        const btn = $('#resetSessionBtn');
        btn.disabled = true;

        try {
            const res = await fetch('/api/bot/reset-session', {
                method: 'POST',
                headers: { 'x-password': password },
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || 'Hesap degistirme islemi basarisiz');
            }

            $('#qrImage').style.display = 'none';
            $('#qrStatus').style.display = 'block';
            $('#qrStatus').textContent = 'Yeni QR olusturuluyor...';
            $('#qrSection').style.display = 'flex';
            $('#statsSection').style.display = 'none';
            $('#tableSection').style.display = 'none';

            showToast('Oturum sifirlandi. Yeni QR kodu birazdan gelecek.');
        } catch (err) {
            showToast(`Hesap degistirme hatasi: ${err.message}`);
        } finally {
            btn.disabled = false;
        }
    };

    // --- Load customers ---
    async function loadCustomers() {
        try {
            const res = await fetch('/api/customers', { headers: { 'x-password': password } });
            if (!res.ok) return;
            const data = await res.json();

            const today = new Date();
            const todayStr = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()}`;
            let todayN = 0;
            let pendingN = 0;

            // Build dynamic header
            const thead = $('#tableHead');
            if (thead && data.headers) {
                thead.innerHTML = ['Tarih', 'Telefon', ...data.headers.filter((h) => !['TARIH', 'TELEFON', 'DURUM'].includes(h)), 'Durum']
                    .map((h) => `<th>${h}</th>`)
                    .join('');
            }

            const tbody = $('#customersBody');
            tbody.innerHTML = '';

            (data.recent || []).forEach((c) => {
                if (c.tarih && c.tarih.startsWith(todayStr)) todayN++;
                if (c.durum && c.durum.includes('Bekliyor')) pendingN++;

                const dynamicCols = data.headers
                    ? data.headers
                        .filter((h) => !['TARIH', 'TELEFON', 'DURUM'].includes(h))
                        .map((h) => `<td>${c.columns?.[h] || '-'}</td>`)
                        .join('')
                    : '';

                const isCompletedStatus = c.durum.includes('Tamamlandi') || c.durum.includes('Tamamland\u0131');
                const isCancelledStatus = c.durum.includes('Iptal') || c.durum.includes('\u0130ptal');
                const statusClass = isCompletedStatus ? 'status-completed' : isCancelledStatus ? 'status-cancelled' : 'status-pending';
                const isBekliyor = c.durum.includes('Bekliyor') ? 'selected' : '';
                const isTamamlandi = isCompletedStatus ? 'selected' : '';
                const isIptal = isCancelledStatus ? 'selected' : '';

                const tr = document.createElement('tr');
                tr.innerHTML = `
                  <td>${c.tarih}</td>
                  <td>${c.telefon}</td>
                  ${dynamicCols}
                  <td>
                    <select onchange="changeStatus('${c.rowNumber}', this.value)" class="status-select ${statusClass}">
                      <option value="${STATUS_PENDING}" ${isBekliyor}>${STATUS_PENDING}</option>
                      <option value="${STATUS_COMPLETED}" ${isTamamlandi}>${STATUS_COMPLETED}</option>
                      <option value="${STATUS_CANCELLED}" ${isIptal}>${STATUS_CANCELLED}</option>
                    </select>
                  </td>`;
                tbody.appendChild(tr);
            });

            $('#todayCount').textContent = todayN;
            $('#pendingCount').textContent = pendingN;
        } catch (err) {
            console.error('Load customers error:', err);
        }
    }

    // --- Change Status ---
    window.changeStatus = async function (rowNumber, status) {
        try {
            const res = await fetch('/api/customers/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-password': password },
                body: JSON.stringify({ rowNumber: parseInt(rowNumber, 10), status }),
            });
            if (!res.ok) alert('Durum guncellenirken bir hata olustu');
        } catch (err) {
            console.error('Change status error:', err);
        }
    };

    // ============================================================
    // SETTINGS
    // ============================================================
    async function apiGet(path) {
        const r = await fetch(path, { headers: { 'x-password': password } });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || 'API hatasi');
        return data;
    }

    async function apiPost(path, body) {
        const r = await fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-password': password },
            body: JSON.stringify(body),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || 'API hatasi');
        return data;
    }

    async function loadSettings() {
        try {
            // Google Sheets config
            const sheets = await apiGet('/api/settings/sheets-config');
            $('#sheetsIdInput').value = sheets.sheetsId || '';
            $('#googleCredsJsonInput').value = sheets.googleCredsJson || '{}';
        } catch (err) {
            showToast(`Ayarlar yuklenemedi: ${err.message}`);
        }
    }

    window.saveGoogleSheetsConfig = async function () {
        const sheetsId = $('#sheetsIdInput').value.trim();
        const googleCredsJson = $('#googleCredsJsonInput').value.trim();

        try {
            JSON.parse(googleCredsJson || '{}');
        } catch {
            showToast('GOOGLE_CREDS_JSON gecerli bir JSON olmali');
            return;
        }

        try {
            await apiPost('/api/settings/sheets-config', { sheetsId, googleCredsJson });
            showToast('Google Sheets ayarlari kaydedildi ✅');
        } catch (err) {
            showToast(`Google Sheets kaydedilemedi: ${err.message}`);
        }
    };

    // --- Toast notification ---
    function showToast(msg) {
        const t = document.createElement('div');
        t.className = 'toast';
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.classList.add('show'), 10);
        setTimeout(() => {
            t.classList.remove('show');
            setTimeout(() => t.remove(), 300);
        }, 2500);
    }
})();
