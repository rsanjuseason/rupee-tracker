// ============================================================
// RUPEE TRACKER PRO — FULL MODULAR ENGINE
// ============================================================

const CLOUD_URL = "https://script.google.com/macros/s/AKfycbzhp6FcY8xcxuaMw2aQG3TLhAFbn9FfT2AxrvF3l7I_GO78Sn3RPfpz5UtBvoe1FJWUBA/exec";

// Default categories
const CATS = {
    expense: ['🍔 Food & Dining','🛒 Groceries','🚗 Transport & Fuel','🛍️ Shopping','🏠 Rent & Utilities','🎮 Entertainment','🏥 Medical','🎓 Education','🔄 Subscriptions','✨ Misc'],
    income: ['💰 Salary','💼 Freelance','📈 Investments','🎁 Gifts','🪙 Other'],
    lend: ['🤝 Lent Money','📥 Borrowed Money']
};

// Smart categorization keywords
const SMART_CATS = {
    '🚗 Transport & Fuel': ['uber','ola','cab','taxi','fuel','petrol','diesel','metro','bus','auto','parking','toll','rapido'],
    '🍔 Food & Dining': ['swiggy','zomato','restaurant','cafe','coffee','starbucks','mcd','dominos','pizza','biryani','lunch','dinner','breakfast','chai','tea'],
    '🛒 Groceries': ['bigbasket','blinkit','zepto','grocery','supermarket','vegetables','fruits','milk','dmart'],
    '🛍️ Shopping': ['amazon','flipkart','myntra','ajio','mall','clothes','shoes','electronics'],
    '🏠 Rent & Utilities': ['rent','electricity','wifi','broadband','water','gas','maintenance','society'],
    '🏥 Medical': ['pharmacy','medicine','hospital','doctor','clinic','apollo','1mg','pharmeasy'],
    '🎮 Entertainment': ['netflix','hotstar','spotify','prime','movie','cinema','game','pvr','inox'],
    '🎓 Education': ['udemy','coursera','book','course','tuition','school','college','exam'],
    '🔄 Subscriptions': ['subscription','premium','plan','membership','renewal']
};

let raw = [];       // All transactions from cloud
let filtered = [];  // Current period
let goals = [];

let st = { periodType:'month', anchor:new Date(), mode:'expense', editId:null };

let prefs = {
    theme:'light', budget:25000, threshold:80,
    email: '', emailEnabled: false,
    customCats:[], catBudgets:{},
    rates:{ USD:83.5, EUR:90.2, GBP:105.1 }
};

const $=id=>document.getElementById(id);
const esc=s=>{const d=document.createElement('div');d.textContent=s||'';return d.innerHTML};

// ============================================================
// INIT
// ============================================================
function init(){
    loadPrefs(); applyTheme(); listen();
    $('tx-date').value=dISO(new Date());
    updatePeriodLabel(); popCats(); popMB();
    if(CLOUD_URL!=="YOUR_GOOGLE_SCRIPT_WEB_APP_URL"&&CLOUD_URL!=="CLOUD_URL") pull();
}

// ============================================================
// PREFS
// ============================================================
function loadPrefs(){try{const s=localStorage.getItem('rp3');if(s)prefs={...prefs,...JSON.parse(s)};}catch(e){}}
function savePrefs(){localStorage.setItem('rp3',JSON.stringify(prefs));applyTheme();popCats();popMB();renderAll();}
function applyTheme(){
    const d=prefs.theme==='dark';
    d?document.body.setAttribute('data-theme','dark'):document.body.removeAttribute('data-theme');
    const b=$('theme-toggle');if(b)b.textContent=d?'☀️':'🌙';
}

// ============================================================
// CLOUD
// ============================================================
async function pull(){
    const b=$('btn-save');b.textContent='☁️ Pulling...';b.disabled=true;
    try{const r=await fetch(CLOUD_URL);const j=await r.json();
        if(j.status==='success'){raw=j.data.transactions||[];goals=j.data.goals||[];autoLogRecurring();renderAll();}
    }catch(e){console.error(e);}
    b.textContent='Log & Sync ☁️';b.disabled=false;
}
async function push(p){
    if(CLOUD_URL==="YOUR_GOOGLE_SCRIPT_WEB_APP_URL"||CLOUD_URL==="CLOUD_URL")return;
    try{await fetch(CLOUD_URL,{method:'POST',body:JSON.stringify(p)});}catch(e){console.error(e);}
}

// ============================================================
// UTILS
// ============================================================
function allCats(t){let c=[...(CATS[t]||[])];prefs.customCats.filter(x=>x.type===t).forEach(x=>c.push(x.name));return c;}
function toINR(tx){const a=parseFloat(tx.amount)||0;const c=tx.currency||'INR';return c==='INR'?a:a*(prefs.rates[c]||1);}
function dISO(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function isoD(s){if(!s)return new Date();const p=s.split('-');return new Date(p[0],p[1]-1,p[2]);}
function fINR(n){return '₹'+Math.round(Math.abs(n)).toLocaleString('en-IN');}
function fDate(s){if(!s)return'';const p=s.split('-');return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:s;}

function txSign(tx){
    if(tx.type==='expense')return -1;
    if(tx.type==='income')return 1;
    const c=(tx.category||'').toLowerCase();
    return c.includes('lent')?-1:c.includes('borrow')?1:-1;
}
function txColor(tx){
    const s=txSign(tx);
    if(tx.type==='lend')return s<0?'cb':'cd2';
    return s<0?'cr':'cg';
}

/** Smart auto-categorize based on note text */
function smartCat(note){
    if(!note)return null;
    const lower=note.toLowerCase();
    for(const[cat,keywords]of Object.entries(SMART_CATS)){
        if(keywords.some(kw=>lower.includes(kw)))return cat;
    }
    return null;
}

// ============================================================
// PERIOD
// ============================================================
function getBounds(){
    const d=new Date(st.anchor);
    if(st.periodType==='year') return {s:new Date(d.getFullYear(),0,1),e:new Date(d.getFullYear(),11,31)};
    if(st.periodType==='month') return {s:new Date(d.getFullYear(),d.getMonth(),1),e:new Date(d.getFullYear(),d.getMonth()+1,0)};
    const day=d.getDay()||7;const s=new Date(d);s.setDate(d.getDate()-day+1);const e=new Date(s);e.setDate(s.getDate()+6);return{s,e};
}
function filter(){
    const b=getBounds();const ss=dISO(b.s);const se=dISO(b.e);
    filtered=raw.filter(t=>t.date>=ss&&t.date<=se);
    const q=($('search')?.value||'').toLowerCase();
    if(q)filtered=filtered.filter(t=>(t.note||'').toLowerCase().includes(q)||(t.category||'').toLowerCase().includes(q)||(t.person||'').toLowerCase().includes(q)||String(t.amount).includes(q));
    filtered.sort((a,b)=>b.date.localeCompare(a.date));
}
function shift(d){const x=new Date(st.anchor);if(st.periodType==='year')x.setFullYear(x.getFullYear()+d);else if(st.periodType==='month')x.setMonth(x.getMonth()+d);else x.setDate(x.getDate()+(d*7));st.anchor=x;updatePeriodLabel();renderAll();}
function updatePeriodLabel(){
    const b=getBounds();const M=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    if(st.periodType==='year') $('p-label').textContent=b.s.getFullYear();
    else $('p-label').textContent=st.periodType==='month'?`${M[b.s.getMonth()]} ${b.s.getFullYear()}`:`${b.s.getDate()} ${M[b.s.getMonth()]} – ${b.e.getDate()} ${M[b.e.getMonth()]}`;
}

// ============================================================
// RENDER ALL
// ============================================================
function renderAll(){filter();renderDash();renderEntries();renderDebts();renderSubs();renderGoals();checkBudgetAlerts();}

function getNextDate(dateStr, freq){
    const d=isoD(dateStr);
    if(freq==='daily') d.setDate(d.getDate()+1);
    else if(freq==='weekly') d.setDate(d.getDate()+7);
    else if(freq==='yearly') d.setFullYear(d.getFullYear()+1);
    else d.setMonth(d.getMonth()+1); // default monthly
    return d;
}

function autoLogRecurring(){
    const recs=raw.filter(t=>t.recurring);
    let subs={};
    // Find latest entry for each recurring series
    recs.forEach(tx=>{const k=tx.category+'|'+(tx.note||'')+'|'+tx.amount;if(!subs[k]||subs[k].date<tx.date)subs[k]=tx;});
    
    let addedAny=false;
    const todayStr=dISO(new Date());

    Object.values(subs).forEach(latestTx=>{
        let nextD=getNextDate(latestTx.date, latestTx.frequency);
        let nextStr=dISO(nextD);
        let currentTx = latestTx;

        while(nextStr <= todayStr){
            // Auto-generate missing entry
            const newTx={...currentTx};
            newTx.id=Date.now()+'_'+Math.random().toString(36).substr(2,5);
            newTx.date=nextStr;
            raw.push(newTx);
            push(newTx); // Send to cloud
            addedAny=true;
            
            currentTx = newTx;
            nextD=getNextDate(currentTx.date, currentTx.frequency);
            nextStr=dISO(nextD);
        }
    });

    if(addedAny) {
        // re-sort raw just in case
        raw.sort((a,b)=>b.date.localeCompare(a.date));
    }
}

// ============================================================
// MODULE 1: DASHBOARD
// ============================================================
function renderDash(){
    let spend=0,income=0,catT={};
    filtered.forEach(tx=>{const inr=toINR(tx);const s=txSign(tx);if(s<0){spend+=inr;if(tx.type==='expense')catT[tx.category]=(catT[tx.category]||0)+inr;}else income+=inr;});

    $('s-spend').textContent=fINR(spend);
    $('s-income').textContent=fINR(income);
    const net=income-spend;
    $('s-net').textContent=(net>=0?'+':'-')+fINR(Math.abs(net));
    $('s-net').className='sv '+(net>=0?'cg':'cr');
    $('s-total').textContent=raw.length;

    // Net Worth (all-time)
    let allInc=0,allExp=0;
    raw.forEach(tx=>{const inr=toINR(tx);txSign(tx)<0?allExp+=inr:allInc+=inr;});
    const nw=allInc-allExp;
    $('s-nw').textContent=(nw>=0?'+':'-')+fINR(Math.abs(nw));
    $('s-nw').className='sv '+(nw>=0?'cg':'cr');

    // Active debts
    const debts=calcDebts();
    let totalDebt=0;
    Object.values(debts).forEach(d=>{totalDebt+=Math.abs(d.net);});
    $('s-debt').textContent=fINR(totalDebt);

    // Daily Chart
    renderDailyChart();

    // Month comparison
    renderComparison(spend);

    // Budget
    const cap=getScaledBudget(prefs.budget||25000)||1;const pct=Math.min(100,(spend/cap)*100);
    $('b-spent').textContent=fINR(spend);$('b-cap').textContent=fINR(cap).replace('₹','');
    $('b-pct').textContent=Math.round(pct)+'% used';
    const bar=$('b-bar');bar.style.width=pct+'%';
    bar.style.background=pct>90?'var(--red)':(pct>75?'var(--orange)':'var(--green)');

    // Micro budgets
    let mbH='';
    for(const[cat,bc]of Object.entries(prefs.catBudgets)){
        if(!bc||bc<=0)continue;
        const scaledBc = getScaledBudget(bc);
        const cs=catT[cat]||0;const cp=Math.min(100,(cs/scaledBc)*100);
        const cc=cp>90?'var(--red)':(cp>60?'var(--orange)':'var(--purple)');
        mbH+=`<div class="mbi"><div class="mbl"><span>${esc(cat)}</span><span>${fINR(cs)} / ${fINR(scaledBc)}</span></div><div class="mbb"><div class="bf" style="width:${cp}%;background:${cc}"></div></div></div>`;
    }
    $('micro-b').innerHTML=mbH||'<div class="es">No category budgets. Set in ⚙️ Settings.</div>';

    // Category bars
    let ca=Object.entries(catT).sort((a,b)=>b[1]-a[1]).slice(0,6);let mx=ca.length?ca[0][1]:1;
    $('cat-bars').innerHTML=ca.map(c=>`<div class="cr2"><div class="ci"><span>${esc(c[0])}</span><span>${fINR(c[1])}</span></div><div class="mbb"><div class="bf" style="width:${(c[1]/mx)*100}%;background:linear-gradient(90deg,var(--purple),var(--red))"></div></div></div>`).join('')||'<div class="es">No expenses this period.</div>';

    // Donut
    if(spend===0&&income===0){$('donut').innerHTML='<div class="es"><div class="es-i">📊</div>Log entries to see ratio.</div>';}
    else{const tot=spend+income;const ed=(spend/tot)*360;
        $('donut').innerHTML=`<div class="dc"><div style="width:130px;height:130px;border-radius:50%;background:conic-gradient(var(--red) 0deg ${ed}deg,var(--green) ${ed}deg 360deg)"></div><div class="dh"><span>Net</span><strong>${(net>=0?'+':'-')}${fINR(Math.abs(net))}</strong></div></div><div class="dl"><span style="color:var(--red)">■ Spent ${Math.round((spend/tot)*100)}%</span><span style="color:var(--green)">■ Earned ${Math.round((income/tot)*100)}%</span></div>`;
    }
}

function renderDailyChart(){
    const el=$('daily-chart');
    if(!el) return;
    const days={};
    const b=getBounds();
    // Pre-fill days
    for(let d=new Date(b.s);d<=b.e;d.setDate(d.getDate()+1)){
        days[dISO(d)]=0;
    }
    filtered.forEach(tx=>{
        if(txSign(tx)<0) {
            if(days[tx.date]!==undefined) days[tx.date]+=toINR(tx);
        }
    });
    const arr=Object.entries(days).sort((a,b)=>a[0].localeCompare(b[0]));
    if(!arr.length||Math.max(...arr.map(x=>x[1]))===0){
        el.innerHTML='<div class="es">No spending data to chart.</div>';return;
    }
    let maxV=Math.max(...arr.map(x=>x[1]))||1;
    el.innerHTML=`<div style="display:flex;align-items:flex-end;gap:2px;height:120px;margin-top:10px;padding-bottom:20px;border-bottom:1px solid var(--border);position:relative">
        ${arr.map(x=>{
            const h=(x[1]/maxV)*100;
            const p=x[0].split('-');const ds=parseInt(p[2]);
            const lbl=(st.periodType==='month'&&ds%5!==1&&ds!==b.e.getDate())?'':`<span style="position:absolute;bottom:-20px;font-size:0.6rem;color:var(--muted);left:50%;transform:translateX(-50%)">${ds}</span>`;
            return `<div style="flex:1;background:var(--purple);border-radius:2px 2px 0 0;height:${Math.max(1,h)}%;position:relative;opacity:${h===0?0.1:1}" title="${x[0]}: ${fINR(x[1])}">${lbl}</div>`;
        }).join('')}
    </div>`;
}

function getScaledBudget(base) {
    if (!base) return 0;
    if (st.periodType === 'week') return base / 4.333;
    if (st.periodType === 'year') return base * 12;
    return base;
}

function renderComparison(currentSpend){
    // Get last period's data
    const d=new Date(st.anchor);
    let ls, le, label = '';
    
    if (st.periodType === 'month') {
        const lastStart = new Date(d.getFullYear(), d.getMonth()-1, 1);
        const lastEnd = new Date(d.getFullYear(), d.getMonth(), 0);
        ls = dISO(lastStart); le = dISO(lastEnd);
        label = 'Month';
    } else if (st.periodType === 'week') {
        const day = d.getDay()||7;
        const curStart = new Date(d); curStart.setDate(d.getDate() - day + 1);
        const lastStart = new Date(curStart); lastStart.setDate(curStart.getDate() - 7);
        const lastEnd = new Date(lastStart); lastEnd.setDate(lastStart.getDate() + 6);
        ls = dISO(lastStart); le = dISO(lastEnd);
        label = 'Week';
    } else if (st.periodType === 'year') {
        const lastStart = new Date(d.getFullYear() - 1, 0, 1);
        const lastEnd = new Date(d.getFullYear() - 1, 11, 31);
        ls = dISO(lastStart); le = dISO(lastEnd);
        label = 'Year';
    }
    
    let lastSpend=0;
    raw.forEach(tx=>{if(tx.date>=ls&&tx.date<=le&&txSign(tx)<0)lastSpend+=toINR(tx);});
    const diff=currentSpend-lastSpend;const pct=lastSpend>0?Math.round(((diff)/lastSpend)*100):0;
    const arrow=diff>0?'📈':'📉';const badge=diff>0?`<span style="color:var(--red);font-size:.72rem;font-weight:700"> +${Math.abs(pct)}% ${arrow}</span>`:`<span style="color:var(--green);font-size:.72rem;font-weight:700"> ${pct}% ${arrow}</span>`;

    $('cmp-bars').innerHTML=`
        <div class="cmp-bar this"><div class="cmp-label">This ${label}</div><div class="cmp-val cr">${fINR(currentSpend)}</div></div>
        <div class="cmp-bar last"><div class="cmp-label">Last ${label}</div><div class="cmp-val" style="color:var(--text2)">${fINR(lastSpend)}</div></div>
    `;
    const cardTitle = $('card-cmp').querySelector('.ct');
    if (cardTitle) cardTitle.innerHTML=`📅 ${label} Comparison ${badge}`;
}

// ============================================================
// MODULE 4: BUDGET THRESHOLD ALERTS
// ============================================================
function checkBudgetAlerts(){
    const el=$('budget-alerts');
    let alerts=[];
    const thresh=prefs.threshold||80;

    // Global budget
    let spend=0;
    filtered.forEach(tx=>{if(txSign(tx)<0)spend+=toINR(tx);});
    const cap=getScaledBudget(prefs.budget||25000);
    const pct=(spend/cap)*100;
    if(pct>=100) alerts.push({type:'danger',msg:`🚨 Budget EXCEEDED! You've spent ${fINR(spend)} of ${fINR(cap)} (${Math.round(pct)}%).`});
    else if(pct>=thresh) alerts.push({type:'warn',msg:`⚠️ You've used ${Math.round(pct)}% of your ${fINR(cap)} budget. ${fINR(cap-spend)} remaining.`});

    // Category budgets
    let catT={};
    filtered.forEach(tx=>{if(tx.type==='expense'){const inr=toINR(tx);catT[tx.category]=(catT[tx.category]||0)+inr;}});
    for(const[cat,bc]of Object.entries(prefs.catBudgets)){
        if(!bc||bc<=0)continue;
        const scaledBc=getScaledBudget(bc);
        const cs=catT[cat]||0;const cp=(cs/scaledBc)*100;
        if(cp>=100) alerts.push({type:'danger',msg:`🚨 ${cat} budget exceeded! ${fINR(cs)} / ${fINR(scaledBc)}`});
        else if(cp>=thresh) alerts.push({type:'warn',msg:`⚠️ ${cat}: ${Math.round(cp)}% used (${fINR(cs)} / ${fINR(scaledBc)})`});
    }

    el.innerHTML=alerts.map(a=>`<div class="alert-banner ${a.type}">${a.msg}</div>`).join('');
}

// ============================================================
// MODULE 1: ENTRIES
// ============================================================
function renderEntries(){
    const list=$('tx-list');
    if(!filtered.length){list.innerHTML='<div class="es"><div class="es-i">📒</div>No records this period.</div>';return;}

    list.innerHTML=filtered.map(tx=>{
        const inr=toINR(tx);const s=txSign(tx);const sc=s<0?'-':'+';const cc=txColor(tx);
        const icon=tx.type==='expense'?'📉':(tx.type==='income'?'💰':(s<0?'🤝':'📥'));
        const cur=(tx.currency&&tx.currency!=='INR')?`<span class="tl-t">${tx.amount} ${tx.currency}</span>`:'';
        const freq=tx.frequency||'monthly';
        const freqCap=freq.charAt(0).toUpperCase()+freq.slice(1);
        const rec=tx.recurring?`<span class="tl-t">🔄 ${esc(freqCap)}</span>`:'';
        const per=tx.person?`<span class="tl-t">👤 ${esc(tx.person)}</span>`:'';
        const acct=tx.account?`<span class="tl-t">${esc(tx.account)}</span>`:'';
        const sid=esc(tx.id);
        return `<div class="ti t-${tx.type}"><div class="tl-l"><div class="tl-c">${icon} ${esc(tx.category)}</div><div class="tl-m">${esc(tx.note||tx.mode||'')} ${per} ${acct} ${rec} ${cur}</div><div class="tl-x"><button class="ab" onclick="editTx('${sid}')" title="Edit">✏️</button><button class="ab del" onclick="delTx('${sid}')" title="Delete">🗑️</button></div></div><div class="tl-r"><div class="tl-a ${cc}">${sc}${fINR(inr)}</div><div class="tl-d">${fDate(tx.date)}</div></div></div>`;
    }).join('');
}

// ============================================================
// MODULE 3: DEBT LEDGER
// ============================================================
function calcDebts(){
    const debts={};// person -> {lent, borrowed, settled, net, lastDate, dueDate}
    raw.filter(t=>t.type==='lend').forEach(tx=>{
        const person=(tx.person||tx.note||'Unknown').trim();
        if(!debts[person]) debts[person]={lent:0,borrowed:0,settled:0,net:0,lastDate:tx.date,dueDate:tx.dueDate||''};
        const inr=toINR(tx);
        const cat=(tx.category||'').toLowerCase();
        if(cat.includes('lent')){
            debts[person].lent+=inr;
            debts[person].net+=inr; // they owe you
        } else if(cat.includes('borrow')){
            debts[person].borrowed+=inr;
            debts[person].net-=inr; // you owe them
        } else if(cat.includes('settle')||cat.includes('return')){
            debts[person].settled+=inr;
        }
        if(tx.date>debts[person].lastDate) debts[person].lastDate=tx.date;
        if(tx.dueDate) debts[person].dueDate=tx.dueDate;
    });
    return debts;
}

function renderDebts(){
    const debts=calcDebts();
    const list=$('debt-list');
    const entries=Object.entries(debts);

    let theyOwe=0,youOwe=0;
    entries.forEach(([_,d])=>{if(d.net>0)theyOwe+=d.net;else youOwe+=Math.abs(d.net);});
    $('d-owed').textContent=fINR(theyOwe);
    $('d-owes').textContent=fINR(youOwe);

    if(!entries.length){list.innerHTML='<div class="es"><div class="es-i">🤝</div>No lending/borrowing records. Use Lend/Borrow mode when logging.</div>';return;}

    list.innerHTML=entries.sort((a,b)=>Math.abs(b[1].net)-Math.abs(a[1].net)).map(([person,d])=>{
        const isSettled=Math.abs(d.net)<1;
        const statusClass=isSettled?'settled':(d.net>0?'owed':'owes');
        const statusText=isSettled?'✅ Settled':(d.net>0?`They owe you`:`You owe them`);
        const dueStr=d.dueDate?`<div class="debt-detail">Due: ${fDate(d.dueDate)} ${isoD(d.dueDate)<new Date()?'⚠️ Overdue':''}</div>`:'';
        const settleBtn=!isSettled?`<button class="settle-btn" onclick="openSettle('${esc(person)}',${d.net})">💰 Settle</button>`:'';
        return `<div class="debt-card"><div class="debt-left"><div class="debt-name">👤 ${esc(person)}</div><div class="debt-detail">Lent: ${fINR(d.lent)} · Borrowed: ${fINR(d.borrowed)}</div>${dueStr}<div class="debt-status ${statusClass}">${statusText}</div>${settleBtn}</div><div class="debt-right"><div class="debt-amt ${d.net>0?'cg':'cr'}">${d.net>0?'+':'-'}${fINR(Math.abs(d.net))}</div></div></div>`;
    }).join('');
}

let settlingPerson='';let settlingNet=0;
function openSettle(person,net){
    settlingPerson=person;settlingNet=net;
    $('settle-info').textContent=net>0?`${person} owes you ${fINR(Math.abs(net))}. How much are they returning?`:`You owe ${person} ${fINR(Math.abs(net))}. How much are you returning?`;
    $('settle-amt').value='';
    $('m-settle').classList.add('on');
}

function doSettle(){
    const amt=parseFloat($('settle-amt').value);
    if(!amt||amt<=0)return alert('Enter a valid amount');

    // Create a settlement transaction
    const isTheyOwe=settlingNet>0;
    const payload={
        action:'add', id:Date.now()+'_s', date:dISO(new Date()), type:'lend',
        category: isTheyOwe ? '📥 Borrowed Money' : '🤝 Lent Money', // reverse to cancel out
        mode:'📱 UPI / Bank', person:settlingPerson,
        note:`Settlement: ${isTheyOwe?'Received from':'Paid to'} ${settlingPerson}`,
        amount:amt, currency:'INR', recurring:false, account:'🏦 Bank Account'
    };

    // Wait — for a settlement, if they owe me and they're paying back, that's income for me
    // If I owe them and I'm paying back, that's expense for me
    // But we need to track it in the debt ledger, so let's use the reverse lend category
    // If they owe me (net>0) and they return money → log as "Borrowed Money" (incoming = +) to reduce their debt
    // If I owe them (net<0) and I pay them → log as "Lent Money" (outgoing = -) to reduce my debt

    raw.push(payload);
    push(payload);
    $('m-settle').classList.remove('on');
    renderAll();
}

// ============================================================
// MODULE 2: SUBSCRIPTIONS / STANDING ORDERS
// ============================================================
function renderSubs(){
    const recs=raw.filter(t=>t.recurring);
    let subs={};
    recs.forEach(tx=>{const k=tx.category+'|'+(tx.note||'')+'|'+tx.amount;if(!subs[k]||subs[k].date<tx.date)subs[k]=tx;});
    const arr=Object.values(subs);
    const list=$('sub-list');const totEl=$('sub-tot');const fcEl=$('forecast-box');

    if(!arr.length){totEl.innerHTML='';fcEl.innerHTML='';list.innerHTML='<div class="es"><div class="es-i">🔄</div>No recurring entries. Check "Recurring" when logging bills.</div>';return;}

    let totalM=0;
    const now=new Date();
    const daysLeft=new Date(now.getFullYear(),now.getMonth()+1,0).getDate()-now.getDate();
    let upcoming=0;

    const html=arr.map(tx=>{
        const inr=toINR(tx);
        const freq=tx.frequency||'monthly';
        if(freq==='daily') totalM+=inr*30;
        else if(freq==='weekly') totalM+=inr*4.33;
        else if(freq==='yearly') totalM+=inr/12;
        else totalM+=inr; // monthly

        const nextD=getNextDate(tx.date, freq);
        const isOD=nextD<now;
        
        // Very basic forecasting for the rest of THIS month
        if(!isOD && nextD.getMonth()===now.getMonth() && nextD.getFullYear()===now.getFullYear()) {
            upcoming+=inr;
        }

        const fMap={daily:'day',weekly:'week',monthly:'month',yearly:'year'};
        const displayFreq=fMap[freq]||'month';

        return `<div class="sub-i"><div class="sub-l"><div class="sub-t">${esc(tx.category)}</div><div class="sub-n">${esc(tx.note||'')}</div><div class="sub-d ${isOD?'od':''}">Next: ~${fDate(dISO(nextD))} ${isOD?'⚠️ Overdue':''}</div></div><div class="sub-r"><div class="sub-a">${fINR(inr)}</div><div class="sub-f">/ ${displayFreq}</div></div></div>`;
    }).join('');

    totEl.innerHTML=`<div class="sub-tot">Est. Monthly Fixed: ${fINR(totalM)}</div>`;
    fcEl.innerHTML=upcoming>0?`<div class="forecast-box">📋 Upcoming Bills (rest of month): ~${fINR(upcoming)} committed</div>`:'';
    list.innerHTML=html;
}

// ============================================================
// GOALS
// ============================================================
function renderGoals(){
    const list=$('goal-list');
    if(!goals.length){list.innerHTML='<div class="es"><div class="es-i">🎯</div>No goals yet. Create one!</div>';return;}
    list.innerHTML=goals.map(g=>{
        const pct=Math.min(100,(g.current/(g.target||1))*100);const sid=esc(g.id);const sn=esc(g.name);
        return `<div class="gc"><div class="gh"><div class="gt2">${sn}</div><button class="gbtn" onclick="contribute('${sid}','${sn}')">+ Contribute</button></div><div class="bb"><div class="bf" style="width:${pct}%;background:linear-gradient(90deg,var(--purple),#9f7aea)"></div></div><div class="gs">${fINR(g.current)} / ${fINR(g.target)} — ${Math.round(pct)}%</div><div class="ga"><button class="ab" onclick="editGoal('${sid}')" title="Edit">✏️</button><button class="ab del" onclick="delGoal('${sid}')" title="Delete">🗑️</button></div></div>`;
    }).join('');
}

// ============================================================
// TX ACTIONS
// ============================================================
function saveTx(){
    const amt=parseFloat($('tx-amt').value);const date=$('tx-date').value;
    if(!amt||!date)return alert('Amount and Date required.');

    const note=$('tx-note').value;

    // Smart categorization: auto-select category if note matches
    let category=$('tx-cat').value;
    if(st.mode==='expense'&&note&&!st.editId){
        const smart=smartCat(note);
        if(smart){
            const sel=$('tx-cat');
            const opts=[...sel.options].map(o=>o.value);
            if(opts.includes(smart)){sel.value=smart;category=smart;}
        }
    }

    const p={
        action:st.editId?'edit':'add',
        id:st.editId||(Date.now()+'_'+Math.random().toString(36).substr(2,5)),
        date, type:st.mode, category, mode:$('tx-mode').value,
        account:$('tx-acct').value,
        person:$('tx-person')?.value||'', dueDate:$('tx-due')?.value||'',
        note, amount:amt, currency:$('tx-cur').value,
        recurring:$('tx-rec').checked,
        frequency:$('tx-rec').checked?$('tx-freq').value:''
    };

    if(p.action==='edit'){const i=raw.findIndex(t=>t.id===p.id);if(i>-1)raw[i]=p;}
    else raw.push(p);

    cancelEdit();
    renderAll();
    push(p);
}

function cancelEdit() {
    st.editId=null;
    $('form-h').textContent='✍️ Log Entry';
    $('btn-cancel').style.display='none';
    $('tx-amt').value='';
    $('tx-note').value='';
    if($('tx-person'))$('tx-person').value='';
    if($('tx-due'))$('tx-due').value='';
    $('tx-rec').checked=false;
    if($('tx-freq'))$('tx-freq').style.display='none';
}

function editTx(id){
    const tx=raw.find(t=>t.id===id);if(!tx)return;
    st.editId=id;st.mode=tx.type;updateModeUI();
    $('tx-date').value=tx.date;$('tx-amt').value=tx.amount;$('tx-cur').value=tx.currency||'INR';
    $('tx-cat').value=tx.category;$('tx-mode').value=tx.mode||'';
    $('tx-acct').value=tx.account||'🏦 Bank Account';
    $('tx-note').value=tx.note||'';
    if($('tx-person'))$('tx-person').value=tx.person||'';
    if($('tx-due'))$('tx-due').value=tx.dueDate||'';
    $('tx-rec').checked=!!tx.recurring;
    if(tx.recurring){$('tx-freq').value=tx.frequency||'monthly';$('tx-freq').style.display='inline-block';}
    else {$('tx-freq').style.display='none';}
    $('form-h').textContent='✏️ Editing Entry';$('btn-cancel').style.display='block';
    document.querySelector('.tab[data-t="t-entry"]').click();
    window.scrollTo({top:0,behavior:'smooth'});
}

function delTx(id){
    if(!confirm('Delete this entry?'))return;
    raw=raw.filter(t=>t.id!==id);renderAll();push({action:'delete',id});
}

// ============================================================
// GOAL ACTIONS
// ============================================================
let gEditId=null;
function saveGoal(){
    const name=$('g-name').value;const target=parseFloat($('g-target').value);
    if(!name||!target)return alert('Name and Target required.');
    const p={action:gEditId?'edit_goal':'add_goal',id:gEditId||(Date.now()+'_g'),name,target,current:gEditId?(goals.find(g=>g.id===gEditId)?.current||0):0};
    if(gEditId){const i=goals.findIndex(g=>g.id===gEditId);if(i>-1)goals[i]=p;}else goals.push(p);
    gEditId=null;$('m-goal').classList.remove('on');renderGoals();push(p);
}
function editGoal(id){const g=goals.find(x=>x.id===id);if(!g)return;gEditId=id;$('g-name').value=g.name;$('g-target').value=g.target;$('btn-save-g').textContent='Update Goal ☁️';$('m-goal').classList.add('on');}
function delGoal(id){if(!confirm('Delete goal?'))return;goals=goals.filter(g=>g.id!==id);renderGoals();push({action:'delete_goal',id});}
function contribute(id,name){
    const amt=prompt(`Contribute to "${name}" — amount (₹):`);
    if(!amt||isNaN(amt)||parseFloat(amt)<=0)return;const val=parseFloat(amt);
    const gi=goals.findIndex(x=>x.id===id);
    if(gi>-1){goals[gi].current+=val;push({action:'contribute_goal',id:goals[gi].id,name:goals[gi].name,target:goals[gi].target,current:goals[gi].current});}
    const tp={action:'add',id:Date.now()+'_c',date:dISO(new Date()),type:'expense',category:'✨ Misc',mode:'📱 UPI / Bank',note:`🎯 Goal: ${name}`,amount:val,currency:'INR',recurring:false,account:'🏦 Bank Account'};
    raw.push(tp);push(tp);renderAll();
}

// ============================================================
// CSV EXPORT
// ============================================================
function exportCSV(){
    if(!filtered.length)return alert('No data to export.');
    const BOM='\uFEFF';const h='Date,Type,Category,Amount,Currency,INR,Mode,Account,Person,Note,Recurring,Frequency\n';
    const rows=filtered.map(tx=>{const s=txSign(tx);const inr=toINR(tx)*s;return[tx.date,tx.type,`"${tx.category}"`,tx.amount*s,tx.currency||'INR',Math.round(inr),`"${tx.mode||''}"`,`"${tx.account||''}"`,`"${tx.person||''}"`,`"${(tx.note||'').replace(/"/g,'""')}"`,tx.recurring?'Yes':'No',tx.frequency||''].join(',');}).join('\n');
    const blob=new Blob([BOM+h+rows],{type:'text/csv;charset=utf-8;'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`rupee-tracker-${dISO(new Date())}.csv`;a.click();
}

// ============================================================
// LISTENERS
// ============================================================
function listen(){
    // Tabs
    document.querySelectorAll('.tab').forEach(t=>{t.addEventListener('click',(e)=>{
        document.querySelectorAll('.tab').forEach(x=>x.classList.remove('on'));document.querySelectorAll('.tc').forEach(x=>x.classList.remove('on'));
        t.classList.add('on');$(t.dataset.t).classList.add('on');
        
        // Clear edit state if manually navigating away from entries tab
        if(e.isTrusted && t.dataset.t !== 't-entry' && st.editId) {
            cancelEdit();
        }
        
        // Force re-render of active tab to ensure fresh state
        renderAll();
    });});

    // Period
    document.querySelectorAll('.ptb').forEach(t=>{t.addEventListener('click',()=>{document.querySelectorAll('.ptb').forEach(x=>x.classList.remove('on'));t.classList.add('on');st.periodType=t.dataset.type;updatePeriodLabel();renderAll();});});
    $('p-prev').addEventListener('click',()=>shift(-1));$('p-next').addEventListener('click',()=>shift(1));

    // Form mode
    document.querySelectorAll('#form-sec .tb').forEach(b=>{b.addEventListener('click',()=>{st.mode=b.dataset.mode;updateModeUI();});});

    // Smart categorization on note blur
    $('tx-note').addEventListener('blur',()=>{
        if(st.mode!=='expense'||st.editId)return;
        const note=$('tx-note').value;const smart=smartCat(note);
        if(smart){const sel=$('tx-cat');const opts=[...sel.options].map(o=>o.value);if(opts.includes(smart))sel.value=smart;}
    });

    $('tx-rec').addEventListener('change',(e)=>{$('tx-freq').style.display=e.target.checked?'inline-block':'none';});

    $('btn-save').addEventListener('click',saveTx);
    $('btn-cancel').addEventListener('click', cancelEdit);
    $('search').addEventListener('input',renderAll);
    $('btn-csv').addEventListener('click',exportCSV);

    // Settings
    $('settings-toggle').addEventListener('click',openSettings);
    $('x-settings').addEventListener('click',()=>$('m-settings').classList.remove('on'));
    $('btn-save-s').addEventListener('click',saveSettings);
    $('btn-cat').addEventListener('click',addCat);
    $('btn-sync').addEventListener('click',pull);

    // Theme
    $('theme-toggle').addEventListener('click',()=>{prefs.theme=prefs.theme==='dark'?'light':'dark';savePrefs();});

    // Goals
    $('btn-new-goal').addEventListener('click',()=>{gEditId=null;$('g-name').value='';$('g-target').value='';$('btn-save-g').textContent='Create Goal ☁️';$('m-goal').classList.add('on');});
    $('x-goal').addEventListener('click',()=>$('m-goal').classList.remove('on'));
    $('btn-save-g').addEventListener('click',saveGoal);

    // Settle
    $('x-settle').addEventListener('click',()=>$('m-settle').classList.remove('on'));
    $('btn-settle').addEventListener('click',doSettle);

    // Close modals on overlay
    document.querySelectorAll('.mo').forEach(m=>{m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('on');});});
}

function updateModeUI(){
    document.querySelectorAll('#form-sec .tb').forEach(b=>b.classList.remove('on'));
    const ab=document.querySelector(`#form-sec .tb[data-mode="${st.mode}"]`);if(ab)ab.classList.add('on');
    popCats();
    const lf=$('lend-fields');if(lf)lf.style.display=st.mode==='lend'?'block':'none';
}

function popCats(){const s=$('tx-cat');const c=allCats(st.mode);s.innerHTML=c.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');}

// ============================================================
// SETTINGS
// ============================================================
function openSettings(){
    $('s-budget').value=prefs.budget;$('s-threshold').value=prefs.threshold||80;
    $('r-usd').value=prefs.rates.USD;$('r-eur').value=prefs.rates.EUR;$('r-gbp').value=prefs.rates.GBP;
    if($('s-email'))$('s-email').value=prefs.email||'';
    if($('s-email-on'))$('s-email-on').checked=prefs.emailEnabled||false;
    renderCatChips();popMB();$('m-settings').classList.add('on');
}
function saveSettings(){
    prefs.budget=parseFloat($('s-budget').value)||25000;
    prefs.threshold=parseInt($('s-threshold').value)||80;
    prefs.rates.USD=parseFloat($('r-usd').value)||83.5;
    prefs.rates.EUR=parseFloat($('r-eur').value)||90.2;
    prefs.rates.GBP=parseFloat($('r-gbp').value)||105.1;
    if($('s-email'))prefs.email=$('s-email').value;
    if($('s-email-on'))prefs.emailEnabled=$('s-email-on').checked;
    document.querySelectorAll('.mb-input').forEach(i=>{const v=parseFloat(i.value);if(v>0)prefs.catBudgets[i.dataset.cat]=v;else delete prefs.catBudgets[i.dataset.cat];});
    savePrefs();
    
    // Sync email config to backend
    push({ action: 'save_prefs', email: prefs.email, emailEnabled: prefs.emailEnabled });
    
    $('m-settings').classList.remove('on');
}
function addCat(){
    const emoji=$('new-cat-emoji').value;
    const n=$('new-cat').value.trim();
    const t=$('new-cat-t').value;
    if(!n)return;
    const fullName = `${emoji} ${n}`;
    prefs.customCats.push({name:fullName,type:t});
    $('new-cat').value='';renderCatChips();savePrefs();
}
function removeCat(i){prefs.customCats.splice(i,1);renderCatChips();savePrefs();}
function renderCatChips(){
    const el=$('cat-chips');
    if(!prefs.customCats.length){el.innerHTML='<div style="font-size:.76rem;color:var(--muted);padding:4px">No custom categories.</div>';return;}
    el.innerHTML=prefs.customCats.map((c,i)=>`<span class="cc-chip">${esc(c.name)} <span style="color:var(--muted);font-size:.68rem">(${c.type})</span> <button onclick="removeCat(${i})">✕</button></span>`).join('');
}
function popMB(){
    const el=$('mb-inputs');if(!el)return;const cats=allCats('expense');
    el.innerHTML=cats.map(c=>`<div class="mbr"><span>${esc(c)}</span><input type="number" class="mb-input" data-cat="${esc(c)}" value="${prefs.catBudgets[c]||''}" placeholder="₹ Cap"></div>`).join('');
}

// ============================================================
init();
