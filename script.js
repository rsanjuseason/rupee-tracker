// ==========================================
// STATE & CONFIG
// ==========================================
const CLOUD_URL = "https://script.google.com/macros/s/AKfycbww9WoOJyvoVcFkrVN_gBnvpNWLsne7G_hBj0JhQu40TMGHWmGR_yZzLIwT4Y6hJ4qYww/exec"; 

const DEFAULT_CATS = {
    expense: ['🍔 Food & Dining', '🛒 Groceries', '🚗 Transport & Fuel', '🛍️ Shopping', '🏠 Rent & Utilities', '🎮 Entertainment', '🏥 Medical', '🎓 Education', '🔄 Subscriptions', '✨ Misc'],
    income: ['💰 Salary', '💼 Freelance', '📈 Investments', '🎁 Gifts'],
    lend: ['🤝 Lent', '📥 Borrowed']
};

let rawTransactions = []; // Unfiltered cloud data
let filteredTransactions = []; // Data for current period
let goals = []; // Cloud goals

let appState = {
    periodType: 'month', // 'month' or 'week'
    anchorDate: new Date(),
    txMode: 'expense',
    editingTxId: null
};

let userPrefs = {
    theme: 'light',
    globalBudget: 25000,
    customCategories: [], // {name, type}
    categoryBudgets: {}, // {'Food': 5000}
    exchangeRates: { USD: 83.5, EUR: 90.2, GBP: 105.1 }
};

const $ = id => document.getElementById(id);

// ==========================================
// INITIALIZATION
// ==========================================
function init() {
    loadPrefs();
    applyTheme();
    initListeners();
    $('tx-date').value = dateToISO(new Date());
    updatePeriodLabel();
    populateCategoryDropdown();
    populateMicroBudgetInputs();
    
    // Auto-fetch if URL is set
    if(CLOUD_URL !== "YOUR_GOOGLE_SCRIPT_WEB_APP_URL") {
        fetchFromCloud();
    } else {
        alert("Please set CLOUD_URL in the HTML to sync with Google Sheets.");
    }
}

// ==========================================
// PREFERENCES (Local Storage)
// ==========================================
function loadPrefs() {
    const saved = localStorage.getItem('rupee_prefs_v2');
    if(saved) userPrefs = { ...userPrefs, ...JSON.parse(saved) };
}
function savePrefs() {
    localStorage.setItem('rupee_prefs_v2', JSON.stringify(userPrefs));
    applyTheme();
    populateCategoryDropdown();
    populateMicroBudgetInputs();
    renderAll();
}
function applyTheme() {
    if(userPrefs.theme === 'dark') document.body.setAttribute('data-theme', 'dark');
    else document.body.removeAttribute('data-theme');
}

// ==========================================
// CLOUD SYNC (The Single Source of Truth)
// ==========================================
async function fetchFromCloud() {
    const btn = $('btn-save-tx');
    btn.textContent = "Pulling from Cloud...";
    btn.disabled = true;
    try {
        const res = await fetch(CLOUD_URL);
        const json = await res.json();
        if(json.status === 'success') {
            rawTransactions = json.data.transactions || [];
            goals = json.data.goals || [];
            renderAll();
        }
    } catch (e) {
        console.error("Cloud Error", e);
        alert("Failed to fetch from cloud.");
    }
    btn.textContent = "Log to Cloud";
    btn.disabled = false;
}

async function pushToCloud(payload) {
    if(CLOUD_URL === "YOUR_GOOGLE_SCRIPT_WEB_APP_URL") return alert("No Cloud URL set");
    const btn = $('btn-save-tx');
    const oldTxt = btn.textContent;
    btn.textContent = "Syncing...";
    btn.disabled = true;
    try {
        await fetch(CLOUD_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        // Optimistic UI approach: we already updated local arrays before calling this.
        // We could fetchFromCloud() here to ensure perfect sync, but that's slow.
    } catch(e) {
        console.error(e);
        alert("Failed to sync to cloud.");
    }
    btn.textContent = oldTxt;
    btn.disabled = false;
}

// ==========================================
// CORE LOGIC & FILTERING
// ==========================================
function getCombinedCategories(type) {
    let cats = [...(DEFAULT_CATS[type] || [])];
    userPrefs.customCategories.filter(c => c.type === type).forEach(c => cats.push(c.name));
    return cats;
}

function getAmountINR(tx) {
    const amt = parseFloat(tx.amount) || 0;
    const curr = tx.currency || 'INR';
    if(curr === 'INR') return amt;
    const rate = userPrefs.exchangeRates[curr] || 1;
    return amt * rate;
}

function dateToISO(date) {
    return date.toISOString().split('T')[0];
}
function isoToDate(iso) {
    if(!iso) return new Date();
    const p = iso.split('-');
    return new Date(p[0], p[1]-1, p[2]);
}

function getPeriodBounds() {
    const d = new Date(appState.anchorDate);
    if(appState.periodType === 'month') {
        const start = new Date(d.getFullYear(), d.getMonth(), 1);
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        return { start, end };
    } else {
        // Week (Mon-Sun)
        const day = d.getDay() || 7; // 1-7 (Mon-Sun)
        const start = new Date(d);
        start.setDate(d.getDate() - day + 1);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        return { start, end };
    }
}

function applyFilters() {
    const bounds = getPeriodBounds();
    const startStr = dateToISO(bounds.start);
    const endStr = dateToISO(bounds.end);
    
    filteredTransactions = rawTransactions.filter(tx => {
        return tx.date >= startStr && tx.date <= endStr;
    });

    const search = $('search-input').value.toLowerCase();
    if(search) {
        filteredTransactions = filteredTransactions.filter(tx => 
            (tx.note && tx.note.toLowerCase().includes(search)) ||
            (tx.category && tx.category.toLowerCase().includes(search)) ||
            (tx.amount && String(tx.amount).includes(search))
        );
    }
    
    // Sort desc by date
    filteredTransactions.sort((a,b) => b.date.localeCompare(a.date));
}

// ==========================================
// RENDERERS
// ==========================================
function renderAll() {
    applyFilters();
    renderDashboard();
    renderEntries();
    renderSubscriptions();
    renderGoals();
}

function formatINR(num) {
    return '₹' + Math.round(num).toLocaleString('en-IN');
}

function renderDashboard() {
    let spend = 0, income = 0;
    let catTotals = {};

    filteredTransactions.forEach(tx => {
        const inr = getAmountINR(tx);
        if(tx.type === 'expense') {
            spend += inr;
            catTotals[tx.category] = (catTotals[tx.category] || 0) + inr;
        } else if (tx.type === 'income') {
            income += inr;
        }
    });

    $('stat-spend').textContent = formatINR(spend);
    $('stat-income').textContent = formatINR(income);
    $('stat-net').textContent = formatINR(income - spend);
    $('stat-total-txns').textContent = rawTransactions.length;

    // Global Budget
    const cap = userPrefs.globalBudget || 1;
    const pct = Math.min(100, (spend / cap) * 100);
    $('budget-spent-global').textContent = formatINR(spend);
    $('budget-cap-global').textContent = userPrefs.globalBudget;
    $('budget-pct-global').textContent = Math.round(pct) + '%';
    const bar = $('budget-bar-global');
    bar.style.width = pct + '%';
    bar.style.background = pct > 90 ? 'var(--expense)' : (pct > 75 ? 'var(--warning)' : 'var(--income)');

    // Micro Budgets
    let mbHtml = '';
    for(const [cat, bcap] of Object.entries(userPrefs.categoryBudgets)) {
        if(!bcap || bcap <= 0) continue;
        const cSpent = catTotals[cat] || 0;
        const cPct = Math.min(100, (cSpent / bcap) * 100);
        const cColor = cPct > 90 ? 'var(--expense)' : 'var(--accent)';
        mbHtml += `
            <div class="micro-budget-item">
                <div class="micro-budget-label"><span>${cat}</span> <span>${formatINR(cSpent)} / ${formatINR(bcap)}</span></div>
                <div class="micro-bar-bg"><div class="bar-fill" style="width:${cPct}%; background:${cColor}"></div></div>
            </div>
        `;
    }
    $('micro-budgets').innerHTML = mbHtml || '<div class="empty-state">No micro-budgets set.</div>';

    // Categories Chart (Bars)
    let catsArr = Object.entries(catTotals).sort((a,b) => b[1] - a[1]).slice(0,5);
    let maxC = catsArr.length ? catsArr[0][1] : 1;
    let cHtml = catsArr.map(c => `
        <div class="cat-row">
            <div class="cat-info"><span>${c[0]}</span><span>${formatINR(c[1])}</span></div>
            <div class="micro-bar-bg"><div class="bar-fill" style="width:${(c[1]/maxC)*100}%; background:linear-gradient(90deg, var(--accent), var(--expense))"></div></div>
        </div>
    `).join('');
    $('category-breakdown').innerHTML = cHtml || '<div class="empty-state">No expenses to analyze.</div>';

    // Donut
    if(spend === 0 && income === 0) {
        $('donut-chart').innerHTML = '<div class="empty-state">Log entries to see ratio.</div>';
    } else {
        const total = spend + income;
        const eDeg = (spend/total)*360;
        $('donut-chart').innerHTML = `
            <div class="donut-container">
                <div style="width:140px; height:140px; border-radius:50%; background:conic-gradient(var(--expense) 0deg ${eDeg}deg, var(--income) ${eDeg}deg 360deg)"></div>
                <div class="donut-hole"><span>Net Flow</span><strong>${formatINR(income-spend)}</strong></div>
            </div>
            <div class="donut-legend">
                <span style="color:var(--expense)">■ Exp: ${Math.round((spend/total)*100)}%</span>
                <span style="color:var(--income)">■ Inc: ${Math.round((income/total)*100)}%</span>
            </div>
        `;
    }
}

function renderEntries() {
    const list = $('tx-list');
    if(!filteredTransactions.length) {
        list.innerHTML = `<div class="empty-state">No records found for this period.</div>`;
        return;
    }
    
    list.innerHTML = filteredTransactions.map(tx => {
        const icon = tx.type === 'expense' ? '📉' : (tx.type === 'income' ? '💰' : '🤝');
        const inr = getAmountINR(tx);
        const currStr = tx.currency !== 'INR' ? ` (${tx.amount} ${tx.currency})` : '';
        const recStr = tx.recurring ? `<span class="tx-tag">🔄</span>` : '';
        
        return `
        <div class="tx-item type-${tx.type}">
            <div class="tx-left">
                <div class="tx-cat">${icon} ${tx.category}</div>
                <div class="tx-desc">${tx.note || tx.mode} ${recStr}</div>
                <div class="tx-actions">
                    <button class="action-btn" onclick="editTx('${tx.id}')">Edit</button>
                    <button class="action-btn" onclick="deleteTx('${tx.id}')">Delete</button>
                </div>
            </div>
            <div class="tx-right">
                <div class="tx-amt ${tx.type === 'expense' ? 'c-expense' : 'c-income'}">${tx.type==='expense'?'-':'+'}${formatINR(inr)}</div>
                <div style="font-size:0.7rem; color:var(--text-sub)">${currStr}</div>
                <div class="tx-date">${tx.date}</div>
            </div>
        </div>`;
    }).join('');
}

function renderSubscriptions() {
    const list = $('subs-list');
    // Find unique recurring expenses (most recent log per category/note combo)
    const recurrings = rawTransactions.filter(t => t.type === 'expense' && t.recurring);
    let subs = {};
    recurrings.forEach(tx => {
        const key = tx.category + '_' + tx.note;
        if(!subs[key] || subs[key].date < tx.date) {
            subs[key] = tx;
        }
    });
    
    const arr = Object.values(subs);
    if(!arr.length) {
        list.innerHTML = '<div class="empty-state">No recurring expenses found. Check "Recurring" when logging bills.</div>';
        return;
    }
    
    let totalMonthly = 0;
    const html = arr.map(tx => {
        const inr = getAmountINR(tx);
        totalMonthly += inr;
        const lastD = isoToDate(tx.date);
        const nextD = new Date(lastD);
        nextD.setMonth(nextD.getMonth() + 1); // rough +1 month prediction
        const overdue = nextD < new Date() ? 'c-expense' : 'c-text-sub';
        
        return `
        <div class="sub-item">
            <div>
                <div style="font-weight:700;">${tx.category}</div>
                <div style="font-size:0.8rem; color:var(--text-sub)">${tx.note}</div>
                <div style="font-size:0.75rem; margin-top:4px;" class="${overdue}">Next due: ~${dateToISO(nextD)}</div>
            </div>
            <div style="text-align:right;">
                <div style="font-weight:800; color:var(--expense)">${formatINR(inr)}</div>
                <div style="font-size:0.7rem; color:var(--text-sub)">/ month</div>
            </div>
        </div>`;
    }).join('');
    
    list.innerHTML = `<div style="font-size:1.1rem; font-weight:800; margin-bottom:12px; text-align:right;">Est. Monthly: <span class="c-expense">${formatINR(totalMonthly)}</span></div>` + html;
}

function renderGoals() {
    const list = $('goals-list');
    if(!goals.length) {
        list.innerHTML = '<div class="empty-state">No goals set. Create one to start saving!</div>';
        return;
    }
    list.innerHTML = goals.map(g => {
        const pct = Math.min(100, (g.current / g.target) * 100);
        return `
        <div class="goal-card">
            <button class="contribute-btn" onclick="contributeGoal('${g.id}', '${g.name}')">Contribute</button>
            <div class="goal-header">
                <div class="goal-title">${g.name}</div>
            </div>
            <div class="bar-bg"><div class="bar-fill" style="width:${pct}%; background:var(--accent)"></div></div>
            <div class="goal-stats">${formatINR(g.current)} / ${formatINR(g.target)} (${Math.round(pct)}%)</div>
            <div style="display:flex; gap:8px; margin-top:12px;">
                <button class="action-btn" onclick="editGoal('${g.id}')">Edit</button>
                <button class="action-btn" onclick="deleteGoal('${g.id}')">Delete</button>
            </div>
        </div>`;
    }).join('');
}

// ==========================================
// ACTIONS (Log, Edit, Delete)
// ==========================================
function saveTransaction() {
    const amt = parseFloat($('tx-amount').value);
    const date = $('tx-date').value;
    if(!amt || !date) return alert("Amount and Date required");
    
    const payload = {
        action: appState.editingTxId ? 'edit' : 'add',
        id: appState.editingTxId || (Date.now() + "_" + Math.random().toString(36).substr(2,5)),
        date: date,
        type: appState.txMode,
        category: $('tx-category').value,
        mode: $('tx-mode').value,
        note: $('tx-note').value,
        amount: amt,
        currency: $('tx-currency').value,
        recurring: $('tx-recurring').checked
    };

    // Optimistic Update
    if(payload.action === 'edit') {
        const idx = rawTransactions.findIndex(t => t.id === payload.id);
        if(idx > -1) rawTransactions[idx] = payload;
    } else {
        rawTransactions.push(payload);
    }
    
    // Reset Form
    $('tx-amount').value = '';
    $('tx-note').value = '';
    $('tx-recurring').checked = false;
    appState.editingTxId = null;
    $('form-heading').textContent = "✍️ Log Entry";
    $('btn-cancel-edit').style.display = 'none';
    
    renderAll();
    pushToCloud(payload);
}

function editTx(id) {
    const tx = rawTransactions.find(t => t.id === id);
    if(!tx) return;
    
    appState.editingTxId = id;
    appState.txMode = tx.type;
    updateTxModeUI();
    
    $('tx-date').value = tx.date;
    $('tx-amount').value = tx.amount;
    $('tx-currency').value = tx.currency || 'INR';
    $('tx-category').value = tx.category;
    $('tx-mode').value = tx.mode;
    $('tx-note').value = tx.note;
    $('tx-recurring').checked = !!tx.recurring;
    
    $('form-heading').textContent = "✏️ Editing Entry";
    $('btn-cancel-edit').style.display = 'block';
    
    // Switch to entries tab
    document.querySelector('.nav-tab[data-target="tab-entries"]').click();
    window.scrollTo(0,0);
}

function deleteTx(id) {
    if(!confirm("Delete this transaction?")) return;
    rawTransactions = rawTransactions.filter(t => t.id !== id);
    renderAll();
    pushToCloud({ action: 'delete', id: id });
}

// ==========================================
// GOALS ACTIONS
// ==========================================
let editingGoalId = null;
function saveGoal() {
    const name = $('goal-name').value;
    const target = parseFloat($('goal-target').value);
    if(!name || !target) return alert("Name and Target required");

    const payload = {
        action: editingGoalId ? 'edit_goal' : 'add_goal',
        id: editingGoalId || (Date.now() + "_g"),
        name: name,
        target: target,
        current: editingGoalId ? (goals.find(g => g.id === editingGoalId)?.current || 0) : 0
    };

    if(editingGoalId) {
        const idx = goals.findIndex(g => g.id === editingGoalId);
        if(idx > -1) goals[idx] = payload;
    } else {
        goals.push(payload);
    }

    $('goal-modal').classList.remove('active');
    renderGoals();
    pushToCloud(payload);
}

function editGoal(id) {
    const g = goals.find(x => x.id === id);
    if(!g) return;
    editingGoalId = id;
    $('goal-name').value = g.name;
    $('goal-target').value = g.target;
    $('goal-modal').classList.add('active');
}

function deleteGoal(id) {
    if(!confirm("Delete this goal?")) return;
    goals = goals.filter(g => g.id !== id);
    renderGoals();
    pushToCloud({ action: 'delete_goal', id: id });
}

function contributeGoal(id, name) {
    const amt = prompt(`Enter amount to contribute to ${name} (₹):`);
    if(!amt || isNaN(amt) || amt <= 0) return;
    
    const val = parseFloat(amt);
    
    // 1. Update Goal
    const gIdx = goals.findIndex(x => x.id === id);
    if(gIdx > -1) {
        goals[gIdx].current += val;
        pushToCloud({ action: 'contribute_goal', id: goals[gIdx].id, name: goals[gIdx].name, target: goals[gIdx].target, current: goals[gIdx].current });
    }
    
    // 2. Add Expense Transaction
    const txPayload = {
        action: 'add',
        id: Date.now() + "_c",
        date: dateToISO(new Date()),
        type: 'expense',
        category: '✨ Misc',
        mode: '📱 UPI / Bank',
        note: `Goal Contribution: ${name}`,
        amount: val,
        currency: 'INR',
        recurring: false
    };
    rawTransactions.push(txPayload);
    pushToCloud(txPayload);
    renderAll();
}

// ==========================================
// EVENT LISTENERS & UI HELPERS
// ==========================================
function initListeners() {
    // Tabs
    document.querySelectorAll('.nav-tab').forEach(t => {
        t.addEventListener('click', () => {
            document.querySelectorAll('.nav-tab').forEach(x => x.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));
            t.classList.add('active');
            $(t.dataset.target).classList.add('active');
        });
    });

    // Period Nav
    document.querySelectorAll('.period-toggle').forEach(t => {
        t.addEventListener('click', () => {
            document.querySelectorAll('.period-toggle').forEach(x => x.classList.remove('active'));
            t.classList.add('active');
            appState.periodType = t.dataset.type;
            updatePeriodLabel();
            renderAll();
        });
    });
    $('period-prev').addEventListener('click', () => shiftPeriod(-1));
    $('period-next').addEventListener('click', () => shiftPeriod(1));

    // Tx Form Mode
    document.querySelectorAll('#input-form-section .toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            appState.txMode = btn.dataset.mode;
            updateTxModeUI();
        });
    });
    
    $('btn-save-tx').addEventListener('click', saveTransaction);
    $('btn-cancel-edit').addEventListener('click', () => {
        appState.editingTxId = null;
        $('form-heading').textContent = "✍️ Log Entry";
        $('btn-cancel-edit').style.display = 'none';
        $('tx-amount').value = ''; $('tx-note').value = '';
    });
    
    $('search-input').addEventListener('input', renderAll);

    // Modals
    $('settings-toggle').addEventListener('click', () => {
        $('set-global-budget').value = userPrefs.globalBudget;
        $('rate-usd').value = userPrefs.exchangeRates.USD;
        $('rate-eur').value = userPrefs.exchangeRates.EUR;
        $('rate-gbp').value = userPrefs.exchangeRates.GBP;
        renderSettingsCats();
        $('settings-modal').classList.add('active');
    });
    $('close-settings').addEventListener('click', () => $('settings-modal').classList.remove('active'));
    $('btn-save-settings').addEventListener('click', () => {
        userPrefs.globalBudget = parseFloat($('set-global-budget').value) || 25000;
        userPrefs.exchangeRates.USD = parseFloat($('rate-usd').value) || 83.5;
        userPrefs.exchangeRates.EUR = parseFloat($('rate-eur').value) || 90.2;
        userPrefs.exchangeRates.GBP = parseFloat($('rate-gbp').value) || 105.1;
        
        // Save micro budgets
        document.querySelectorAll('.mb-input').forEach(inp => {
            const val = parseFloat(inp.value);
            if(val > 0) userPrefs.categoryBudgets[inp.dataset.cat] = val;
            else delete userPrefs.categoryBudgets[inp.dataset.cat];
        });

        savePrefs();
        $('settings-modal').classList.remove('active');
    });

    $('btn-add-cat').addEventListener('click', () => {
        const name = $('new-cat-name').value;
        const type = $('new-cat-type').value;
        if(name) {
            userPrefs.customCategories.push({name, type});
            $('new-cat-name').value = '';
            renderSettingsCats();
            savePrefs();
        }
    });

    $('btn-force-sync').addEventListener('click', fetchFromCloud);

    // Theme
    $('theme-toggle').addEventListener('click', () => {
        userPrefs.theme = userPrefs.theme === 'dark' ? 'light' : 'dark';
        savePrefs();
    });

    // Goals
    $('btn-new-goal').addEventListener('click', () => {
        editingGoalId = null;
        $('goal-name').value = ''; $('goal-target').value = '';
        $('goal-modal').classList.add('active');
    });
    $('close-goal').addEventListener('click', () => $('goal-modal').classList.remove('active'));
    $('btn-save-goal').addEventListener('click', saveGoal);
}

function updateTxModeUI() {
    document.querySelectorAll('#input-form-section .toggle-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`#input-form-section .toggle-btn[data-mode="${appState.txMode}"]`).classList.add('active');
    populateCategoryDropdown();
}

function populateCategoryDropdown() {
    const sel = $('tx-category');
    const cats = getCombinedCategories(appState.txMode);
    sel.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
}

function populateMicroBudgetInputs() {
    const list = $('micro-budget-inputs');
    const cats = getCombinedCategories('expense');
    list.innerHTML = cats.map(c => `
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem;">
            <span>${c}</span>
            <input type="number" class="mb-input" data-cat="${c}" value="${userPrefs.categoryBudgets[c] || ''}" placeholder="Cap" style="width:80px; padding:4px;">
        </div>
    `).join('');
}

function renderSettingsCats() {
    $('custom-cats-list').innerHTML = userPrefs.customCategories.map((c, i) => `
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
            <span>[${c.type}] ${c.name}</span>
            <button onclick="userPrefs.customCategories.splice(${i},1); renderSettingsCats(); savePrefs();" style="color:red; background:none; border:none; cursor:pointer;">✕</button>
        </div>
    `).join('') || "No custom categories added.";
}

function shiftPeriod(dir) {
    const d = new Date(appState.anchorDate);
    if(appState.periodType === 'month') {
        d.setMonth(d.getMonth() + dir);
    } else {
        d.setDate(d.getDate() + (dir * 7));
    }
    appState.anchorDate = d;
    updatePeriodLabel();
    renderAll();
}

function updatePeriodLabel() {
    const bounds = getPeriodBounds();
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    if(appState.periodType === 'month') {
        $('period-label').textContent = `${months[bounds.start.getMonth()]} ${bounds.start.getFullYear()}`;
    } else {
        const s = `${bounds.start.getDate()} ${months[bounds.start.getMonth()]}`;
        const e = `${bounds.end.getDate()} ${months[bounds.end.getMonth()]}`;
        $('period-label').textContent = `${s} - ${e}`;
    }
}

init();
