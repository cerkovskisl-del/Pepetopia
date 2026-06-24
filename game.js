const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const TILE_SIZE = 40; 
const COLS = 16; // Palielināts laukums (16x16)
const ROWS = 16;

let money = 1000;
let income = 0;

const COSTS = { 'road': 10, 'house': 100, 'power': 400, 'clear': 0 };

// 0 = Zāle, 1 = Taka, 2 = Būda, 3 = Kek Stacija
let world = Array(ROWS).fill().map(() => Array(COLS).fill(0));
let powerGrid = Array(ROWS).fill().map(() => Array(COLS).fill(false));

// Saglabāsim papildus datus mājām (līmeņi un pieredze)
let houseData = {}; 

// Peles pozīcijas izsekošana priekš Hover efekta
let mouseGridX = -1;
let mouseGridY = -1;

const COLORS = {
    0: "#2d541e", // Zāle
    1: "#3e3e3e", // Taka fons
    2: "#5c2824", // Būda (Lvl 1)
    3: "#00aeff"  // Kek Stacija
};

function setTool(tool) {
    currentTool = tool;
    document.querySelectorAll(".controls button").forEach(btn => btn.classList.remove("active"));
    document.getElementById(`btn-${tool}`).classList.add("active");
}

// Strāvas meklēšanas algoritms
function updatePowerGrid() {
    powerGrid = Array(ROWS).fill().map(() => Array(COLS).fill(false));
    let queue = [];

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (world[r][c] === 3) {
                powerGrid[r][c] = true;
                queue.push({r: r, c: c});
            }
        }
    }

    while (queue.length > 0) {
        let current = queue.shift();
        let neighbors = [
            {r: current.r - 1, c: current.c},
            {r: current.r + 1, c: current.c},
            {r: current.r, c: current.c - 1},
            {r: current.r, c: current.c + 1}
        ];

        for (let n of neighbors) {
            if (n.r >= 0 && n.r < ROWS && n.c >= 0 && n.c < COLS) {
                if (!powerGrid[n.r][n.c] && (world[n.r][n.c] === 1 || world[n.r][n.c] === 2)) {
                    powerGrid[n.r][n.c] = true;
                    if (world[n.r][n.c] === 1) {
                        queue.push({r: n.r, c: n.c});
                    }
                }
            }
        }
    }
}

// Aprēķina ienākumus, ņemot vērā mājas līmeni
function calculateIncome() {
    let tempIncome = 0;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (world[r][c] === 2 && powerGrid[r][c]) {
                let key = `${r},${c}`;
                let lvl = houseData[key] ? houseData[key].lvl : 1;
                // Lvl 1 = 20$, Lvl 2 = 60$, Lvl 3 = 180$
                tempIncome += lvl === 1 ? 20 : lvl === 2 ? 60 : 180; 
            }
        }
    }
    income = tempIncome;
    document.getElementById("income-display").innerText = income;
}

// Galvenā zīmēšanas funkcija
function drawWorld() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let tileType = world[r][c];
            let hasPower = powerGrid[r][c];
            
            // 1. Zīmējam pamata flīzi
            ctx.fillStyle = COLORS[tileType];
            
            // Ja māja ir uzlabota, mainām tās krāsu uz krutāku
            if (tileType === 2) {
                let key = `${r},${c}`;
                let lvl = houseData[key] ? houseData[key].lvl : 1;
                if (lvl === 2) ctx.fillStyle = "#884ea4"; // Violeta māja (Lvl 2)
                if (lvl === 3) ctx.fillStyle = "#d35400"; // Zelta/Oranža māja (Lvl 3)
            }
            ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);

            // 2. Takas loģika (Savienojumu zīmēšana)
            if (tileType === 1) {
                ctx.lineWidth = 4;
                // Vada krāsa - neona zila, ja ir strāva, tumša ja nav
                ctx.strokeStyle = hasPower ? "#00ffff" : "#444444"; 
                
                let centerX = c * TILE_SIZE + TILE_SIZE / 2;
                let centerY = r * TILE_SIZE + TILE_SIZE / 2;

                // Pārbaudām kaimiņus, lai vilktu vadu līnijas
                let checkNeighbors = [
                    {r: r - 1, c: c, dX: 0, dY: -TILE_SIZE/2}, // Augšā
                    {r: r + 1, c: c, dX: 0, dY: TILE_SIZE/2},  // Apakšā
                    {r: r, c: c - 1, dX: -TILE_SIZE/2, dY: 0}, // Pa kreisi
                    {r: r, c: c + 1, dX: TILE_SIZE/2, dY: 0}   // Pa labi
                ];

                let hasAnyConnection = false;

                for (let n of checkNeighbors) {
                    if (n.r >= 0 && n.r < ROWS && n.c >= 0 && n.c < COLS) {
                        let targetType = world[n.r][n.c];
                        // Savienojamies ar citiem ceļiem, mājām vai stacijām
                        if (targetType === 1 || targetType === 2 || targetType === 3) {
                            ctx.beginPath();
                            ctx.moveTo(centerX, centerY);
                            ctx.lineTo(centerX + n.dX, centerY + n.dY);
                            ctx.stroke();
                            hasAnyConnection = true;
                        }
                    }
                }

                // Ja ceļš ir viens pats, uzzīmējam mazu punktu centrā
                if (!hasAnyConnection) {
                    ctx.fillStyle = hasPower ? "#00ffff" : "#444444";
                    ctx.fillRect(centerX - 3, centerY - 3, 6, 6);
                }
            }

            // 3. Pepes Būdas Sejas loģika
            if (tileType === 2) {
                let key = `${r},${c}`;
                let lvl = houseData[key] ? houseData[key].lvl : 1;

                if (hasPower) {
                    // Feels Good - Zaļas acis
                    ctx.fillStyle = "#2ecc71";
                    ctx.fillRect(c * TILE_SIZE + 6, r * TILE_SIZE + 10, 10, 8);
                    ctx.fillRect(c * TILE_SIZE + 24, r * TILE_SIZE + 10, 10, 8);
                    ctx.fillStyle = "#000"; // Zīlītes
                    ctx.fillRect(c * TILE_SIZE + 10, r * TILE_SIZE + 12, 4, 4);
                    ctx.fillRect(c * TILE_SIZE + 28, r * TILE_SIZE + 12, 4, 4);
                    
                    // Smaidīga mute Lvl 2 un 3 mājām
                    if (lvl >= 2) {
                        ctx.strokeStyle = "#fff";
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.arc(c * TILE_SIZE + 20, r * TILE_SIZE + 24, 6, 0, Math.PI);
                        ctx.stroke();
                    }
                    // Kronis Giga-Pepe Lvl 3 mājām
                    if (lvl === 3) {
                        ctx.fillStyle = "#f1c40f";
                        ctx.beginPath();
                        ctx.moveTo(c * TILE_SIZE + 10, r * TILE_SIZE + 6);
                        ctx.lineTo(c * TILE_SIZE + 15, r * TILE_SIZE + 2);
                        ctx.lineTo(c * TILE_SIZE + 20, r * TILE_SIZE + 6);
                        ctx.lineTo(c * TILE_SIZE + 25, r * TILE_SIZE + 2);
                        ctx.lineTo(c * TILE_SIZE + 30, r * TILE_SIZE + 6);
                        ctx.lineTo(c * TILE_SIZE + 30, r * TILE_SIZE + 9);
                        ctx.lineTo(c * TILE_SIZE + 10, r * TILE_SIZE + 9);
                        ctx.closePath();
                        ctx.fill();
                    }

                } else {
                    // Feels Bad - Sarkanas, bēdīgas acis
                    ctx.fillStyle = "#e74c3c";
                    ctx.fillRect(c * TILE_SIZE + 6, r * TILE_SIZE + 14, 10, 6);
                    ctx.fillRect(c * TILE_SIZE + 24, r * TILE_SIZE + 14, 10, 6);
                }

                // Parādām līmeņa ciparu stūrī
                ctx.fillStyle = "rgba(255,255,255,0.7)";
                ctx.font = "10px sans-serif";
                ctx.fillText(`Lvl ${lvl}`, c * TILE_SIZE + 4, r * TILE_SIZE + TILE_SIZE - 4);
            }

            // Režģa rāmis
            ctx.strokeStyle = "#1b331a";
            ctx.lineWidth = 1;
            ctx.strokeRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
    }

    // 4. HOVER EFEKTS (Zīmē ēnu tam, ko gatavojies būvēt)
    if (mouseGridX >= 0 && mouseGridX < COLS && mouseGridY >= 0 && mouseGridY < ROWS) {
        if (currentTool === 'clear') {
            ctx.fillStyle = "rgba(231, 76, 60, 0.4)"; // Sarkans nojaukšanai
        } else {
            ctx.fillStyle = "rgba(255, 255, 255, 0.3)"; // Balts būvēšanai
        }
        ctx.fillRect(mouseGridX * TILE_SIZE, mouseGridY * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
}

// Peles kustības uztveršana priekš Hover efekta
canvas.addEventListener("mousemove", function(event) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    mouseGridX = Math.floor(mouseX / TILE_SIZE);
    mouseGridY = Math.floor(mouseY / TILE_SIZE);

    drawWorld(); // Pārzīmējam katru reizi, kad peles pozīcija mainās
});

canvas.addEventListener("mouseleave", function() {
    mouseGridX = -1;
    mouseGridY = -1;
    drawWorld();
});

// Klikšķa / Būvēšanas loģika
canvas.addEventListener("click", function(event) {
    if (mouseGridX >= 0 && mouseGridX < COLS && mouseGridY >= 0 && mouseGridY < ROWS) {
        let cost = COSTS[currentTool];
        let currentTile = world[mouseGridY][mouseGridX];
        let key = `${mouseGridY},${mouseGridX}`;

        if (currentTool === 'clear') {
            if (currentTile !== 0) {
                // Atgriežam 50% naudas bāzes vērtības
                let refund = currentTile === 1 ? COSTS['road']/2 : currentTile === 2 ? COSTS['house']/2 : COSTS['power']/2;
                money += refund;
                
                world[mouseGridY][mouseGridX] = 0;
                delete houseData[key]; // Dzēšam mājas līmeņa datus
            }
        } else {
            if (money >= cost && currentTile === 0) {
                money -= cost;
                
                if (currentTool === 'road') world[mouseGridY][mouseGridX] = 1;
                if (currentTool === 'power') world[mouseGridY][mouseGridX] = 3;
                
                if (currentTool === 'house') {
                    world[mouseGridY][mouseGridX] = 2;
                    houseData[key] = { lvl: 1, xp: 0 }; // Inicializējam jaunu māju
                }
            }
        }

        document.getElementById("money-display").innerText = money;
        updatePowerGrid();
        calculateIncome();
        drawWorld();
    }
});

// Spēles tekošais laiks (Ekonomika un Upgrade sistēma ik sekundi)
setInterval(function() {
    // 1. Pieskaitām naudu
    money += income;
    document.getElementById("money-display").innerText = money;

    // 2. Māju pieredzes (XP) un Upgrade sistēma
    let gridChanged = false;
    for (let key in houseData) {
        let [r, c] = key.split(',').map(Number);
        
        // Tikai mājas ar elektrību krāj pieredzi
        if (world[r][c] === 2 && powerGrid[r][c]) {
            houseData[key].xp += 1;

            // Upgrade no Lvl 1 uz Lvl 2 pēc 10 sekundēm
            if (houseData[key].lvl === 1 && houseData[key].xp >= 10) {
                houseData[key].lvl = 2;
                gridChanged = true;
            }
            // Upgrade no Lvl 2 uz Lvl 3 pēc vēl 25 sekundēm
            else if (houseData[key].lvl === 2 && houseData[key].xp >= 35) {
                houseData[key].lvl = 3;
                gridChanged = true;
            }
        }
    }

    if (gridChanged) {
        calculateIncome(); // Ja kāda māja uzlabojās, mainās ienākumi
    }
    
    drawWorld();
}, 1000);

// Sākam spēli
currentTool = 'road';
updatePowerGrid();
drawWorld();
