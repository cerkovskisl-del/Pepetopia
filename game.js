const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const COLS = 16, ROWS = 16;
const TILE_WIDTH = 54, TILE_HEIGHT = 27; 
const ORIGIN_X = canvas.width / 2;
const ORIGIN_Y = 40;

let money = 3500, income = 0, population = 0, taxRate = 7;
let demandR = 80, demandC = 40, demandI = 50;

// Spēles pamata režģi
let world = Array(ROWS).fill().map(() => Array(COLS).fill(0));
let powerWires = Array(ROWS).fill().map(() => Array(COLS).fill(false));
let waterPipes = Array(ROWS).fill().map(() => Array(COLS).fill(false));

// Aprēķinātie pārklājuma režģi
let hasPowerGrid = Array(ROWS).fill().map(() => Array(COLS).fill(false));
let hasWaterGrid = Array(ROWS).fill().map(() => Array(COLS).fill(false));
let policeGrid = Array(ROWS).fill().map(() => Array(COLS).fill(false));
let fireGrid = Array(ROWS).fill().map(() => Array(COLS).fill(false));
let healthGrid = Array(ROWS).fill().map(() => Array(COLS).fill(false));
let educationGrid = Array(ROWS).fill().map(() => Array(COLS).fill(false));
let pollutionGrid = Array(ROWS).fill().map(() => Array(COLS).fill(0));

// Vizuālo efektu objekti (Diena/Nakts, Mašīnas)
let gameTick = 0;
let isNight = false;
let cars = [];

let zoneData = {};
let currentTool = 'road';
let viewLayer = 'surface'; 
let mouseGridX = -1, mouseGridY = -1;

const COSTS = { 'road':10, 'zoneR':50, 'zoneC':60, 'zoneI':40, 'wire':5, 'pipe':5, 'power':600, 'water':350, 'police':300, 'fire':300, 'hospital':400, 'school':250, 'clear':10 };

function setTool(tool) {
    currentTool = tool;
    document.querySelectorAll(".sidebar .tool-btn").forEach(btn => { if(btn.id !== 'view-mode') btn.classList.remove("active"); });
    document.getElementById(`btn-${tool}`).classList.add("active");
}

function toggleViewLayer() {
    viewLayer = (viewLayer === 'surface') ? 'underground' : 'surface';
    document.getElementById("layer-display").innerText = (viewLayer === 'surface') ? 'Virszeme' : 'Pazeme';
    document.getElementById("layer-display").style.color = (viewLayer === 'surface') ? '#2ecc71' : '#8e44ad';
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

// ĢENERĒ REĀLLAIKA SATIKSMI (Mašīnas pārvietojas pa uzbūvētajiem ceļiem)
function updateTraffic() {
    if (gameTick % 5 === 0) { // Laiku pa laikam palaiž jaunu mašīnu uz nejauša ceļa
        let roadTiles = [];
        for(let r=0; r<ROWS; r++) {
            for(let c=0; c<COLS; c++) { if(world[r][c] === 1) roadTiles.push({r,c}); }
        }
        if(roadTiles.length > 1 && cars.length < 15) {
            let start = roadTiles[Math.floor(Math.random()*roadTiles.length)];
            cars.push({ r: start.r, c: start.c, progress: 0, color: ['#f39c12','#e74c3c','#f1c40f','#3498db'][Math.floor(Math.random()*4)] });
        }
    }

    // Kustina mašīnas uz priekšu pa ceļa kaimiņiem
    for(let i = cars.length - 1; i >= 0; i--) {
        let car = cars[i];
        car.progress += 0.1;
        if(car.progress >= 1) {
            car.progress = 0;
            // Atrod nākamo ceļa posmu
            let n = [{r:car.r-1, c:car.c}, {r:car.r+1, c:car.c}, {r:car.r, c:car.c-1}, {r:car.r, c:car.c+1}]
                     .filter(p => p.r>=0 && p.r<ROWS && p.c>=0 && p.c<COLS && world[p.r][p.c]===1);
            if(n.length > 0) {
                let next = n[Math.floor(Math.random()*n.length)];
                car.r = next.r; car.c = next.c;
            } else {
                cars.splice(i, 1); // noņem mašīnu, ja tā iebrauc strupceļā
            }
        }
    }
}

// SIMULĀCIJAS DZINĒJS: Aprēķina visu resursu pārklājumus un zonu loģiku
function updateSimulation() {
    gameTick++;
    isNight = (gameTick % 20 >= 10); // Diena/Nakts mainās ik pēc 10 cikliem
    document.getElementById("time-display").innerText = isNight ? "Nakts" : "Diena";
    document.getElementById("time-display").style.color = isNight ? "#5dade2" : "#f1c40f";

    // Reizina sākuma stāvokļus
    hasPowerGrid = Array(ROWS).fill().map(() => Array(COLS).fill(false));
    hasWaterGrid = Array(ROWS).fill().map(() => Array(COLS).fill(false));
    policeGrid = Array(ROWS).fill().map(() => Array(COLS).fill(false));
    fireGrid = Array(ROWS).fill().map(() => Array(COLS).fill(false));
    healthGrid = Array(ROWS).fill().map(() => Array(COLS).fill(false));
    educationGrid = Array(ROWS).fill().map(() => Array(COLS).fill(false));
    pollutionGrid = Array(ROWS).fill().map(() => Array(COLS).fill(0));

    let pSrc = [], wSrc = [], polSrc = [], fireSrc = [], lawSrc = [], medSrc = [], eduSrc = [];

    // 1. Apstrādājam visus objektus uz kartes
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let type = world[r][c];
            if (type === 5) { hasPowerGrid[r][c] = true; pSrc.push({r, c}); polSrc.push({r, c, rad:6, val:15}); }
            if (type === 6) { hasWaterGrid[r][c] = true; wSrc.push({r, c}); }
            if (type === 4) { polSrc.push({r, c, rad:4, val:10}); }
            if (type === 7) { lawSrc.push({r, c}); }
            if (type === 8) { fireSrc.push({r, c}); }
            if (type === 9) { medSrc.push({r, c}); }
            if (type === 10) { eduSrc.push({r, c}); }
        }
    }

    // BFS rādiusa aizpildīšanas funkcija dienestiem un piesārņojumam
    function fillServiceGrid(sources, targetGrid, maxDist, isPollution = false, polVal = 0) {
        let queue = sources.map(s => ({r: s.r, c: s.c, d: 0}));
        let visited = Array(ROWS).fill().map(() => Array(COLS).fill(false));
        queue.forEach(s => visited[s.r][s.c] = true);

        while(queue.length > 0) {
            let curr = queue.shift();
            if(isPollution) targetGrid[curr.r][curr.c] += (maxDist - curr.d) * polVal;
            else targetGrid[curr.r][curr.c] = true;

            if(curr.d >= maxDist) continue;

            let neighbors = [{r:curr.r-1, c:curr.c}, {r:curr.r+1, c:curr.c}, {r:curr.r, c:curr.c-1}, {r:curr.r, c:curr.c+1}];
            for(let n of neighbors) {
                if(n.r>=0 && n.r<ROWS && n.c>=0 && n.c<COLS && !visited[n.r][n.c]) {
                    if(!isPollution || (isPollution && curr.d + 1 <= maxDist)) {
                        visited[n.r][n.c] = true;
                        queue.push({r:n.r, c:n.c, d:curr.d + 1});
                    }
                }
            }
        }
    }

    // Aizpildām visus tīklus un rādiusus
    fillServiceGrid(pSrc, hasPowerGrid, 16); // Elektrība ceļo pa vadiem bezgalīgi
    fillServiceGrid(wSrc, hasWaterGrid, 16); // Ūdens ceļo pa caurulēm bezgalīgi
    fillServiceGrid(lawSrc, policeGrid, 5);
    fillServiceGrid(fireSrc, fireGrid, 5);
    fillServiceGrid(medSrc, healthGrid, 6);
    fillServiceGrid(eduSrc, educationGrid, 6);
    polSrc.forEach(p => fillServiceGrid([{r:p.r, c:p.c}], pollutionGrid, p.rad, true, p.val));

    // 2. Aprēķinām pilsētas zonu un katastrofu (Ugunsgrēku izplatības) loģiku
    let totalR = 0, totalC = 0, totalI = 0, calculatedPop = 0, calculatedIncome = 0;
    let hasFireOutbreak = false, hasCrimeOutbreak = false, fireSpreadTargets = [];

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let type = world[r][c];
            let key = `${r},${c}`;

            if (type >= 2 && type <= 4) {
                if (!zoneData[key]) zoneData[key] = { lvl: 0, progress: 0, abandoned: false, fire: false, crime: false };
                let data = zoneData[key];

                // Resursu blakus pārbaudes
                let cellPowered = hasPowerGrid[r][c] || (r>0 && hasPowerGrid[r-1][c]) || (r<ROWS-1 && hasPowerGrid[r+1][c]) || (c>0 && hasPowerGrid[r][c-1]) || (c<COLS-1 && hasPowerGrid[r][c+1]);
                let cellWatered = hasWaterGrid[r][c] || (r>0 && hasWaterGrid[r-1][c]) || (r<ROWS-1 && hasWaterGrid[r+1][c]) || (c>0 && hasWaterGrid[r][c-1]) || (c<COLS-1 && hasWaterGrid[r][c+1]);
                
                // Nejaušas nelaimes
                if (!policeGrid[r][c] && data.lvl > 0 && Math.random() > 0.96) data.crime = true;
                if (!fireGrid[r][c] && data.lvl > 0 && Math.random() > 0.97) data.fire = true;

                if (policeGrid[r][c]) data.crime = false;
                if (fireGrid[r][c]) data.fire = false;

                // KATASTROFA: Ugunsgrēks izplatās uz blakus lauciņiem, ja to nedzēš!
                if (data.fire) {
                    hasFireOutbreak = true;
                    if (Math.random() > 0.6) { // Uguns mēģina pārsviesties tālāk
                        [{r:r-1,c},{r:r+1,c},{r:r,c:-1},{r:r,c:1}].forEach(p => {
                            if(p.r>=0 && p.r<ROWS && p.c>=0 && p.c<COLS && world[p.r][p.c]>=2 && world[p.r][p.c]<=4) {
                                fireSpreadTargets.push(`${p.r},${p.c}`);
                            }
                        });
                    }
                }
                if (data.crime) hasCrimeOutbreak = true;

                // Pamestības (Graustu) nosacījumi
                let isSick = (pollutionGrid[r][c] > 30 && !healthGrid[r][c] && type === 2);
                if (!cellPowered || !cellWatered || data.fire || isSick) {
                    if(data.lvl > 0) data.abandoned = true;
                } else {
                    data.abandoned = false;
                }

                // Ēku augšana
                if (!data.abandoned && !data.crime) {
                    let demand = (type === 2) ? demandR : (type === 3 ? demandC : demandI);
                    // Lai sasniegtu 3. līmeni (debesskrāpjus), obligāti vajag SKOLAS izglītību!
                    let maxAllowedLvl = educationGrid[r][c] ? 3 : 2;

                    if (data.lvl < maxAllowedLvl && demand > 15 && Math.random() > 0.4) {
                        data.progress += 34;
                        if (data.progress >= 100) { data.lvl++; data.progress = 0; }
                    }
                } else {
                    if (Math.random() > 0.7 && data.lvl > 0) data.lvl--;
                }

                // Bilance un iedzīvotāji
                if (data.lvl > 0 && !data.abandoned) {
                    if (type === 2) { totalR += data.lvl; calculatedPop += data.lvl * 40; calculatedIncome += data.lvl * taxRate * 2.5; }
                    if (type === 3) { totalC += data.lvl; calculatedIncome += data.lvl * taxRate * 4.5; }
                    if (type === 4) { totalI += data.lvl; calculatedIncome += data.lvl * taxRate * 3.5; }
                }
            }
        }
    }

    // Aktivizējam ugunsgrēku izplatīšanos
    fireSpreadTargets.forEach(k => { if(zoneData[k] && zoneData[k].lvl > 0) zoneData[k].fire = true; });

    population = calculatedPop;
    
    // Budžeta atvilkumi par uzturēšanu
    let maintenance = 0;
    for(let r=0; r<ROWS; r++) {
        for(let c=0; c<COLS; c++) {
            if(world[r][c] >= 7 && world[r][c] <= 10) maintenance += 25; // Sabiedrisko ēku uzturēšana
        }
    }

    income = Math.round(calculatedIncome - maintenance);
    money += income;

    // RCI formulas
    let taxPenalty = (8 - taxRate) * 12;
    demandR = Math.max(-50, Math.min(100, 85 - (population * 0.04) + (totalI * 12) + taxPenalty));
    demandC = Math.max(-50, Math.min(100, (population * 0.07) - (totalC * 8) + taxPenalty));
    demandI = Math.max(-50, Math.min(100, 50 + (totalC * 6) - (totalI * 10) + taxPenalty));

    // UI interfeiss
    document.getElementById("money-display").innerText = money;
    document.getElementById("pop-display").innerText = population;
    let incBox = document.getElementById("income-display");
    incBox.innerText = (income >= 0 ? "+" : "") + income;
    incBox.style.color = (income >= 0) ? "#2ecc71" : "#e74c3c";

    document.getElementById("bar-r").style.height = Math.max(0, demandR) + "%";
    document.getElementById("bar-c").style.height = Math.max(0, demandC) + "%";
    document.getElementById("bar-i").style.height = Math.max(0, demandI) + "%";

    // News Ticker ziņojumi
    let ticker = document.getElementById("ticker-text");
    if (hasFireOutbreak) ticker.innerText = "🚨 ĀRKĀRTAS ZIŅAS: Pilsētā plosās nekontrolēts ugunsgrēks! Steidzami būvējiet Ugunsdzēsēju Depo!";
    else if (hasCrimeOutbreak) ticker.innerText = "🦹 NOZIEGUMI: Laupītāju bandu aktivitāte neapsargātos rajonos! Izvietojiet Policiju!";
    else if (demandR > 60) ticker.innerText = "📈 BIĻETENS: Iedzīvotāju pieplūdums. Cilvēki meklē jaunas zaļās dzīvojamās zonas.";
    else ticker.innerText = "🌤️ Pilsētas pārvalde ziņo par stabilu un veiksmīgu attīstību.";

    updateTraffic();
    drawWorld();
}

// STRĀDĀJOŠS GRAFIKAS DZINĒJS: Renderē virszemi, nakti un mašīnas
function drawWorld() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let type = world[r][c];
            let pos = isoToActual(r, c);
            let cx = pos.x, cy = pos.y + TILE_HEIGHT/2;
            let key = `${r},${c}`;

            // 1. ZEMES GABALS
            if (viewLayer === 'surface') {
                ctx.fillStyle = (r + c) % 2 === 0 ? "#1b3313" : "#203a16";
                if (pollutionGrid[r][c] > 20) ctx.fillStyle = "#3d4035"; // piesārņota zeme
                if (isNight) ctx.fillStyle = (r + c) % 2 === 0 ? "#0f1c0b" : "#12210d"; // nakts tonis zālei
            } else {
                ctx.fillStyle = "#161616"; // pazeme
            }

            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y); ctx.lineTo(pos.x + TILE_WIDTH/2, pos.y + TILE_HEIGHT/2);
            ctx.lineTo(pos.x, pos.y + TILE_HEIGHT); ctx.lineTo(pos.x - TILE_WIDTH/2, pos.y + TILE_HEIGHT/2);
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = viewLayer === 'surface' ? "rgba(5,15,5,0.15)" : "#262626";
            ctx.stroke();

            // 2. PAZEMES SKATS
            if (viewLayer === 'underground') {
                if (waterPipes[r][c]) { ctx.strokeStyle = hasWaterGrid[r][c] ? "#3498db" : "#1b4f72"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx-12, cy); ctx.lineTo(cx+12, cy); ctx.stroke(); }
                if (powerWires[r][c]) { ctx.strokeStyle = hasPowerGrid[r][c] ? "#f1c40f" : "#7d6608"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy-6); ctx.lineTo(cx, cy+6); ctx.stroke(); }
                continue;
            }

            // 3. VIRSZEMES STRUKTŪRAS (3D Modeļi)
            if (type === 1) { // Ceļš
                ctx.fillStyle = isNight ? "#252525" : "#383838"; ctx.beginPath();
                ctx.moveTo(pos.x, pos.y); ctx.lineTo(pos.x + TILE_WIDTH/2, pos.y + TILE_HEIGHT/2);
                ctx.lineTo(pos.x, pos.y + TILE_HEIGHT); ctx.lineTo(pos.x - TILE_WIDTH/2, pos.y + TILE_HEIGHT/2);
                ctx.closePath(); ctx.fill();
            }

            let lvl = zoneData[key] ? zoneData[key].lvl : 0;
            if ((type >= 2 && type <= 4) && lvl > 0) { // Mājas / Rūpnīcas
                let h = lvl === 1 ? 16 : lvl === 2 ? 36 : 76;
                let isAband = zoneData[key].abandoned;

                let sideColor = isAband ? "#3d4242" : (type === 2 ? "#4f3d2d" : (type === 3 ? "#173356" : "#636315"));
                let frontColor = isAband ? "#4a4f4f" : (type === 2 ? "#634d39" : (type === 3 ? "#204675" : "#7a7a1b"));
                let roofColor = isAband ? "#263238" : (type === 2 ? "#2196f3" : (type === 3 ? "#e67e22" : "#566573"));

                // Zīmē sienas
                ctx.fillStyle = sideColor; ctx.beginPath(); ctx.moveTo(cx - TILE_WIDTH/2+2, cy); ctx.lineTo(cx, cy + TILE_HEIGHT/2-1); ctx.lineTo(cx, cy + TILE_HEIGHT/2-1-h); ctx.lineTo(cx - TILE_WIDTH/2+2, cy - h); ctx.closePath(); ctx.fill();
                ctx.fillStyle = frontColor; ctx.beginPath(); ctx.moveTo(cx, cy + TILE_HEIGHT/2-1); ctx.lineTo(cx + TILE_WIDTH/2-2, cy); ctx.lineTo(cx + TILE_WIDTH/2-2, cy - h); ctx.lineTo(cx, cy + TILE_HEIGHT/2-1-h); ctx.closePath(); ctx.fill();
                ctx.fillStyle = roofColor; ctx.beginPath(); ctx.moveTo(cx, cy - h); ctx.lineTo(cx + TILE_WIDTH/2-2, cy - h); ctx.lineTo(cx, cy + TILE_HEIGHT/2-1-h); ctx.lineTo(cx - TILE_WIDTH/2+2, cy - h); ctx.closePath(); ctx.fill();

                // NAKTS LOGU APGAISMOJUMS
                if (isNight && !isAband && cellPowered) {
                    ctx.fillStyle = "#fadb14";
                    if(lvl === 3) { ctx.fillRect(cx+4, cy-40, 3, 5); ctx.fillRect(cx+12, cy-25, 3, 5); }
                    else { ctx.fillRect(cx+4, cy-10, 3, 4); }
                }

                // Katastrofu indikatori (Uguns/Noziegumi)
                if(zoneData[key].fire) { ctx.fillStyle="#e74c3c"; ctx.font="10px sans-serif"; ctx.fillText("🔥", cx-5, cy-h-4); }
                else if(zoneData[key].crime) { ctx.fillStyle="#9b59b6"; ctx.font="10px sans-serif"; ctx.fillText("🦹", cx-5, cy-h-4); }
            }

            // Dienestu speciālās 3D ēkas
            if (type === 5) { ctx.fillStyle = "#424949"; ctx.fillRect(cx-14, cy-20, 28, 20); ctx.fillStyle = "#111"; ctx.fillRect(cx-10, cy-34, 5, 14); } // Stacija
            if (type === 6) { ctx.fillStyle = "#2e4053"; ctx.fillRect(cx-10, cy-14, 20, 14); ctx.fillStyle = "#3498db"; ctx.fillRect(cx-4, cy-20, 8, 6); } // Sūknis
            if (type === 7) { ctx.fillStyle = "#1c2833"; ctx.fillRect(cx-12, cy-22, 24, 22); ctx.fillStyle = "#3498db"; ctx.fillRect(cx-3, cy-26, 6, 4); } // Policija
            if (type === 8) { ctx.fillStyle = "#78281f"; ctx.fillRect(cx-12, cy-20, 24, 20); ctx.fillStyle = "#e74c3c"; ctx.fillRect(cx-8, cy-12, 6, 12); } // Ugunsdzēsēji
            if (type === 9) { ctx.fillStyle = "#7e5109"; ctx.fillRect(cx-14, cy-24, 28, 24); ctx.fillStyle = "#e74c3c"; ctx.font="bold 12px sans-serif"; ctx.fillText("+", cx-4, cy-10); } // Slimnīca
            if (type === 10) { ctx.fillStyle = "#1a5276"; ctx.fillRect(cx-14, cy-18, 28, 18); ctx.fillStyle = "#fff"; ctx.font="8px Arial"; ctx.fillText("🎓", cx-5, cy-6); } // Skola

            // HOVER MARĶIERIS
            if (r === mouseGridY && c === mouseGridX) {
                ctx.fillStyle = currentTool === 'clear' ? "rgba(231,76,60,0.4)" : "rgba(255,255,255,0.3)";
                ctx.beginPath(); ctx.moveTo(pos.x, pos.y); ctx.lineTo(pos.x + TILE_WIDTH/2, pos.y + TILE_HEIGHT/2); ctx.lineTo(pos.x, pos.y + TILE_HEIGHT); ctx.lineTo(pos.x - TILE_WIDTH/2, pos.y + TILE_HEIGHT/2); ctx.closePath(); ctx.fill();
            }
        }
    }

    // 4. RENDERĒJAM KUSTOŠĀS MAŠĪNAS
    cars.forEach(car => {
        let posStart = isoToActual(car.r, car.c);
        ctx.fillStyle = car.color;
        ctx.fillRect(posStart.x - 3, posStart.y + TILE_HEIGHT/2 - 2, 6, 4); // uzzīmē mašīnu uz ceļa
    });
}

// SAGLABĀŠANAS UN IELĀDES SISTĒMA (Izmanto pārlūkprogrammas atmiņu)
function saveGame() {
    let saveData = { world, powerWires, waterPipes, money, taxRate, zoneData };
    localStorage.setItem("SimCity_Save", JSON.stringify(saveData));
    document.getElementById("ticker-text").innerText = "💾 PILSĒTA VEIKSMĪGI SAGLABĀTA PĀRLŪKA ATMIŅĀ!";
}

function loadGame() {
    let data = localStorage.getItem("SimCity_Save");
    if(data) {
        let parsed = JSON.parse(data);
        world = parsed.world; powerWires = parsed.powerWires; waterPipes = parsed.waterPipes;
        money = parsed.money; taxRate = parsed.taxRate; zoneData = parsed.zoneData;
        document.getElementById("tax-display").innerText = taxRate + "%";
        updateSimulation();
        document.getElementById("ticker-text").innerText = "📂 PILSĒTA VEIKSMĪGI IELĀDĒTA!";
    } else {
        alert("Nav atrasts neviens saglabāts fails!");
    }
}

// INTERAKCIJAS klausītāji
canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    let iso = actualToIso(e.clientX - rect.left, e.clientY - rect.top);
    mouseGridX = iso.c; mouseGridY = iso.r;
    drawWorld();
});

canvas.addEventListener("click", () => {
    if (mouseGridX >= 0 && mouseGridX < COLS && mouseGridY >= 0 && mouseGridY < ROWS) {
        let cost = COSTS[currentTool], tile = world[mouseGridY][mouseGridX];
        if (currentTool === 'clear' && money >= cost) {
            money -= cost; world[mouseGridY][mouseGridX] = 0;
            powerWires[mouseGridY][mouseGridX] = false; waterPipes[mouseGridY][mouseGridX] = false;
            delete zoneData[`${mouseGridY},${mouseGridX}`];
        } else if (money >= cost) {
            if (currentTool === 'wire') { powerWires[mouseGridY][mouseGridX] = true; money -= cost; }
            else if (currentTool === 'pipe') { waterPipes[mouseGridY][mouseGridX] = true; money -= cost; }
            else if (tile === 0 && viewLayer === 'surface') {
                money -= cost;
                let tools = {'road':1,'zoneR':2,'zoneC':3,'zoneI':4,'power':5,'water':6,'police':7,'fire':8,'hospital':9,'school':10};
                if(tools[currentTool]) world[mouseGridY][mouseGridX] = tools[currentTool];
            }
        }
        document.getElementById("money-display").innerText = money;
        updateSimulation();
    }
});

// START
setInterval(updateSimulation, 2000); // Mēneša simulācijas solis
setInterval(drawWorld, 100);        // Grafikas un mašīnu animācijas solis (10 FPS)
updateSimulation();
