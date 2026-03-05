// Admin panel client-side JavaScript
(function () {
    const $ = (sel) => document.querySelector(sel);
    let socket = null;
    let password = '';
    let botPaused = false;
    let currentSteps = [];

    // --- Tab navigation ---
    window.showTab = function (tab) {
        document.querySelectorAll('.tab-content').forEach((el) => (el.style.display = 'none'));
        document.querySelectorAll('.tab-btn').forEach((el) => el.classList.remove('active'));
        $(`#tab-${tab}`).style.display = 'block';
        event.target.classList.add('active');
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
            initSocket();
            loadCustomers();
            loadSettings();
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
            updateStatus(true);
            loadCustomers();
        });

        socket.on('disconnected', () => {
            $('#botControlBtn').style.display = 'none';
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
        badge.textContent = online ? '● Bağlı' : '● Bağlı Değil';
    }

    // --- Bot control button ---
    function updateBotControlBtn() {
        const btn = $('#botControlBtn');
        if (!btn) return;
        if (botPaused) {
            btn.textContent = '▶ Botu Başlat';
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
                botPaused = !botPaused;
                updateBotControlBtn();
            }
        } catch (err) {
            console.error('Bot control error:', err);
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
            let todayN = 0, pendingN = 0;

            // Build dynamic header
            const thead = $('#tableHead');
            if (thead && data.headers) {
                thead.innerHTML = ['Tarih', 'Telefon', ...data.headers.filter(h => !['TARIH', 'TELEFON', 'DURUM'].includes(h)).map(h => h), 'Durum']
                    .map(h => `<th>${h}</th>`).join('');
            }

            const tbody = $('#customersBody');
            tbody.innerHTML = '';

            (data.recent || []).forEach((c) => {
                if (c.tarih && c.tarih.startsWith(todayStr)) todayN++;
                if (c.durum && c.durum.includes('Bekliyor')) pendingN++;

                const dynamicCols = data.headers
                    ? data.headers.filter(h => !['TARIH', 'TELEFON', 'DURUM'].includes(h)).map(h => `<td>${c.columns?.[h] || '-'}</td>`).join('')
                    : '';

                const statusClass = c.durum.includes('Tamamlandı') ? 'status-completed' : c.durum.includes('İptal') ? 'status-cancelled' : 'status-pending';
                const isBekliyor = c.durum.includes('Bekliyor') ? 'selected' : '';
                const isTamamlandi = c.durum.includes('Tamamlandı') ? 'selected' : '';
                const isIptal = c.durum.includes('İptal') ? 'selected' : '';

                const tr = document.createElement('tr');
                tr.innerHTML = `
                  <td>${c.tarih}</td>
                  <td>${c.telefon}</td>
                  ${dynamicCols}
                  <td>
                    <select onchange="changeStatus('${c.rowNumber}', this.value)" class="status-select ${statusClass}">
                      <option value="⏳ Bekliyor" ${isBekliyor}>⏳ Bekliyor</option>
                      <option value="✅ Tamamlandı" ${isTamamlandi}>✅ Tamamlandı</option>
                      <option value="❌ İptal" ${isIptal}>❌ İptal</option>
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
                body: JSON.stringify({ rowNumber: parseInt(rowNumber), status }),
            });
            if (!res.ok) alert('Durum güncellenirken bir hata oluştu');
        } catch (err) {
            console.error('Change status error:', err);
        }
    };

    // ============================================================
    // SETTINGS
    // ============================================================
    async function apiGet(path) {
        const r = await fetch(path, { headers: { 'x-password': password } });
        return r.json();
    }
    async function apiPost(path, body) {
        const r = await fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-password': password },
            body: JSON.stringify(body),
        });
        return r.json();
    }

    async function loadSettings() {
        // Working hours
        const wh = await apiGet('/api/settings/working-hours');
        $('#whEnabled').checked = wh.enabled;
        $('#whStart').value = wh.start;
        $('#whEnd').value = wh.end;
        $('#whMessage').value = wh.offMessage;

        // Confirmation
        const conf = await apiGet('/api/settings/confirmation');
        $('#confirmationMsg').value = conf.message;

        // Flow steps
        currentSteps = await apiGet('/api/settings/flow-steps');
        renderSteps();
    }

    window.updateWorkingHours = async function () {
        await apiPost('/api/settings/working-hours', {
            enabled: $('#whEnabled').checked,
            start: $('#whStart').value,
            end: $('#whEnd').value,
            offMessage: $('#whMessage').value,
        });
    };

    window.saveConfirmation = async function () {
        await apiPost('/api/settings/confirmation', { message: $('#confirmationMsg').value });
        showToast('Onay mesajı kaydedildi ✅');
    };

    // --- Steps ---
    function renderSteps() {
        const list = $('#stepsList');
        list.innerHTML = '';
        currentSteps.forEach((step, i) => {
            const div = document.createElement('div');
            div.className = 'step-card';
            div.innerHTML = `
              <div class="step-header">
                <div class="step-drag-handle">⠿</div>
                <input class="step-label-input" value="${step.label}" placeholder="Adım adı"
                  onchange="currentSteps[${i}].label = this.value" />
                <label class="toggle-switch small">
                  <input type="checkbox" ${step.isActive ? 'checked' : ''}
                    onchange="currentSteps[${i}].isActive = this.checked" />
                  <span class="slider"></span>
                </label>
                <button class="btn-delete" onclick="deleteStep(${i})" title="Adımı Sil">🗑</button>
              </div>
              <div class="step-body">
                <label class="step-sublabel">Sütun adı (Excel)</label>
                <input class="step-col-input" value="${step.sheetColumn}" placeholder="ORNEK_SUTUN"
                  onchange="currentSteps[${i}].sheetColumn = this.value.toUpperCase().replace(/ /g,'_')" />
                <label class="step-sublabel">Bot mesajı <span class="hint-tag">{{name}} ile isim ekle</span></label>
                <textarea rows="3" onchange="currentSteps[${i}].message = this.value">${step.message}</textarea>
              </div>`;
            list.appendChild(div);
        });
    }

    window.addStep = function () {
        const id = 'CUSTOM_' + Date.now();
        currentSteps.push({
            id,
            label: 'Yeni Adım',
            redisKey: id.toLowerCase(),
            sheetColumn: 'YENI_SUTUN',
            isActive: true,
            message: 'Sorunuzu buraya yazın.',
        });
        renderSteps();
    };

    window.deleteStep = function (i) {
        if (currentSteps.length <= 1) { showToast('En az 1 adım olmalı!'); return; }
        currentSteps.splice(i, 1);
        renderSteps();
    };

    window.saveSteps = async function () {
        const btn = document.querySelector('#tab-ayarlar .btn-save[onclick="saveSteps()"]');
        if (btn) btn.disabled = true;
        await apiPost('/api/settings/flow-steps', { steps: currentSteps });
        showToast('Adımlar kaydedildi ✅');
        if (btn) btn.disabled = false;
    };

    // --- Toast notification ---
    function showToast(msg) {
        const t = document.createElement('div');
        t.className = 'toast';
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.classList.add('show'), 10);
        setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2500);
    }
})();
