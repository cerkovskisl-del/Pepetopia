const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const COLS = 16;
const ROWS = 16;
const TILE_WIDTH = 52;  
const TILE_HEIGHT = 26; 

const ORIGIN_X = canvas.width / 2;
const ORIGIN_Y = 50;

let money = 2000;
let income = 0;
let population = 0;
let taxRate = 7; // Sākotnējā nodokļu likme (%)
let demandR = 90;
let demandC = 40;

const COSTS = { 'road': 10, 'zoneR': 50, 'zoneC': 60, 'power': 400, 'water': 250, 'police': 300, 'fire': 300, 'clear': 0 };

// 0=Zāle, 1=Ceļš, 2=Dzīvojamā, 3=Komercija, 4=Kek Stacija, 5=Ūdens Tornis, 6=Policija, 7=Ugunsdzēsēji
let world = Array(ROWS).fill().map(() => Array(COLS).fill(0));
let powerGrid = Array(ROWS).fill().map(() => Array(COLS).fill(false));
let waterGrid = Array(ROWS).fill().map(() => Array(COLS).fill(false));
let policeCoverage = Array(ROWS).fill().map(() => Array(COLS).fill(false));
let fireCoverage = Array(ROWS).fill().map(() => Array(COLS).fill(false));

let zoneData = {};
let currentTool = 'road';
let mouseGridX = -1; let mouseGridY = -1;

function setTool(tool) {
    currentTool = tool;
    document.querySelectorAll(".controls button").forEach(btn => btn.classList.remove("active"));
    document.getElementById(`btn-${tool}`).classList.add("active");
}

function changeTax(amount) {
    taxRate = Math.max(1, Math.min(20, taxRate + amount));
    document.getElementById("tax-display").innerText = taxRate;
    simulationStep();
}

function isoToActual(r, c) {
    return {
        x: ORIGIN_X + (c - r) * (TILE_WIDTH / 2),
        y: ORIGIN_Y + (c + r) * (TILE_HEIGHT / 2)
    };
}

function actualToIso(mouseX, mouseY) {
    let dx = mouseX - ORIGIN_X;
    let dy = mouseY - ORIGIN_Y;
    let c = Math.floor((dy / (TILE_HEIGHT / 2) + dx / (TILE_WIDTH / 2)) / 2);
    let r = Math.floor((dy / (TILE_HEIGHT / 2) - dx / (TILE_WIDTH / 2)) / 2);
    return { r: r, c: c };
}

// Inženiertīklu un pilsētas dienestu pārklājuma aprēķini (BFS algoritmi)
function updateCityServices() {
    powerGrid = Array(ROWS).fill().map(() => Array(COLS).fill(false));
    waterGrid = Array(ROWS).fill().map(() => Array(COLS).fill(false));
    policeCoverage = Array(ROWS).fill().map(() => Array(COLS).fill(false));
    fireCoverage = Array(ROWS).fill().map(() => Array(COLS).fill(false));
    
    let powerQueue = [], waterQueue = [], policeQueue = [], fireQueue = [];

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (world[r][c] === 4) { powerGrid[r][c] = true; powerQueue.push({r:r, c:c}); }
            if (world[r][c] === 5) { waterGrid[r][c] = true; waterQueue.push({r:r, c:c, dist:0}); }
            if (world[r][c] === 6) { policeCoverage[r][c] = true; policeQueue.push({r:r, c:c, dist:0}); }
            if (world[r][c] === 7) { fireCoverage[r][c] = true; fireQueue.push({r:r, c:c, dist:0}); }
        }
    }

    // 1. Elektrība (pa ceļiem un blakus esošām ēkām)
    while (powerQueue.length > 0) {
        let curr = powerQueue.shift();
        let neighbors = [{r:curr.r-1, c:curr.c}, {r:curr.r+1, c:curr.c}, {r:curr.r, c:curr.c-1}, {r:curr.r, c:curr.c+1}];
        for (let n of neighbors) {
            if (n.r >= 0 && n.r < ROWS && n.c >= 0 && n.c < COLS) {
                if (!powerGrid[n.r][n.c] && world[n.r][n.c] !== 0) {
                    powerGrid[n.r][n.c] = true;
                    if (world[n.r][n.c] === 1) powerQueue.push({r:n.r, c:n.c});
                }
            }
        }
    }

    // Palīgfunkcija rādiusa dienestiem (Ūdens, Policija, Ugunsdzēsēji)
    function runRadiusBFS(queue, grid, maxDist) {
        while (queue.length > 0) {
            let curr = queue.shift();
            if (curr.dist >= maxDist) continue;
            let neighbors = [{r:curr.r-1, c:curr.c}, {r:curr.r+1, c:curr.c}, {r:curr.r, c:curr.c-1}, {r:curr.r, c:curr.c+1}];
            for (let n of neighbors) {
                if (n.r >= 0 && n.r < ROWS && n.c >= 0 && n.c < COLS) {
                    if (!grid[n.r][n.c]) {
                        grid[n.r][n.c] = true;
                        queue.push({r:n.r, c:n.c, dist: curr.dist + 1});
                    }
                }
            }
        }
    }

    runRadiusBFS(waterQueue, waterGrid, 5);   // Ūdens rādiuss: 5
    runRadiusBFS(policeQueue, policeCoverage, 6); // Policijas rādiuss: 6
    runRadiusBFS(fireQueue, fireCoverage, 6);     // Ugunsdzēsēju rādiuss: 6
}

// SimCity galvenais simulācijas matemātiskais dzinējs
function simulationStep() {
    let currentR = 0; let currentC = 0;
    let tempPop = 0; let tempInc = 0;
    let totalZones = 0; let poweredZones = 0; let wateredZones = 0;

    // Nodokļu ietekmes koeficients uz pieprasījumu (7% ir neitrāls, virs 9% ir bīstams)
    let taxEffect = (9 - taxRate) * 8; 

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let type = world[r][c];
            let hasPower = powerGrid[r][c];
            let hasWater = waterGrid[r][c];
            let hasPolice = policeCoverage[r][c];
            let hasFire = fireCoverage[r][c];
            let key = `${r},${c}`;

            if (type === 2 || type === 3) {
                totalZones++;
                if (hasPower) poweredZones++;
                if (hasWater) wateredZones++;

                if (!zoneData[key]) zoneData[key] = { lvl: 0, progress: 0, crime: false, fire: false };
                let data = zoneData[key];

                // Noziedzības un ugunsgrēku nejauša rašanās, ja nav pārklājuma
                if (!hasPolice && data.lvl > 0 && Math.random() > 0.95) data.crime = true;
                if (!hasFire && data.lvl > 0 && Math.random() > 0.97) data.fire = true;

                // Dienesti atbrauc un salabo, ja uzbūvē aizsardzību vēlāk
                if (hasPolice) data.crime = false;
                if (hasFire) data.fire = false;

                // Ēku attīstības kritēriji
                if (hasPower && !data.fire && !data.crime) {
                    let demand = (type === 2) ? demandR : demandC;
                    let maxLvl = hasWater ? 3 : 1; 

                    if (data.lvl < maxLvl && demand > 20) {
                        data.progress += Math.random() * 20;
                        if (data.progress >= 100) { data.lvl++; data.progress = 0; }
                    } else if (data.lvl > maxLvl) {
                        data.lvl = maxLvl; 
                    }
                } else {
                    // Ja trūkst strāvas vai plosās noziegumi/uguns, mājas degradējas
                    if (data.lvl > 0 && Math.random() > 0.6) data.lvl--;
                }

                // Finanšu un populācijas aprēķins
                if (data.lvl > 0) {
                    let efficiency = (data.crime || data.fire) ? 0 : 1; // Problēmu skartās zonas nemaksā nodokļus

                    if (type === 2) {
                        currentR += data.lvl;
                        tempPop += (data.lvl === 1 ? 15 : data.lvl === 2 ? 65 : 220) * efficiency;
                        tempInc += Math.round(data.lvl * taxRate * 1.2 * efficiency);
                    } else {
                        currentC += data.lvl;
                        tempInc += Math.round((data.lvl === 1 ? 25 : data.lvl === 2 ? 90 : 320) * (taxRate / 7) * efficiency);
                    }
                }
            }
        }
    }

    population = tempPop;
    
    // SimCity RCI pieprasījuma līknes formulas
    demandR = Math.max(-50, Math.min(100, 90 - (population * 0.07) + (currentC * 10) + taxEffect));
    demandC = Math.max(-50, Math.min(100, (population * 0.12) - (currentC * 8) + 15 + taxEffect));
    
    // Infrastruktūras uzturēšanas izmaksas (SimCity budžeta atvilkumi)
    let maintenance = 0;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (world[r][c] === 6 || world[r][c] === 7) maintenance += 30; // Katrs iecirknis maksā $30/sek uzturēšanā
        }
    }

    income = tempInc - maintenance;
    money += income;

    let powPct = totalZones > 0 ? Math.round((poweredZones/totalZones)*100) : 0;
    let watPct = totalZones > 0 ? Math.round((wateredZones/totalZones)*100) : 0;

    // UI Atjaunošana
    document.getElementById("money-display").innerText = money;
    let incDisp = document.getElementById("income-display");
    incDisp.innerText = (income >= 0 ? "+" : "") + income;
    incDisp.style.color = income >= 0 ? "#2ecc71" : "#e74c3c";

    document.getElementById("pop-display").innerText = population;
    document.getElementById("power-pct").innerText = powPct;
    document.getElementById("water-pct").innerText = watPct;
    document.getElementById("r-demand").style.width = Math.max(0, demandR) + "%";
    document.getElementById("c-demand").style.width = Math.max(0, demandC) + "%";

    updateCityServices();
    drawWorld();
}

// REĀLISTISKAIS IZOMETRISKAIS 3D GRAFIKAS DZINĒJS
function drawWorld() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let type = world[r][c];
            let pos = isoToActual(r, c);
            let hasPower = powerGrid[r][c];
            let hasWater = waterGrid[r][c];
            let key = `${r},${c}`;
            let cx = pos.x;
            let cy = pos.y + TILE_HEIGHT/2;

            // 1. Pamata Izometriskais Rombas (Zeme)
            ctx.fillStyle = (r + c) % 2 === 0 ? "#29461b" : "#2f5020"; 
            if (type === 2) ctx.fillStyle = "rgba(46, 204, 113, 0.2)";
            if (type === 3) ctx.fillStyle = "rgba(52, 152, 219, 0.2)";

            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y);
            ctx.lineTo(pos.x + TILE_WIDTH/2, pos.y + TILE_HEIGHT/2);
            ctx.lineTo(pos.x, pos.y + TILE_HEIGHT);
            ctx.lineTo(pos.x - TILE_WIDTH/2, pos.y + TILE_HEIGHT/2);
            ctx.closePath(); ctx.fill();

            ctx.strokeStyle = "rgba(15,30,15,0.3)";
            ctx.lineWidth = 1; ctx.stroke();

            // 2. Šoseja / Ceļš
            if (type === 1) {
                ctx.fillStyle = "#3e3e3e";
                ctx.beginPath();
                ctx.moveTo(pos.x, pos.y); ctx.lineTo(pos.x + TILE_WIDTH/2, pos.y + TILE_HEIGHT/2);
                ctx.lineTo(pos.x, pos.y + TILE_HEIGHT); ctx.lineTo(pos.x - TILE_WIDTH/2, pos.y + TILE_HEIGHT/2);
                ctx.closePath(); ctx.fill();

                // Vidus līnija (vadi)
                ctx.strokeStyle = hasPower ? "#00ffff" : "#5d6d7e";
                ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(pos.x, pos.y + TILE_HEIGHT/2); ctx.lineTo(pos.x + TILE_WIDTH/2, pos.y + TILE_HEIGHT/2);
                ctx.moveTo(pos.x, pos.y); ctx.lineTo(pos.x, pos.y + TILE_HEIGHT); ctx.stroke();
            }

            // 3. 3D Dzīvojamās un Komercijas ēkas
            let lvl = zoneData[key] ? zoneData[key].lvl : 0;
            if ((type === 2 || type === 3) && lvl > 0) {
                let h = lvl === 1 ? 16 : lvl === 2 ? 38 : 80; 
                let sideColor = type === 2 ? "#513f2e" : "#1f4360";
                let frontColor = type === 2 ? "#66503a" : "#28567a";
                let roofColor = type === 2 ? "#229954" : "#d35400";

                // Kreisā siena
                ctx.fillStyle = sideColor; ctx.beginPath();
                ctx.moveTo(cx - TILE_WIDTH/2 + 3, cy); ctx.lineTo(cx, cy + TILE_HEIGHT/2 - 1);
                ctx.lineTo(cx, cy + TILE_HEIGHT/2 - 1 - h); ctx.lineTo(cx - TILE_WIDTH/2 + 3, cy - h);
                ctx.closePath(); ctx.fill();

                // Labā siena
                ctx.fillStyle = frontColor; ctx.beginPath();
                ctx.moveTo(cx, cy + TILE_HEIGHT/2 - 1); ctx.lineTo(cx + TILE_WIDTH/2 - 3, cy);
                ctx.lineTo(cx + TILE_WIDTH/2 - 3, cy - h); ctx.lineTo(cx, cy + TILE_HEIGHT/2 - 1 - h);
                ctx.closePath(); ctx.fill();

                // Jumts
                ctx.fillStyle = roofColor; ctx.beginPath();
                ctx.moveTo(cx, cy - h); ctx.lineTo(cx + TILE_WIDTH/2 - 3, cy - h);
                ctx.lineTo(cx, cy + TILE_HEIGHT/2 - 1 - h); ctx.lineTo(cx - TILE_WIDTH/2 + 3, cy - h);
                ctx.closePath(); ctx.fill();

                // Logi debesskrāpjiem (Lvl 3)
                if (lvl === 3 && hasPower) {
                    ctx.fillStyle = "#f4d03f";
                    for(let i=0; i<2; i++) {
                        ctx.fillRect(cx + 4 + i*8, cy - 50, 3, 5);
                        ctx.fillRect(cx + 4 + i*8, cy - 30, 3, 5);
                    }
                }

                // Problēmu ikonas (Katastrofas / Trūkumi)
                if (zoneData[key].fire) {
                    ctx.fillStyle = "#e74c3c"; ctx.fillRect(cx-6, cy-h-12, 12, 12);
                    ctx.fillStyle = "#fff"; ctx.font = "9px sans-serif"; ctx.fillText("🔥", cx-5, cy-h-3);
                } else if (zoneData[key].crime) {
                    ctx.fillStyle = "#8e44ad"; ctx.fillRect(cx-6, cy-h-12, 12, 12);
                    ctx.fillStyle = "#fff"; ctx.font = "9px sans-serif"; ctx.fillText("🦹", cx-5, cy-h-3);
                } else if (!hasPower || !hasWater) {
                    ctx.fillStyle = "#34495e"; ctx.font = "bold 10px sans-serif";
                    ctx.fillText(!hasPower ? "⚡" : "💧", cx - 4, cy - h - 3);
                }
            }

            // 4. 3D Kek Elektrostacija (Industriāls dizains)
            if (type === 4) {
                ctx.fillStyle = "#4d5656"; ctx.fillRect(cx - 14, cy - 22, 28, 22);
                ctx.fillStyle = "#1c2833"; // Skursteņi
                ctx.fillRect(cx - 10, cy - 36, 5, 14); ctx.fillRect(cx + 5, cy - 36, 5, 14);
                ctx.fillStyle = "#00ffff"; ctx.fillRect(cx - 3, cy - 10, 6, 6);
            }

            // 5. 3D Ūdens Tornis
            if (type === 5) {
                ctx.strokeStyle = "#7f8c8d"; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - 18); ctx.stroke();
                ctx.fillStyle = "#2980b9"; ctx.beginPath(); ctx.arc(cx, cy - 22, 7, 0, Math.PI * 2); ctx.fill();
            }

            // 6. 3D Policijas Iecirknis (Zils korpuss ar bākuguni)
            if (type === 6) {
                ctx.fillStyle = "#1b4f72"; ctx.fillRect(cx - 12, cy - 24, 24, 24);
                ctx.fillStyle = "#fff"; ctx.fillRect(cx - 6, cy - 14, 12, 6); // Durvis
                // Mirgojoša bākuguns augšā
                ctx.fillStyle = (Math.floor(Date.now() / 300) % 2 === 0) ? "#3498db" : "#e74c3c";
                ctx.beginPath(); ctx.arc(cx, cy - 26, 3, 0, Math.PI * 2); ctx.fill();
            }

            // 7. 3D Ugunsdzēsēju Depo (Sarkana ēka ar vārtiem)
            if (type === 7) {
                ctx.fillStyle = "#78281f"; ctx.fillRect(cx - 12, cy - 20, 24, 20);
                ctx.fillStyle = "#c0392b"; ctx.fillRect(cx - 8, cy - 12, 7, 12); // Vārti 1
                ctx.fillStyle = "#c0392b"; ctx.fillRect(cx + 1, cy - 12, 7, 12); // Vārti 2
            }

            // Hover rāmis
            if (r === mouseGridY && c === mouseGridX) {
                ctx.fillStyle = currentTool === 'clear' ? "rgba(231,76,60,0.35)" : "rgba(255,255,255,0.35)";
                ctx.beginPath();
                ctx.moveTo(pos.x, pos.y); ctx.lineTo(pos.x + TILE_WIDTH/2, pos.y + TILE_HEIGHT/2);
                ctx.lineTo(pos.x, pos.y + TILE_HEIGHT); ctx.lineTo(pos.x - TILE_WIDTH/2, pos.y + TILE_HEIGHT/2);
                ctx.closePath(); ctx.fill();
            }
        }
    }

    // Minimap apakšā
    let mmSize = 4; let mmX = canvas.width - (COLS * mmSize) - 10; let mmY = canvas.height - (ROWS * mmSize) - 10;
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(mmX-4, mmY-4, (COLS*mmSize)+8, (ROWS*mmSize)+8);
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let t = world[r][c];
            ctx.fillStyle = t===1 ? "#666" : t===2 ? "#2ecc71" : t===3 ? "#3498db" : t===4 ? "#00ffff" : t===5 ? "#2980b9" : t===6 ? "#1b4f72" : t===7 ? "#78281f" : "#1e3a1e";
            ctx.fillRect(mmX + c * mmSize, mmY + r * mmSize, mmSize, mmSize);
        }
    }
}

// Peles pozīcijas noteikšana
canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    let mouseX = e.clientX - rect.left; let mouseY = e.clientY - rect.top;
    let isoPos = actualToIso(mouseX, mouseY);
    mouseGridX = isoPos.c; mouseGridY = isoPos.r;
    drawWorld();
});

canvas.addEventListener("mouseleave", () => { mouseGridX = -1; mouseGridY = -1; drawWorld(); });

// Klikšķis / būvniecība
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
                if (currentTool === 'water') world[mouseGridY][mouseGridX] = 5;
                if (currentTool === 'police') world[mouseGridY][mouseGridX] = 6;
                if (currentTool === 'fire') world[mouseGridY][mouseGridX] = 7;
            }
        }

        document.getElementById("money-display").innerText = money;
        updateCityServices();
        simulationStep();
    }
});

// Palaižam sistēmu
setInterval(simulationStep, 1000);
currentTool = 'road';
updateCityServices();
drawWorld();
