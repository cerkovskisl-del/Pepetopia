const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const COLS = 16, ROWS = 16;
const TILE_WIDTH = 54, TILE_HEIGHT = 27; 
const ORIGIN_X = canvas.width / 2;
const ORIGIN_Y = 40;

let money = 3000, income = 0, population = 0, taxRate = 7;
let demandR = 80, demandC = 40, demandI = 50;

// 0=Zeme, 1=Ceļš, 2=Dzīvojamā, 3=Komercija, 4=Industriālā, 5=Elektrostacija, 6=Ūdens Sūknis
let world = Array(ROWS).fill().map(() => Array(COLS).fill(0));

// Pazemes inženiertīklu režģi (Lietotājs tos būvē pats!)
let powerWires = Array(ROWS).fill().map(() => Array(COLS).fill(false));
let waterPipes = Array(ROWS).fill().map(() => Array(COLS).fill(false));

// Aprēķinātie tīkli aktīvajai apgādei un piesārņojumam
let hasPowerGrid = Array(ROWS).fill().map(() => Array(COLS).fill(false));
let hasWaterGrid = Array(ROWS).fill().map(() => Array(COLS).fill(false));
let pollutionGrid = Array(ROWS).fill().map(() => Array(COLS).fill(0));

let zoneData = {};
let currentTool = 'road';
let viewLayer = 'surface'; // 'surface' vai 'underground'
let mouseGridX = -1, mouseGridY = -1;

const COSTS = { 'road':10, 'zoneR':50, 'zoneC':60, 'zoneI':40, 'wire':5, 'pipe':5, 'power':500, 'water':300, 'clear':10 };

function setTool(tool) {
    currentTool = tool;
    document.querySelectorAll(".sidebar .tool-btn").forEach(btn => { if(btn.id !== 'view-mode') btn.classList.remove("active"); });
    document.getElementById(`btn-${tool}`).classList.add("active");
}

function toggleViewLayer() {
    viewLayer = (viewLayer === 'surface') ? 'underground' : 'surface';
    document.getElementById("layer-display").innerText = (viewLayer === 'surface') ? 'Virszeme' : 'Pazeme';
    document.getElementById("layer-display").style.color = (viewLayer === 'surface') ? '#2ecc71' : '#8e44ad';
    document.getElementById("view-mode").classList.toggle("active", viewLayer === 'underground');
    document.getElementById("view-mode").innerText = "Skats: " + ((viewLayer === 'surface') ? 'Virszeme' : 'Pazeme');
    drawWorld();
}

function changeTax(amount) {
    taxRate = Math.max(1, Math.min(20, taxRate + amount));
    document.getElementById("tax-display").innerText = taxRate + "%";
}

function isoToActual(r, c) {
    return { x: ORIGIN_X + (c - r) * (TILE_WIDTH / 2), y: ORIGIN_Y + (c + r) * (TILE_HEIGHT / 2) };
}

function actualToIso(mouseX, mouseY) {
    let dx = mouseX - ORIGIN_X, dy = mouseY - ORIGIN_Y;
    return {
        c: Math.floor((dy / (TILE_HEIGHT / 2) + dx / (TILE_WIDTH / 2)) / 2),
        r: Math.floor((dy / (TILE_HEIGHT / 2) - dx / (TILE_WIDTH / 2)) / 2)
    };
}

// SIMULĀCIJAS DZINĒJS: Aprēķina piesārņojumu, elektrību un ūdeni caur lietotāja būvētiem tīkliem
function updateSimulation() {
    hasPowerGrid = Array(ROWS).fill().map(() => Array(COLS).fill(false));
    hasWaterGrid = Array(ROWS).fill().map(() => Array(COLS).fill(false));
    pollutionGrid = Array(ROWS).fill().map(() => Array(COLS).fill(0));

    let powerSources = [], waterSources = [];

    // 1. Identificējam ražotnes un piesārņojuma avotus
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (world[r][c] === 5) { hasPowerGrid[r][c] = true; powerSources.push({r, c}); addPollution(r, c, 6); } // El. Stacija piesārņo rādiusā 6
            if (world[r][c] === 6) { hasWaterGrid[r][c] = true; waterSources.push({r, c}); }
            if (world[r][c] === 4) { addPollution(r, c, 4); } // Rūpnīcas piesārņo rādiusā 4
        }
    }

    // Piesārņojuma izplatīšanas palīgfunkcija
    function addPollution(row, col, radius) {
        for(let r=row-radius; r<=row+radius; r++) {
            for(let c=col-radius; c<=col+radius; c++) {
                if(r>=0 && r<ROWS && c>=0 && c<COLS) {
                    let d = Math.abs(row-r) + Math.abs(col-c);
                    if(d <= radius) pollutionGrid[r][c] += (radius - d) * 12;
                }
            }
        }
    }

    // 2. Elektrības izplatība caur LIETOTĀJA uzbūvētiem vadiem (BFS)
    while(powerSources.length > 0) {
        let curr = powerSources.shift();
        let neighbors = [{r:curr.r-1, c:curr.c}, {r:curr.r+1, c:curr.c}, {r:curr.r, c:curr.c-1}, {r:curr.r, c:curr.c+1}];
        for(let n of neighbors) {
            if(n.r>=0 && n.r<ROWS && n.c>=0 && n.c<COLS) {
                if(!hasPowerGrid[n.r][n.c] && (powerWires[n.r][n.c] || world[n.r][n.c] === 5)) {
                    hasPowerGrid[n.r][n.c] = true;
                    powerSources.push({r:n.r, c:n.c});
                }
            }
        }
    }

    // 3. Ūdens izplatība caur LIETOTĀJA uzbūvētām caurulēm (BFS)
    while(waterSources.length > 0) {
        let curr = waterSources.shift();
        let neighbors = [{r:curr.r-1, c:curr.c}, {r:curr.r+1, c:curr.c}, {r:curr.r, c:curr.c-1}, {r:curr.r, c:curr.c+1}];
        for(let n of neighbors) {
            if(n.r>=0 && n.r<ROWS && n.c>=0 && n.c<COLS) {
                if(!hasWaterGrid[n.r][n.c] && (waterPipes[n.r][n.c] || world[n.r][n.c] === 6)) {
                    hasWaterGrid[n.r][n.c] = true;
                    waterSources.push({r:n.r, c:n.c});
                }
            }
        }
    }

    // 4. Zonu attīstības un pamestības (Abandonment) aprēķini
    let totalR = 0, totalC = 0, totalI = 0;
    let newPop = 0, calculatedIncome = 0;
    let hasSlums = false, hasPollutionComplain = false;

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let type = world[r][c];
            let key = `${r},${c}`;
            
            if (type >= 2 && type <= 4) { // R, C vai I zonas
                if (!zoneData[key]) zoneData[key] = { lvl: 0, progress: 0, abandoned: false };
                let data = zoneData[key];

                // Pārbaudām blakus esošos inženiertīklus (Vadiem/caurulēm jābūt tieši zem vai blakus zonai)
                let cellPowered = hasPowerGrid[r][c] || (r>0 && hasPowerGrid[r-1][c]) || (r<ROWS-1 && hasPowerGrid[r+1][c]) || (c>0 && hasPowerGrid[r][c-1]) || (c<COLS-1 && hasPowerGrid[r][c+1]);
                let cellWatered = hasWaterGrid[r][c] || (r>0 && hasWaterGrid[r-1][c]) || (r<ROWS-1 && hasWaterGrid[r+1][c]) || (c>0 && hasWaterGrid[r][c-1]) || (c<COLS-1 && hasWaterGrid[r][c+1]);
                let pol = pollutionGrid[r][c];

                if(pol > 25 && type === 2) hasPollutionComplain = true;

                // Pamestības nosacījumi: Nav resursu VAI milzīgs piesārņojums dzīvojamā zonā
                if (!cellPowered || !cellWatered || (type === 2 && pol > 40)) {
                    if(data.lvl > 0) {
                        data.abandoned = true;
                        hasSlums = true;
                    }
                } else {
                    data.abandoned = false;
                }

                // Zonu augšana, ja viss ir kārtībā
                if (!data.abandoned) {
                    let demand = (type === 2) ? demandR : (type === 3 ? demandC : demandI);
                    if (data.lvl < 3 && demand > 20 && Math.random() > 0.5) {
                        data.progress += 25;
                        if (data.progress >= 100) { data.lvl++; data.progress = 0; }
                    }
                } else {
                    if(Math.random() > 0.7 && data.lvl > 0) data.lvl--; // pamestas mājas lēni sabrūk
                }

                // Saskaitām rādītājus
                if (data.lvl > 0 && !data.abandoned) {
                    if (type === 2) { totalR += data.lvl; newPop += data.lvl * 35; calculatedIncome += data.lvl * taxRate * 2; }
                    if (type === 3) { totalC += data.lvl; calculatedIncome += data.lvl * taxRate * 4; }
                    if (type === 4) { totalI += data.lvl; calculatedIncome += data.lvl * taxRate * 3; }
                }
            }
        }
    }

    population = newPop;
    income = calculatedIncome - (taxRate * 5); // atskaitām fiksētas uzturēšanas izmaksas
    money += income;

    // RCI pieprasījuma formulas
    let taxPenalty = (8 - taxRate) * 10;
    demandR = Math.max(-50, Math.min(100, 80 - (population * 0.05) + (totalI * 15) + taxPenalty));
    demandC = Math.max(-50, Math.min(100, (population * 0.08) - (totalC * 10) + taxPenalty));
    demandI = Math.max(-50, Math.min(100, 60 + (totalC * 5) - (totalI * 12) + taxPenalty));

    // UI Atjaunināšana
    document.getElementById("money-display").innerText = money;
    document.getElementById("pop-display").innerText = population;
    let incBox = document.getElementById("income-display");
    incBox.innerText = (income >= 0 ? "+" : "") + income;
    incBox.style.color = (income >= 0) ? "#2ecc71" : "#e74c3c";

    document.getElementById("bar-r").style.height = Math.max(0, demandR) + "%";
    document.getElementById("bar-c").style.height = Math.max(0, demandC) + "%";
    document.getElementById("bar-i").style.height = Math.max(0, demandI) + "%";

    // Ziņu Ticker loģika (SimCity News Ticker)
    let ticker = document.getElementById("ticker-text");
    if (hasSlums) ticker.innerText = "⚠️ ZIŅAS: Pilsētā parādās pamesti grausti! Nodrošiniet pazemes ūdensvadu un elektrību!";
    else if (hasPollutionComplain) ticker.innerText = "😷 SŪDZĪBAS: Dzīvojamo rajonu iedzīvotāji smok dūmos! Pārvietojiet rūpnīcas tālāk!";
    else if (taxRate > 12) ticker.innerText = "😡 PROTESTI: Nodokļi ir par augstu! Uzņēmēji draud pamest pilsētu!";
    else if (demandR > 50) ticker.innerText = "📈 BIĻETENS: Pieprasījums pēc mājokļiem sasniedz rekordu. Pilsētai vajag jaunas zaļās zonas.";
    else ticker.innerText = "🌤️ Pepetopia strādā stabili. Pilsētas budžets ir sabalansēts.";

    drawWorld();
}

// GRAPHICS ENGINE: Zīmē virszemes 3D vai pazemes inženiertīklus
function drawWorld() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let type = world[r][c];
            let pos = isoToActual(r, c);
            let cx = pos.x, cy = pos.y + TILE_HEIGHT/2;
            let key = `${r},${c}`;

            // --- 1. SLĀNIS: PAMATA ZEME / ROMBS ---
            if (viewLayer === 'surface') {
                ctx.fillStyle = (r + c) % 2 === 0 ? "#213a16" : "#264219"; // Virszemes zāle
                // Piesārņojuma iekrāsošana virszemē (pārvērš zāli pelēcīgi brūnā)
                if (pollutionGrid[r][c] > 15) ctx.fillStyle = "#3e4238";
            } else {
                ctx.fillStyle = "#1c1c1c"; // Pazemes tumsa
            }

            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y); ctx.lineTo(pos.x + TILE_WIDTH/2, pos.y + TILE_HEIGHT/2);
            ctx.lineTo(pos.x, pos.y + TILE_HEIGHT); ctx.lineTo(pos.x - TILE_WIDTH/2, pos.y + TILE_HEIGHT/2);
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = viewLayer === 'surface' ? "rgba(10,25,10,0.2)" : "#2a2a2a";
            ctx.lineWidth = 1; ctx.stroke();

            // --- 2. SLĀNIS: PAZEMES INŽENIERTĪKLI (Ja ieslēgts Underground skats) ---
            if (viewLayer === 'underground') {
                // Zīmējam ūdensvada caurules
                if (waterPipes[r][c]) {
                    ctx.strokeStyle = hasWaterGrid[r][c] ? "#3498db" : "#1b4f72";
                    ctx.lineWidth = 4; ctx.beginPath();
                    ctx.moveTo(cx - TILE_WIDTH/4, cy); ctx.lineTo(cx + TILE_WIDTH/4, cy); ctx.stroke();
                }
                // Zīmējam elektrotīklu
                if (powerWires[r][c]) {
                    ctx.strokeStyle = hasPowerGrid[r][c] ? "#f1c40f" : "#7d6608";
                    ctx.lineWidth = 2; ctx.beginPath();
                    ctx.moveTo(cx, cy - TILE_HEIGHT/4); ctx.lineTo(cx, cy + TILE_HEIGHT/4); ctx.stroke();
                }
                // Parādām caurspīdīgu virszemes ēku kontūru, lai zinātu, kur būvēt
                if (type !== 0) {
                    ctx.fillStyle = "rgba(255,255,255,0.15)";
                    ctx.font = "9px Arial"; ctx.fillText("🏢", cx-5, cy+3);
                }
                continue; // tālāk virszemes objektus pazemē nezīmēt!
            }

            // --- 3. SLĀNIS: VIRSZEMES STRUKTŪRAS ---
            // Ceļš
            if (type === 1) {
                ctx.fillStyle = "#3a3a3a"; ctx.beginPath();
                ctx.moveTo(pos.x, pos.y); ctx.lineTo(pos.x + TILE_WIDTH/2, pos.y + TILE_HEIGHT/2);
                ctx.lineTo(pos.x, pos.y + TILE_HEIGHT); ctx.lineTo(pos.x - TILE_WIDTH/2, pos.y + TILE_HEIGHT/2);
                ctx.closePath(); ctx.fill();
            }

            // RCI Zonu struktūras un mājas
            let lvl = zoneData[key] ? zoneData[key].lvl : 0;
            if ((type === 2 || type === 3 || type === 4) && lvl > 0) {
                let h = lvl === 1 ? 15 : lvl === 2 ? 35 : 75;
                let isAband = zoneData[key].abandoned;

                // Krāsu shēmas (Graustiem/Pamestām ēkām krāsa ir netīri pelēka)
                let sideColor = isAband ? "#424949" : (type === 2 ? "#513e2d" : (type === 3 ? "#1a365d" : "#6e6e14"));
                let frontColor = isAband ? "#515a5a" : (type === 2 ? "#664f3a" : (type === 3 ? "#22497a" : "#87871a"));
                let roofColor = isAband ? "#2c3e50" : (type === 2 ? "#27ae60" : (type === 3 ? "#e67e22" : "#7f8c8d"));

                // 3D Sienu zīmēšana
                ctx.fillStyle = sideColor; ctx.beginPath();
                ctx.moveTo(cx - TILE_WIDTH/2 + 3, cy); ctx.lineTo(cx, cy + TILE_HEIGHT/2 - 1);
                ctx.lineTo(cx, cy + TILE_HEIGHT/2 - 1 - h); ctx.lineTo(cx - TILE_WIDTH/2 + 3, cy - h);
                ctx.closePath(); ctx.fill();

                ctx.fillStyle = frontColor; ctx.beginPath();
                ctx.moveTo(cx, cy + TILE_HEIGHT/2 - 1); ctx.lineTo(cx + TILE_WIDTH/2 - 3, cy);
                ctx.lineTo(cx + TILE_WIDTH/2 - 3, cy - h); ctx.lineTo(cx, cy + TILE_HEIGHT/2 - 1 - h);
                ctx.closePath(); ctx.fill();

                ctx.fillStyle = roofColor; ctx.beginPath();
                ctx.moveTo(cx, cy - h); ctx.lineTo(cx + TILE_WIDTH/2 - 3, cy - h);
                ctx.lineTo(cx, cy + TILE_HEIGHT/2 - 1 - h); ctx.lineTo(cx - TILE_WIDTH/2 + 3, cy - h);
                ctx.closePath(); ctx.fill();

                // Detalizācija: Rūpnīcu dūmeņi Industriālajā zonā (4)
                if (type === 4 && !isAband) {
                    ctx.fillStyle = "#333"; ctx.fillRect(cx - 4, cy - h - 10, 3, 10);
                    if(Math.random()>0.4) { ctx.fillStyle = "rgba(100,100,100,0.5)"; ctx.beginPath(); ctx.arc(cx-2, cy-h-12, 4, 0, Math.PI*2); ctx.fill(); }
                }
            }

            // Elektrostacija (5)
            if (type === 5) {
                ctx.fillStyle = "#566573"; ctx.fillRect(cx - 15, cy - 25, 30, 25);
                ctx.fillStyle = "#1a252f"; ctx.fillRect(cx - 10, cy - 42, 6, 18); ctx.fillRect(cx + 4, cy - 42, 6, 18);
            }

            // Ūdens Sūknis (6)
            if (type === 6) {
                ctx.fillStyle = "#2e4053"; ctx.fillRect(cx - 10, cy - 15, 20, 15);
                ctx.fillStyle = "#3498db"; ctx.fillRect(cx - 4, cy - 22, 8, 8);
            }

            // HOVER RĀMIS
            if (r === mouseGridY && c === mouseGridX) {
                ctx.fillStyle = currentTool === 'clear' ? "rgba(231,76,60,0.4)" : "rgba(255,255,255,0.3)";
                ctx.beginPath();
                ctx.moveTo(pos.x, pos.y); ctx.lineTo(pos.x + TILE_WIDTH/2, pos.y + TILE_HEIGHT/2);
                ctx.lineTo(pos.x, pos.y + TILE_HEIGHT); ctx.lineTo(pos.x - TILE_WIDTH/2, pos.y + TILE_HEIGHT/2);
                ctx.closePath(); ctx.fill();
            }
        }
    }
}

// PELES UN INTERAKCIJAS VADĪBA
canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    let mouseX = e.clientX - rect.left, mouseY = e.clientY - rect.top;
    let iso = actualToIso(mouseX, mouseY);
    mouseGridX = iso.c; mouseGridY = iso.r;
    drawWorld();
});

canvas.addEventListener("click", () => {
    if (mouseGridX >= 0 && mouseGridX < COLS && mouseGridY >= 0 && mouseGridY < ROWS) {
        let cost = COSTS[currentTool];
        let tile = world[mouseGridY][mouseGridX];
        let key = `${mouseGridY},${mouseGridX}`;

        if (currentTool === 'clear') {
            if (money >= cost) {
                money -= cost;
                world[mouseGridY][mouseGridX] = 0;
                powerWires[mouseGridY][mouseGridX] = false;
                waterPipes[mouseGridY][mouseGridX] = false;
                delete zoneData[key];
            }
        } else {
            if (money >= cost) {
                // Pazemes rīki darbojas neatkarīgi no virszemes
                if (currentTool === 'wire') { powerWires[mouseGridY][mouseGridX] = true; money -= cost; }
                else if (currentTool === 'pipe') { waterPipes[mouseGridY][mouseGridX] = true; money -= cost; }
                // Virszemes rīkiem vajag brīvu zemi
                else if (tile === 0 && viewLayer === 'surface') {
                    money -= cost;
                    if (currentTool === 'road') world[mouseGridY][mouseGridX] = 1;
                    if (currentTool === 'zoneR') world[mouseGridY][mouseGridX] = 2;
                    if (currentTool === 'zoneC') world[mouseGridY][mouseGridX] = 3;
                    if (currentTool === 'zoneI') world[mouseGridY][mouseGridX] = 4;
                    if (currentTool === 'power') world[mouseGridY][mouseGridX] = 5;
                    if (currentTool === 'water') world[mouseGridY][mouseGridX] = 6;
                }
            }
        }
        document.getElementById("money-display").innerText = money;
        updateSimulation();
    }
});

// PALAIŠANA
setInterval(updateSimulation, 2000); // Ik pēc 2 sekundēm pārrēķina mēnesi
updateSimulation();
