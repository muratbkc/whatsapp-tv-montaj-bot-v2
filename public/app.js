// Admin panel client-side JavaScript
(function () {
    const $ = (sel) => document.querySelector(sel);
    let socket = null;
    let password = '';

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
            // Poll every 30 seconds — keeps table in sync even when status changed directly in Excel
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
            updateStatus(true);
            loadCustomers();
        });

        socket.on('disconnected', () => {
            updateStatus(false);
        });

        socket.on('new_customer', () => {
            loadCustomers();
        });
    }

    function updateStatus(online) {
        const badge = $('#statusBadge');
        if (online) {
            badge.className = 'badge badge-online';
            badge.textContent = '● Bağlı';
        } else {
            badge.className = 'badge badge-offline';
            badge.textContent = '● Bağlı Değil';
        }
    }

    // --- Change Status ---
    window.changeStatus = async function (rowNumber, status) {
        try {
            await fetch('/api/customers/status', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-password': password
                },
                body: JSON.stringify({ rowNumber: parseInt(rowNumber), status })
            });
            // The socket will broadcast 'new_customer' and auto-refresh the table
        } catch (err) {
            console.error('Change status error:', err);
            alert('Durum güncellenirken bir hata oluştu');
        }
    };

    // --- Load customers from API ---
    async function loadCustomers() {
        try {
            const res = await fetch('/api/customers', {
                headers: { 'x-password': password },
            });
            if (!res.ok) return;
            const data = await res.json();

            // Count today's and pending
            const today = new Date();
            const todayStr = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()}`;
            let todayN = 0;
            let pendingN = 0;

            const tbody = $('#customersBody');
            tbody.innerHTML = '';

            (data.recent || []).forEach((c) => {
                if (c.tarih && c.tarih.startsWith(todayStr)) todayN++;
                if (c.durum && c.durum.includes('Bekliyor')) pendingN++;

                const tr = document.createElement('tr');

                const isBekliyor = c.durum.includes('Bekliyor') ? 'selected' : '';
                const isTamamlandi = c.durum.includes('Tamamlandı') ? 'selected' : '';
                const isIptal = c.durum.includes('İptal') ? 'selected' : '';

                tr.innerHTML = `
          <td>${c.tarih}</td>
          <td>${c.isim}</td>
          <td>${c.telefon}</td>
          <td>${c.tv_boyutu}</td>
          <td>${c.montaj_tipi}</td>
          <td>
             <select onchange="changeStatus('${c.rowNumber}', this.value)" class="status-select ${c.durum.includes('Bekliyor') ? 'status-pending' : c.durum.includes('Tamamlandı') ? 'status-completed' : 'status-cancelled'}">
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
})();
