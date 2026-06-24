const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Izometriskā režģa izmēri
const COLS = 16;
const ROWS = 16;
const TILE_WIDTH = 50;  // Romba platums
const TILE_HEIGHT = 25; // Romba augstums

// Kartes nobīde, lai tā būtu centrā
const ORIGIN_X = canvas.width / 2;
const ORIGIN_Y = 60;

let money = 1500;
let income = 0;
let population = 0;
let demandR = 90;
let demandC = 40;

const COSTS = { 'road': 10, 'zoneR': 50, 'zoneC': 60, 'power': 400, 'water': 250, 'clear': 0 };

// 0=Zāle, 1=Ceļš, 2=Dzīvojamā, 3=Komercija, 4=Kek Stacija, 5=Ūdens Tornis
let world = Array(ROWS).fill().map(() => Array(COLS).fill(0));
let powerGrid = Array(ROWS).fill().map(() => Array(COLS).fill(false));
let waterGrid = Array(ROWS).fill().map(() => Array(COLS).fill(false));
let zoneData = {};

let currentTool = 'road';
let mouseGridX = -1; let mouseGridY = -1;

function setTool(tool) {
    currentTool = tool;
    document.querySelectorAll(".controls button").forEach(btn => btn.classList.remove("active"));
    document.getElementById(`btn-${tool}`).classList.add("active");
}

// Funkcija, kas pārvērš parastās (r, c) koordinātas uz Izometriskajiem (x, y) pikseļiem
function isoToActual(r, c) {
    let x = ORIGIN_X + (c - r) * (TILE_WIDTH / 2);
    let y = ORIGIN_Y + (c + r) * (TILE_HEIGHT / 2);
    return { x: x, y: y };
}

// Funkcija, kas pārvērš peles klikšķi atpakaļ uz režģa (r, c) rindām
function actualToIso(mouseX, mouseY) {
    let dx = mouseX - ORIGIN_X;
    let dy = mouseY - ORIGIN_Y;
    let c = Math.floor((dy / (TILE_HEIGHT / 2) + dx / (TILE_WIDTH / 2)) / 2);
    let r = Math.floor((dy / (TILE_HEIGHT / 2) - dx / (TILE_WIDTH / 2)) / 2);
    return { r: r, c: c };
}

// Inženiertīklu aprēķini (BFS elektrībai un Ūdenim)
function updateInfrastructures() {
    powerGrid = Array(ROWS).fill().map(() => Array(COLS).fill(false));
    waterGrid = Array(ROWS).fill().map(() => Array(COLS).fill(false));
    
    let powerQueue = [];
    let waterQueue = [];

    // Atrodam stacijas un torņus
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (world[r][c] === 4) { powerGrid[r][c] = true; powerQueue.push({r:r, c:c}); }
            if (world[r][c] === 5) { waterGrid[r][c] = true; waterQueue.push({r:r, c:c, dist:0}); }
        }
    }

    // 1. Elektrības plūsma (tikai pa ceļiem)
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

    // 2. Ūdens plūsma (Torņi apgādā rādiusu līdz 5 lauciņiem uz jebkuru pusi)
    while (waterQueue.length > 0) {
        let curr = waterQueue.shift();
        if (curr.dist >= 5) continue; // Maksimālais spiediena attālums
        let neighbors = [{r:curr.r-1, c:curr.c}, {r:curr.r+1, c:curr.c}, {r:curr.r, c:curr.c-1}, {r:curr.r, c:curr.c+1}];
        for (let n of neighbors) {
            if (n.r >= 0 && n.r < ROWS && n.c >= 0 && n.c < COLS) {
                if (!waterGrid[n.r][n.c]) {
                    waterGrid[n.r][n.c] = true;
                    waterQueue.push({r:n.r, c:n.c, dist: curr.dist + 1});
                }
            }
        }
    }
}

// Galvenais SimCity simulācijas dzinējs
function simulationStep() {
    let currentR = 0; let currentC = 0;
    let tempPop = 0; let tempInc = 0;
    let totalZones = 0; let poweredZones = 0; let wateredZones = 0;

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let type = world[r][c];
            let hasPower = powerGrid[r][c];
            let hasWater = waterGrid[r][c];
            let key = `${r},${c}`;

            if (type === 2 || type === 3) {
                totalZones++;
                if (hasPower) poweredZones++;
                if (hasWater) wateredZones++;

                if (!zoneData[key]) zoneData[key] = { lvl: 0, progress: 0 };
                let data = zoneData[key];

                // Izaugsmes loģika
                if (hasPower) {
                    let demand = (type === 2) ? demandR : demandC;
                    // Bez ūdens nevar izaugt virs Lvl 1
                    let maxLvl = hasWater ? 3 : 1; 

                    if (data.lvl < maxLvl && demand > 15) {
                        data.progress += Math.random() * 25;
                        if (data.progress >= 100) { data.lvl++; data.progress = 0; }
                    } else if (data.lvl > maxLvl) {
                        data.lvl = maxLvl; // Sabrūk, ja atslēdz ūdeni
                    }
                } else {
                    if (data.lvl > 0 && Math.random() > 0.6) data.lvl--;
                }

                // Statistika
                if (data.lvl > 0) {
                    if (type === 2) {
                        currentR += data.lvl;
                        tempPop += data.lvl === 1 ? 15 : data.lvl === 2 ? 60 : 200;
                        tempInc += data.lvl * 6;
                    } else {
                        currentC += data.lvl;
                        tempInc += data.lvl === 1 ? 30 : data.lvl === 2 ? 100 : 350;
                    }
                }
            }
        }
    }

    population = tempPop;
    demandR = Math.max(5, Math.min(100, 95 - (population * 0.08) + (currentC * 12)));
    demandC = Math.max(5, Math.min(100, (population * 0.15) - (currentC * 10) + 20));
    
    money += tempInc; income = tempInc;

    // Procentuālie rādītāji pilsētai
    let powPct = totalZones > 0 ? Math.round((poweredZones/totalZones)*100) : 0;
    let watPct = totalZones > 0 ? Math.round((wateredZones/totalZones)*100) : 0;

    document.getElementById("money-display").innerText = money;
    document.getElementById("income-display").innerText = income;
    document.getElementById("pop-display").innerText = population;
    document.getElementById("power-pct").innerText = powPct;
    document.getElementById("water-pct").innerText = watPct;
    document.getElementById("r-demand").style.width = demandR + "%";
    document.getElementById("c-demand").style.width = demandC + "%";

    updateInfrastructures();
    drawWorld();
}

// IZOMETRISKAIS GRAFIKAS DZINĒJS
function drawWorld() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Zīmējam no aizmugures uz priekšu (Back-to-Front), lai 3D objekti pareizi pārklātos
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let type = world[r][c];
            let pos = isoToActual(r, c);
            let hasPower = powerGrid[r][c];
            let hasWater = waterGrid[r][c];
            let key = `${r},${c}`;

            // 1. ZĪMĒJAM IZOMETRISKO ZEMES ROMBU (Zāle)
            ctx.fillStyle = (r + c) % 2 === 0 ? "#2c4c1e" : "#325422"; // Šaha stila zāliens
            
            // Ja tā ir iezīmēta zona, mainām krāsu fonam
            if (type === 2) ctx.fillStyle = "rgba(46, 204, 113, 0.25)";
            if (type === 3) ctx.fillStyle = "rgba(52, 152, 219, 0.25)";

            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y); // Augša
            ctx.lineTo(pos.x + TILE_WIDTH/2, pos.y + TILE_HEIGHT/2); // Labais stūris
            ctx.lineTo(pos.x, pos.y + TILE_HEIGHT); // Apakša
            ctx.lineTo(pos.x - TILE_WIDTH/2, pos.y + TILE_HEIGHT/2); // Kreisais stūris
            ctx.closePath();
            ctx.fill();

            // Lauciņa robežlīnijas režģim
            ctx.strokeStyle = "rgba(20,40,20,0.4)";
            ctx.lineWidth = 1;
            ctx.stroke();

            // 2. CEĻŠ (Asfalta svītra izometrijā)
            if (type === 1) {
                ctx.fillStyle = "#444444";
                ctx.beginPath();
                ctx.moveTo(pos.x, pos.y); ctx.lineTo(pos.x + TILE_WIDTH/2, pos.y + TILE_HEIGHT/2);
                ctx.lineTo(pos.x, pos.y + TILE_HEIGHT); ctx.lineTo(pos.x - TILE_WIDTH/2, pos.y + TILE_HEIGHT/2);
                ctx.closePath(); ctx.fill();

                // Neona vadu tīkls ceļa vidū
                ctx.strokeStyle = hasPower ? "#00ffff" : "#666666";
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(pos.x, pos.y + TILE_HEIGHT/2); ctx.lineTo(pos.x + TILE_WIDTH/2, pos.y + TILE_HEIGHT/2);
                ctx.moveTo(pos.x, pos.y); ctx.lineTo(pos.x, pos.y + TILE_HEIGHT); ctx.stroke();
            }

            // 3. 3D ĒKAS UN STRUKTŪRAS (Zīmējam augstumu)
            let lvl = zoneData[key] ? zoneData[key].lvl : 0;

            if ((type === 2 || type === 3) && lvl > 0) {
                let h = lvl === 1 ? 15 : lvl === 2 ? 35 : 75; // Ēkas augstums pikseļos
                let cx = pos.x;
                let cy = pos.y + TILE_HEIGHT/2;

                // Krāsu izvēle sienām (R=Brūns/Zaļš, C=Zils/Pelēks)
                let sideColor = type === 2 ? "#5e4831" : "#245173";
                let frontColor = type === 2 ? "#785c3f" : "#2e6994";
                let roofColor = type === 2 ? "#27ae60" : "#e67e22";

                // Kreisā siena (Dziļums)
                ctx.fillStyle = sideColor;
                ctx.beginPath();
                ctx.moveTo(cx - TILE_WIDTH/2 + 4, cy);
                ctx.lineTo(cx, cy + TILE_HEIGHT/2 - 2);
                ctx.lineTo(cx, cy + TILE_HEIGHT/2 - 2 - h);
                ctx.lineTo(cx - TILE_WIDTH/2 + 4, cy - h);
                ctx.closePath(); ctx.fill();

                // Labā siena (Dziļums)
                ctx.fillStyle = frontColor;
                ctx.beginPath();
                ctx.moveTo(cx, cy + TILE_HEIGHT/2 - 2);
                ctx.lineTo(cx + TILE_WIDTH/2 - 4, cy);
                ctx.lineTo(cx + TILE_WIDTH/2 - 4, cy - h);
                ctx.lineTo(cx, cy + TILE_HEIGHT/2 - 2 - h);
                ctx.closePath(); ctx.fill();

                // Jumts (Izometriskais rombs augšā)
                ctx.fillStyle = roofColor;
                ctx.beginPath();
                ctx.moveTo(cx, cy - h);
                ctx.lineTo(cx + TILE_WIDTH/2 - 4, cy - h);
                ctx.lineTo(cx, cy + TILE_HEIGHT/2 - 2 - h);
                ctx.lineTo(cx - TILE_WIDTH/2 + 4, cy - h);
                ctx.closePath(); ctx.fill();

                // Spīdošie logi augstajiem debesskrāpjiem (Lvl 3)
                if (lvl === 3 && hasPower) {
                    ctx.fillStyle = "#f1c40f";
                    ctx.fillRect(cx + 6, cy - 50, 4, 6); ctx.fillRect(cx + 16, cy - 50, 4, 6);
                    ctx.fillRect(cx + 6, cy - 30, 4, 6); ctx.fillRect(cx + 16, cy - 30, 4, 6);
                }

                // Brīdinājumu zīmes (Zibens vai Ūdens lāsīte), ja trūkst resursu
                if (!hasPower || !hasWater) {
                    ctx.fillStyle = "#e74c3c"; ctx.font = "bold 10px sans-serif";
                    ctx.fillText(!hasPower ? "⚡" : "💧", cx - 5, cy - h - 5);
                }
            }

            // 4. 3D KEK ELEKTROSTACIJA (4)
            if (type === 4) {
                let cx = pos.x; let cy = pos.y + TILE_HEIGHT/2;
                ctx.fillStyle = "#566573"; // Korpuss
                ctx.fillRect(cx - 15, cy - 25, 30, 25);
                ctx.fillStyle = "#2c3e50"; // Skursteņi
                ctx.fillRect(cx - 10, cy - 40, 6, 15); ctx.fillRect(cx + 4, cy - 40, 6, 15);
                ctx.fillStyle = "#00ffff"; ctx.fillRect(cx - 4, cy - 12, 8, 8); // Kodols
            }

            // 5. 3D ŪDENS TORNIS (5)
            if (type === 5) {
                let cx = pos.x; let cy = pos.y + TILE_HEIGHT/2;
                ctx.strokeStyle = "#bdc3c7"; ctx.lineWidth = 3; // Kāja
                ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - 25); ctx.stroke();
                ctx.fillStyle = "#3498db"; // Zilā bāka augšā
                ctx.beginPath(); ctx.arc(cx, cy - 30, 8, 0, Math.PI * 2); ctx.fill();
            }

            // HOVER RĀMIS (Zīmē plānu baltu rombu virs lauciņa, kur stāv pele)
            if (r === mouseGridY && c === mouseGridX) {
                ctx.fillStyle = currentTool === 'clear' ? "rgba(231,76,60,0.3)" : "rgba(255,255,255,0.3)";
                ctx.beginPath();
                ctx.moveTo(pos.x, pos.y);
                ctx.lineTo(pos.x + TILE_WIDTH/2, pos.y + TILE_HEIGHT/2);
                ctx.lineTo(pos.x, pos.y + TILE_HEIGHT);
                ctx.lineTo(pos.x - TILE_WIDTH/2, pos.y + TILE_HEIGHT/2);
                ctx.closePath(); ctx.fill();
            }
        }
    }

    // MINI-MAP (Zīmējas apakšējā labajā stūrī reāllaikā)
    let mmSize = 4; // Katrs lauciņš ir 4x4 pikseļi minimapā
    let mmX = canvas.width - (COLS * mmSize) - 10;
    let mmY = canvas.height - (ROWS * mmSize) - 10;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(mmX-4, mmY-4, (COLS*mmSize)+8, (ROWS*mmSize)+8);
    
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let t = world[r][c];
            ctx.fillStyle = t===1 ? "#666" : t===2 ? "#2ecc71" : t===3 ? "#3498db" : t===4 ? "#00ffff" : t===5 ? "#e67e22" : "#1e3a1e";
            ctx.fillRect(mmX + c * mmSize, mmY + r * mmSize, mmSize, mmSize);
        }
    }
}

// Peles koordinātu kalkulācija Izometrijā
canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    let mouseX = e.clientX - rect.left;
    let mouseY = e.clientY - rect.top;
    
    let isoPos = actualToIso(mouseX, mouseY);
    mouseGridX = isoPos.c;
    mouseGridY = isoPos.r;
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
                if (currentTool === 'water') world[mouseGridY][mouseGridX] = 5;
            }
        }

        document.getElementById("money-display").innerText = money;
        updateInfrastructures();
        simulationStep();
    }
});

// Sākam spēles dzinēju
setInterval(simulationStep, 1000);
currentTool = 'road';
updateInfrastructures();
drawWorld();
