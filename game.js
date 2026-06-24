const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const TILE_SIZE = 40; 
const COLS = 16; 
const ROWS = 16;

let money = 1200;
let income = 0;
let population = 0;

// SimCity pieprasījuma sistēma (sākas ar augstu dzīvojamo zonu pieprasījumu)
let demandR = 80;
let demandC = 30;

const COSTS = { 'road': 10, 'zoneR': 50, 'zoneC': 60, 'power': 400, 'clear': 0 };

// 0=Zāle, 1=Ceļš, 2=Dzīvojamā Zona, 3=Komerccentrs, 4=Kek Stacija
let world = Array(ROWS).fill().map(() => Array(COLS).fill(0));
let powerGrid = Array(ROWS).fill().map(() => Array(COLS).fill(false));

// Glabā ēku augšanas datus (līmeņi: 0=tukša zona, 1-3=uzbūvēta ēka)
let zoneData = {}; 

let currentTool = 'road';
let mouseGridX = -1; let mouseGridY = -1;

function setTool(tool) {
    currentTool = tool;
    document.querySelectorAll(".controls button").forEach(btn => btn.classList.remove("active"));
    document.getElementById(`btn-${tool}`).classList.add("active");
}

// Strāvas loģika (BFS)
function updatePowerGrid() {
    powerGrid = Array(ROWS).fill().map(() => Array(COLS).fill(false));
    let queue = [];

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (world[r][c] === 4) { // Kek Stacija
                powerGrid[r][c] = true;
                queue.push({r: r, c: c});
            }
        }
    }

    while (queue.length > 0) {
        let current = queue.shift();
        let neighbors = [
            {r: current.r - 1, c: current.c}, {r: current.r + 1, c: current.c},
            {r: current.r, c: current.c - 1}, {r: current.r, c: current.c + 1}
        ];

        for (let n of neighbors) {
            if (n.r >= 0 && n.r < ROWS && n.c >= 0 && n.c < COLS) {
                let type = world[n.r][n.c];
                if (!powerGrid[n.r][n.c] && type !== 0) {
                    powerGrid[n.r][n.c] = true;
                    if (type === 1) queue.push({r: n.r, c: n.c}); // Strāva ceļo tikai pa ceļiem
                }
            }
        }
    }
}

// Simulācijas cikls: Aprēķina ekonomiku, pieprasījumu un māju augšanu
function simulationStep() {
    let currentR_Buildings = 0;
    let currentC_Buildings = 0;
    let tempPopulation = 0;
    let tempIncome = 0;

    // 1. Pārbaudām katru zonu pasaulē
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let type = world[r][c];
            let hasPower = powerGrid[r][c];
            let key = `${r},${c}`;

            if (type === 2 || type === 3) { // R vai C zona
                if (!zoneData[key]) zoneData[key] = { lvl: 0, progress: 0 };
                let data = zoneData[key];

                // Ēkas aug tikai tad, ja ir elektrība un pieprasījums
                if (hasPower) {
                    let demand = (type === 2) ? demandR : demandC;
                    
                    if (data.lvl < 3 && demand > 10) {
                        data.progress += Math.random() * 20; // Nejaušs augšanas ātrums
                        if (data.progress >= 100) {
                            data.lvl++;
                            data.progress = 0;
                        }
                    }
                } else {
                    // Ja pazūd elektrība, ēkas lēnām pamestības dēļ sabrūk
                    if (data.lvl > 0 && Math.random() > 0.7) data.lvl--;
                }

                // Saskaitām populāciju un ienākumus pēc līmeņiem
                if (type === 2 && data.lvl > 0) {
                    currentR_Buildings += data.lvl;
                    tempPopulation += data.lvl === 1 ? 10 : data.lvl === 2 ? 40 : 150;
                    tempIncome += data.lvl * 5; // Dzīvojamie nodokļi
                }
                if (type === 3 && data.lvl > 0) {
                    currentC_Buildings += data.lvl;
                    tempIncome += data.lvl === 1 ? 25 : data.lvl === 2 ? 80 : 250; // Biznesa nodokļi
                }
            }
        }
    }

    // 2. Dinamiskā SimCity pieprasījuma formula
    population = tempPopulation;
    demandR = Math.max(10, Math.min(100, 100 - (population * 0.1) + (currentC_Buildings * 15)));
    demandC = Math.max(5, Math.min(100, (population * 0.2) - (currentC_Buildings * 12) + 15));

    money += tempIncome;
    income = tempIncome;

    // 3. Atjaunojam UI datus
    document.getElementById("money-display").innerText = money;
    document.getElementById("income-display").innerText = income;
    document.getElementById("pop-display").innerText = population;
    document.getElementById("r-demand").style.width = demandR + "%";
    document.getElementById("c-demand").style.width = demandC + "%";

    drawWorld();
}

// GRAFIKAS DZINĒJS: Zīmē procedurālos spraitus
function drawWorld() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let type = world[r][c];
            let hasPower = powerGrid[r][c];
            let key = `${r},${c}`;
            let x = c * TILE_SIZE;
            let y = r * TILE_SIZE;

            // 1. ZĪMĒJAM ZĀLI KĀ PAMATU
            ctx.fillStyle = "#274e13";
            ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
            
            // Koku dekorācijas uz zāles (procedurāli pēc koordinātām)
            if (type === 0 && (r+c) % 5 === 0) {
                ctx.fillStyle = "#1e3f0b";
                ctx.beginPath(); ctx.arc(x+20, y+20, 4, 0, Math.PI*2); ctx.fill();
            }

            // 2. CEĻŠ (Asfalts ar līnijām)
            if (type === 1) {
                ctx.fillStyle = "#3a3a3a";
                ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
                // Elektrības kabeļa līnija ceļa vidū
                ctx.strokeStyle = hasPower ? "#00ffff" : "#555555";
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(x + TILE_SIZE/2, y); ctx.lineTo(x + TILE_SIZE/2, y + TILE_SIZE);
                ctx.moveTo(x, y + TILE_SIZE/2); ctx.lineTo(x + TILE_SIZE, y + TILE_SIZE/2);
                ctx.stroke();
            }

            // 3. DZĪVOJAMĀ (R) UN KOMERCCENTRA (C) ZONA
            if (type === 2 || type === 3) {
                // Uzzīmējam tukšas zonas rāmi (Kā SimCity - caurspīdīgi zaļš vai zils)
                ctx.fillStyle = type === 2 ? "rgba(46, 204, 113, 0.2)" : "rgba(52, 152, 219, 0.2)";
                ctx.fillRect(x+2, y+2, TILE_SIZE-4, TILE_SIZE-4);
                ctx.strokeStyle = type === 2 ? "#2ecc71" : "#3498db";
                ctx.lineWidth = 1; ctx.strokeRect(x+2, y+2, TILE_SIZE-4, TILE_SIZE-4);

                let lvl = zoneData[key] ? zoneData[key].lvl : 0;

                // Ja ēka ir uzaugusi, zīmējam attiecīgā līmeņa māju
                if (lvl > 0) {
                    ctx.fillStyle = type === 2 ? "#7d6608" : "#2471a3"; // Mājas vai Ofisa sienas

                    if (lvl === 1) { // Mazā būdiņa
                        ctx.fillRect(x+10, y+15, 20, 20);
                        ctx.fillStyle = "#9a7d0a"; // Jumts
                        ctx.beginPath(); ctx.moveTo(x+10, y+15); ctx.lineTo(x+20, y+5); ctx.lineTo(x+30, y+15); ctx.fill();
                    } 
                    else if (lvl === 2) { // Vidējā māja / Veikals
                        ctx.fillRect(x+6, y+10, 28, 26);
                        ctx.fillStyle = "#111"; // Logi
                        ctx.fillRect(x+10, y+16, 6, 6); ctx.fillRect(x+24, y+16, 6, 6);
                    } 
                    else if (lvl === 3) { // Milzu Pepes debesskrāpis!
                        ctx.fillStyle = type === 2 ? "#196f3d" : "#1a5276";
                        ctx.fillRect(x+4, y+4, 32, 34);
                        // Daudz mazu spīdošu logu
                        ctx.fillStyle = hasPower ? "#f1c40f" : "#444";
                        for(let i=0; i<3; i++) {
                            for(let j=0; j<3; j++) {
                                ctx.fillRect(x + 8 + i*9, y + 8 + j*9, 4, 5);
                            }
                        }
                    }

                    // Mazs zibens simbols, ja mājai nav strāvas
                    if (!hasPower) {
                        ctx.fillStyle = "#e74c3c"; ctx.font = "bold 12px sans-serif";
                        ctx.fillText("⚡", x+4, y+14);
                    }
                }
            }

            // 4. KEK ELEKTROSTACIJA (Industriāla ēka ar dūmeņiem)
            if (type === 4) {
                ctx.fillStyle = "#5d6d7e";
                ctx.fillRect(x+4, y+8, 32, 28); // Galvenā ēka
                ctx.fillStyle = "#2c3e50"; // Dūmeņi
                ctx.fillRect(x+8, y+2, 6, 10); ctx.fillRect(x+26, y+2, 6, 10);
                ctx.fillStyle = "#00ffff"; // Enerģijas kodols centrā
                ctx.fillRect(x+16, y+18, 8, 10);
            }
        }
    }

    // HOVER ĒNA
    if (mouseGridX >= 0 && mouseGridX < COLS && mouseGridY >= 0 && mouseGridY < ROWS) {
        ctx.fillStyle = currentTool === 'clear' ? "rgba(231,76,60,0.4)" : "rgba(255,255,255,0.25)";
        ctx.fillRect(mouseGridX * TILE_SIZE, mouseGridY * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
}

// Peles kustības un klikšķi
canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseGridX = Math.floor((e.clientX - rect.left) / TILE_SIZE);
    mouseGridY = Math.floor((e.clientY - rect.top) / TILE_SIZE);
    drawWorld();
});

canvas.addEventListener("mouseleave", () => { mouseGridX = -1; mouseGridY = -1; drawWorld(); });

canvas.addEventListener("click", () => {
    if (mouseGridX >= 0 && mouseGridX < COLS && mouseGridY >= 0 && mouseGridY < ROWS) {
        let cost = COSTS[currentTool];
        let currentTile = world[mouseGridY][mouseGridX];
        let key = `${mouseGridY},${mouseGridX}`;

        if (currentTool === 'clear') {
            if (currentTile !== 0) {
                world[mouseGridY][mouseGridX] = 0;
                delete zoneData[key];
            }
        } else {
            if (money >= cost && currentTile === 0) {
                money -= cost;
                if (currentTool === 'road') world[mouseGridY][mouseGridX] = 1;
                if (currentTool === 'zoneR') world[mouseGridY][mouseGridX] = 2;
                if (currentTool === 'zoneC') world[mouseGridY][mouseGridX] = 3;
                if (currentTool === 'power') world[mouseGridY][mouseGridX] = 4;
            }
        }

        document.getElementById("money-display").innerText = money;
        updatePowerGrid();
        simulationStep();
    }
});

// Palaidējs
setInterval(simulationStep, 1000); // Darbina spēles dzinēju ik pēc 1 sekundes
currentTool = 'road';
updatePowerGrid();
drawWorld();
