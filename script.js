document.addEventListener('DOMContentLoaded', () => {

    // =========================================
    // 1. PAGE NAVIGATION
    // =========================================
    const navLinks = document.querySelectorAll('.nav-link, .mobile-nav-link');
    const pages = document.querySelectorAll('.page');

    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href').replace('#', '');
            pages.forEach(p => p.classList.remove('active'));
            navLinks.forEach(l => l.classList.remove('active'));
            
            const targetPage = document.getElementById(targetId);
            if (targetPage) {
                targetPage.classList.add('active');
                document.querySelectorAll(`[href="#${targetId}"]`).forEach(l => l.classList.add('active'));
            }
        });
    });

    // =========================================
    // 2. SENSOR CHART SETUP (CHART.JS)
    // =========================================
    const ctx = document.getElementById('sensorChart');
    let sensorChart;
    const MAX_CHART_POINTS = 30;

    if (ctx) {
        sensorChart = new Chart(ctx, {
            type: 'line',
            data: { labels: [], datasets: [
                { label: 'Ozone (ppm)', data: [], borderColor: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.15)', borderWidth: 2, tension: 0.4, fill: true, pointBackgroundColor: '#0ea5e9' },
                { label: 'Current (mA)', data: [], borderColor: '#34d399', backgroundColor: 'rgba(52, 211, 153, 0.15)', borderWidth: 2, tension: 0.4, fill: true, pointBackgroundColor: '#10b981' }
            ]},
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#e2e8f0', font: { family: "'Inter', sans-serif" } } } },
                scales: {
                    x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255, 255, 255, 0.05)' }, title: { display: true, text: 'Active Time', color: '#64748b' } },
                    y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255, 255, 255, 0.05)' }, title: { display: true, text: 'Sensor Value', color: '#64748b' } }
                }
            }
        });
    }

    // =========================================
    // 3. DUMMY ESP32 DATA SIMULATION
    // =========================================
    const mqttBadge = document.getElementById('mqtt-badge');
    const mqttText = document.getElementById('mqtt-status-text');
    const mqttBrokerInfo = document.getElementById('mqtt-broker-info');

    if (mqttBadge && mqttText) {
        mqttBadge.className = 'mqtt-badge connected';
        mqttText.innerText = 'DUMMY MODE';
    }

    if (mqttBrokerInfo) {
        mqttBrokerInfo.innerText = 'Offline dummy data for ESP32 telemetry testing';
    }

    let lastChartUpdate = 0;
    
    let currentCycleId = null;
    let cycleCount = 0;
    let activeCycle = null;
    let dummyMode = 'normal';
    let dummyIsRunning = false;
    let dummyIsCooling = false;
    let dummyRemainingTime = 0;
    let dummyTotalTime = 0;
    let dummyLoadWeight = 250;

    const dummyDurations = {
        soft: 30,
        normal: 60,
        intensive: 90
    };
    const DUMMY_COOLING_DURATION = 10;

    function getDummyBaseValues(mode) {
        if (mode === 'intensive') return { ozone: 2.4, current: 720, voltage: 24 };
        if (mode === 'soft') return { ozone: 0.9, current: 380, voltage: 12 };
        return { ozone: 1.55, current: 540, voltage: 18 };
    }

    function randomBetween(min, max) {
        return Math.random() * (max - min) + min;
    }

    function buildDummyData() {
        const base = getDummyBaseValues(dummyMode);
        const isActive = dummyIsRunning || dummyIsCooling;
        const progress = dummyTotalTime > 0 ? Math.min(100, Math.round(((dummyTotalTime - dummyRemainingTime) / dummyTotalTime) * 100)) : 0;
        const activityFactor = isActive ? 1 : 0;

        return {
            ozon: isActive ? Math.max(0, base.ozone + randomBetween(-0.08, 0.08)) : 0,
            arus: isActive ? Math.max(0, Math.round(base.current + randomBetween(-18, 18))) : 0,
            load: Math.round(dummyLoadWeight + randomBetween(-3, 3)),
            mode_aktif: dummyMode,
            progress: progress,
            rem_time: dummyRemainingTime,
            is_running: dummyIsRunning,
            is_cooling: dummyIsCooling,
            duty: isActive ? 80 : 0
        };
    }

    function tickDummyTelemetry() {
        const data = buildDummyData();
        updateDashboard(data);
        processHistoryLogging(data);

        if (dummyIsRunning || dummyIsCooling) {
            dummyRemainingTime = Math.max(0, dummyRemainingTime - 1);

            if (dummyRemainingTime === 0 && dummyIsRunning) {
                dummyIsRunning = false;
                dummyIsCooling = true;
                dummyTotalTime = DUMMY_COOLING_DURATION;
                dummyRemainingTime = DUMMY_COOLING_DURATION;
            } else if (dummyRemainingTime === 0 && dummyIsCooling) {
                dummyIsCooling = false;
                dummyTotalTime = 0;
                completeActiveCycle('Completed');
            }
        }
    }

    const dummyTelemetryTimer = setInterval(tickDummyTelemetry, 1000);
    tickDummyTelemetry();

    function formatTime(seconds) {
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    function updateDashboard(data) {
        document.getElementById('val-ozon').innerText = parseFloat(data.ozon).toFixed(2);
        document.getElementById('val-arus').innerText = data.arus;
        document.getElementById('val-beban').innerText = data.load;
        
        let inputVoltage = 0;
        const modeAktif = data.mode_aktif ? data.mode_aktif.toLowerCase() : 'normal';

        if (modeAktif === 'intensive') {
            inputVoltage = 24;
        } else if (modeAktif === 'normal') {
            inputVoltage = 18;
        } else if (modeAktif === 'soft') {
            inputVoltage = 12;
        }

        document.getElementById('val-voltage').innerText = inputVoltage;
        
        document.getElementById('progress-percent').innerText = `${data.progress}%`;
        document.getElementById('progress-fill').style.width = `${data.progress}%`;
        document.getElementById('timer-text').innerText = formatTime(data.rem_time);
        
        const statusTahapan = document.getElementById('status-tahapan');
        if (data.is_running) {
            statusTahapan.innerText = "Sterilization Process";
            statusTahapan.style.color = "#38bdf8";
        } else if (data.is_cooling) {
            statusTahapan.innerText = "Cooling Down";
            statusTahapan.style.color = "#34d399";
        } else {
            statusTahapan.innerText = "System Standby";
            statusTahapan.style.color = "#94a3b8";
        }

        const fanIcon = document.getElementById('fan-icon');
        const fanStatus = document.getElementById('fan-status');
        if (data.is_running || data.is_cooling || data.duty > 0) {
            fanIcon.classList.add('spin');
            fanStatus.innerText = data.is_cooling ? "REVERSE (COOLING)" : "FORWARD (STERIL)";
            fanStatus.style.color = "#34d399";
        } else {
            fanIcon.classList.remove('spin');
            fanStatus.innerText = "STOP";
            fanStatus.style.color = "#f87171";
        }

        // Nonaktifkan visual tombol STOP di web jika sedang cooling down
        const btnStopWeb = document.getElementById('btn-stop');
        if (btnStopWeb) {
            if (data.is_cooling) {
                btnStopWeb.disabled = true;
                btnStopWeb.style.opacity = '0.5';
                btnStopWeb.style.cursor = 'not-allowed';
            } else {
                btnStopWeb.disabled = false;
                btnStopWeb.style.opacity = '1';
                btnStopWeb.style.cursor = 'pointer';
            }
        }

        const modeSelect = document.getElementById('mode-select');
        const activeModeVal = data.mode_aktif.toLowerCase();
        if (modeSelect.value !== activeModeVal && !data.is_running && !data.is_cooling) {
            modeSelect.value = activeModeVal;
        }

        const now = Date.now();
        if (sensorChart && now - lastChartUpdate > 3000 && (data.is_running || data.is_cooling)) {
            lastChartUpdate = now;
            const timeLabel = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' });
            
            sensorChart.data.labels.push(timeLabel);
            sensorChart.data.datasets[0].data.push(parseFloat(data.ozon).toFixed(2));
            sensorChart.data.datasets[1].data.push(data.arus);
            
            if (sensorChart.data.labels.length > MAX_CHART_POINTS) {
                sensorChart.data.labels.shift();
                sensorChart.data.datasets[0].data.shift();
                sensorChart.data.datasets[1].data.shift();
            }
            sensorChart.update();
        }
    }

    // =========================================
    // 4. HISTORY LOGGING LOGIC PER CYCLE
    // =========================================
    const historyTbody = document.getElementById('history-tbody');
    const filterCycleDropdown = document.getElementById('filter-cycle');
    const HISTORY_STORAGE_KEY = 'conpas_dummy_history';
    let historyRecords = loadHistoryRecords();

    function loadHistoryRecords() {
        try {
            return JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY)) || [];
        } catch (e) {
            return [];
        }
    }

    function saveHistoryRecords() {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(historyRecords));
    }

    function renderHistoryTable() {
        historyTbody.innerHTML = '';
        filterCycleDropdown.innerHTML = '<option value="ALL">All Cycles (View All)</option>';

        historyRecords.forEach((record) => {
            const opt = document.createElement('option');
            opt.value = record.cycleId;
            opt.innerText = record.optionText;
            filterCycleDropdown.appendChild(opt);

            const tr = document.createElement('tr');
            tr.setAttribute('data-cycle', record.cycleId);
            tr.innerHTML = `
                <td>${record.recordTime}</td>
                <td>${record.mode}</td>
                <td>${record.duration}</td>
                <td>${record.current} mA</td>
                <td>${record.load} g</td>
                <td>${record.ozone} ppm</td>
                <td><span class="badge-status success">${record.stage}</span></td>
                <td style="text-align: center;"><button class="btn-action btn-del btn-row-del" data-cycle="${record.cycleId}" title="Delete">🗑️</button></td>
            `;
            historyTbody.prepend(tr);
        });

        applyCycleFilter();
    }

    function processHistoryLogging(data) {
        const isActiveNow = data.is_running || data.is_cooling;
        if (!isActiveNow || !activeCycle) return;

        activeCycle.samples.push({
            ozon: Number(data.ozon),
            arus: Number(data.arus),
            load: Number(data.load)
        });
    }

    function beginActiveCycle() {
        cycleCount++;
        const now = new Date();
        const timeStr = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
        const modeText = dummyMode.toUpperCase();

        currentCycleId = `Cycle-${cycleCount}-${modeText}`;
        activeCycle = {
            cycleId: currentCycleId,
            optionText: `Siklus ${cycleCount} (${modeText}) - ${timeStr}`,
            startTime: now,
            mode: `${modeText} MODE`,
            sterilizationDuration: dummyDurations[dummyMode],
            samples: []
        };
    }

    function completeActiveCycle(stage) {
        if (!activeCycle) return;

        const samples = activeCycle.samples.length > 0 ? activeCycle.samples : [{ ozon: 0, arus: 0, load: dummyLoadWeight }];
        const avgCurrent = Math.round(samples.reduce((sum, item) => sum + item.arus, 0) / samples.length);
        const avgLoad = Math.round(samples.reduce((sum, item) => sum + item.load, 0) / samples.length);
        const avgOzone = samples.reduce((sum, item) => sum + item.ozon, 0) / samples.length;
        const now = new Date();
        const elapsedSeconds = Math.max(1, Math.round((now - activeCycle.startTime) / 1000));
        const cycleDuration = stage === 'Completed'
            ? activeCycle.sterilizationDuration + DUMMY_COOLING_DURATION
            : elapsedSeconds;

        historyRecords.push({
            cycleId: activeCycle.cycleId,
            optionText: activeCycle.optionText,
            recordTime: now.toLocaleDateString('en-US') + ' ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute:'2-digit' }),
            mode: activeCycle.mode,
            duration: formatTime(cycleDuration),
            current: avgCurrent,
            load: avgLoad,
            ozone: avgOzone.toFixed(2),
            stage: stage
        });

        saveHistoryRecords();
        renderHistoryTable();
        filterCycleDropdown.value = 'ALL';
        applyCycleFilter();
        activeCycle = null;
    }

    if (historyRecords.length > 0) {
        const lastCycleNumbers = historyRecords.map((record) => {
            const match = record.cycleId.match(/^Cycle-(\d+)-/);
            return match ? Number(match[1]) : 0;
        });
        cycleCount = Math.max(...lastCycleNumbers);
    }
    renderHistoryTable();

    // =========================================
    // 5. DASHBOARD CONTROL BUTTONS
    // =========================================
    document.getElementById('btn-start').addEventListener('click', () => {
        if (activeCycle) completeActiveCycle('Stopped');
        dummyMode = document.getElementById('mode-select').value;
        dummyIsRunning = true;
        dummyIsCooling = false;
        dummyTotalTime = dummyDurations[dummyMode];
        dummyRemainingTime = dummyTotalTime;
        dummyLoadWeight = Math.round(randomBetween(180, 420));
        beginActiveCycle();
        tickDummyTelemetry();
    });

    document.getElementById('btn-stop').addEventListener('click', () => {
        if (dummyIsRunning || dummyIsCooling) completeActiveCycle('Stopped');
        dummyIsRunning = false;
        dummyIsCooling = false;
        dummyRemainingTime = 0;
        dummyTotalTime = 0;
        tickDummyTelemetry();
    });

    document.getElementById('mode-select').addEventListener('change', (e) => {
        dummyMode = e.target.value;
        tickDummyTelemetry();
    });

    // =========================================
    // 6. HISTORY FILTER & EXPORT FEATURES
    // =========================================
    function applyCycleFilter() {
        const filterVal = filterCycleDropdown.value;
        const rows = document.querySelectorAll('#history-tbody tr');
        rows.forEach(row => {
            if (filterVal === 'ALL' || row.getAttribute('data-cycle') === filterVal) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    }

    filterCycleDropdown.addEventListener('change', applyCycleFilter);

    function getVisibleTableData() {
        const rows = document.querySelectorAll('#history-tbody tr');
        let data = [];
        rows.forEach(row => {
            if (row.style.display !== 'none') data.push(row);
        });
        return data;
    }

    document.getElementById('btn-export-excel').addEventListener('click', () => {
        const visibleRows = getVisibleTableData();
        if (visibleRows.length === 0) { alert('No data to export!'); return; }

        let csv = [['Record Time', 'Active Mode', 'Remaining Time', 'Current', 'Load', 'Ozone', 'Stage']];
        visibleRows.forEach(row => {
            let cols = row.querySelectorAll('td');
            let rowData = [];
            for (let i = 0; i < cols.length - 1; i++) { 
                rowData.push(`"${cols[i].innerText.trim()}"`);
            }
            csv.push(rowData.join(','));
        });

        const csvContent = 'data:text/csv;charset=utf-8,' + csv.join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        
        const cycleName = filterCycleDropdown.value === 'ALL' ? 'ALL_CYCLES' : filterCycleDropdown.value;
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `CONPAS_History_${cycleName}_${new Date().toISOString().slice(0,10)}.csv`);
        
        document.body.appendChild(link); link.click(); link.remove();
    });

    document.getElementById('btn-export-pdf').addEventListener('click', () => {
        const visibleRows = getVisibleTableData();
        if (visibleRows.length === 0) { alert('No data to export!'); return; }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        doc.setFont("helvetica", "bold"); doc.setFontSize(16);
        doc.text("CONPAS System - Historical Data", 14, 15);
        doc.setFont("helvetica", "normal"); doc.setFontSize(10);
        
        const selectedText = filterCycleDropdown.options[filterCycleDropdown.selectedIndex].text;
        doc.text(`Recorded Cycle: ${selectedText}`, 14, 22);

        doc.autoTable({
            html: '#table-historis',
            startY: 28,
            columns: [0, 1, 2, 3, 4, 5, 6],
            theme: 'grid',
            styles: { fontSize: 9, cellPadding: 3 },
            headStyles: { fillColor: [14, 165, 233], textColor: [255, 255, 255] },
            didParseRow: function(data) {
                if (data.row.raw.style && data.row.raw.style.display === 'none') {
                    data.row.height = 0;
                    data.row.cells = {};
                }
            }
        });

        const cycleName = filterCycleDropdown.value === 'ALL' ? 'ALL_CYCLES' : filterCycleDropdown.value;
        doc.save(`CONPAS_History_${cycleName}_${new Date().toISOString().slice(0,10)}.pdf`);
    });

    document.getElementById('btn-delete-all').addEventListener('click', () => {
        if (historyTbody.children.length === 0) return alert('Table is already empty.');
        if (confirm('Are you sure you want to delete ALL historical data?')) {
            historyRecords = [];
            saveHistoryRecords();
            renderHistoryTable();
            cycleCount = 0; 
        }
    });

    historyTbody.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-row-del')) {
            if (confirm('Delete this log?')) {
                const cycleId = e.target.getAttribute('data-cycle') || e.target.closest('tr').getAttribute('data-cycle');
                historyRecords = historyRecords.filter((record) => record.cycleId !== cycleId);
                saveHistoryRecords();
                renderHistoryTable();
            }
        }
    });
    
    const btnDownloadChart = document.getElementById('btn-download-chart');
    if (btnDownloadChart && sensorChart) {
        btnDownloadChart.addEventListener('click', () => {
            const canvas = document.getElementById('sensorChart');
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvas.width; tempCanvas.height = canvas.height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.fillStyle = '#0b1120';
            tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
            tempCtx.drawImage(canvas, 0, 0);
            
            const link = document.createElement('a');
            link.download = `CONPAS_Chart_${new Date().toISOString().slice(0,10)}.png`;
            link.href = tempCanvas.toDataURL('image/png');
            link.click();
        });
    }

    // =========================================
    // 7. JAM LIVE & TOGGLE MUTE ALARM
    // =========================================
    function updateClock() {
        const clockTime = document.getElementById('clock-time');
        const clockDate = document.getElementById('clock-date');
        if (!clockTime || !clockDate) return;

        const now = new Date();
        const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
        clockTime.textContent = now.toLocaleTimeString('id-ID', timeOptions).replace(/\./g, ':');
        
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        clockDate.textContent = now.toLocaleDateString('id-ID', dateOptions);
    }

    setInterval(updateClock, 1000);
    updateClock();

    const toggleMute = document.getElementById('toggle-mute');
    if (toggleMute) {
        toggleMute.addEventListener('change', (e) => {
            if (e.target.checked) {
                console.log("Alarm status: MUTED");
            } else {
                console.log("Alarm status: UNMUTED");
            }
        });
    }

});
