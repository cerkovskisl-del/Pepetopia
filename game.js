const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const TILE_SIZE = 40; // Katra lauciņa izmērs pikseļos
const COLS = 15;
const ROWS = 15;

// Spēles resursi
let money = 1000;
let income = 0;

// Elementu cenas
const COSTS = { 'road': 10, 'house': 100, 'power': 400, 'clear': 0 };

// 0 = Zāle, 1 = Ceļš, 2 = Māja, 3 = Elektrostacija
let world = Array(ROWS).fill().map(() => Array(COLS).fill(0));
// Masīvs, kurā glabāsim informāciju, kuriem lauciņiem ir elektrība (true/false)
let powerGrid = Array(ROWS).fill().map(() => Array(COLS).fill(false));

let currentTool = 'road';

// Krāsu palete
const COLORS = {
    0: "#557a2b", // Zāle (Zaļš)
    1: "#7f8c8d", // Ceļš (Pelēks)
    2: "#d35400", // Māja bez elektrības (Tumši oranža)
    3: "#f1c40f"  // Elektrostacija (Spilgti dzeltena)
};

function setTool(tool) {
    currentTool = tool;
    document.querySelectorAll(".controls button").forEach(btn => btn.classList.remove("active"));
    document.getElementById(`btn-${tool}`).classList.add("active");
}

// Algoritms, kas pārbauda elektrības plūsmu (Breadth-First Search)
function updatePowerGrid() {
    // Sākumā visur izslēdzam elektrību
    powerGrid = Array(ROWS).fill().map(() => Array(COLS).fill(false));
    
    let queue = [];

    // Atrodam visas elektrostacijas un ieliekam tās rindā kā sākumpunktus
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (world[r][c] === 3) {
                powerGrid[r][c] = true;
                queue.push({r: r, c: c});
            }
        }
    }

    // Kamēr rindā ir objekti, pārbaudām to kaimiņus (augšā, apakšā, pa kreisi, pa labi)
    while (queue.length > 0) {
        let current = queue.shift();
        let neighbors = [
            {r: current.r - 1, c: current.c}, // Augšā
            {r: current.r + 1, c: current.c}, // Apakšā
            {r: current.r, c: current.c - 1}, // Pa kreisi
            {r: current.r, c: current.c + 1}  // Pa labi
        ];

        for (let n of neighbors) {
            // Pārbaudām vai kaimiņš ir kartes robežās
            if (n.r >= 0 && n.r < ROWS && n.c >= 0 && n.c < COLS) {
                // Ja kaimiņš ir ceļš vai māja, un tam vēl nav elektrības
                if (!powerGrid[n.r][n.c] && (world[n.r][n.c] === 1 || world[n.r][n.c] === 2)) {
                    powerGrid[n.r][n.c] = true;
                    // Ja tas ir ceļš, elektrība var plūst tālāk caur to
                    if (world[n.r][n.c] === 1) {
                        queue.push({r: n.r, c: n.c});
                    }
                }
            }
        }
    }
}

// Aprēķina iksekundes ienākumus
function calculateIncome() {
    let tempIncome = 0;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            // Ja tā ir māja un tai ir elektrība, tā dod 20$ sekundē
            if (world[r][c] === 2 && powerGrid[r][c]) {
                tempIncome += 20;
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
            
            // Pamata krāsa
            ctx.fillStyle = COLORS[tileType];
            ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);

            // Īpašs vizuālais noformējums mājām
            if (tileType === 2) {
                if (powerGrid[r][c]) {
                    // Ja mājai ir elektrība, uzzīmējam dzeltenus logus (tā spīd)
                    ctx.fillStyle = "#f39c12"; 
                    ctx.fillRect(c * TILE_SIZE + 5, r * TILE_SIZE + 5, 10, 10);
                    ctx.fillRect(c * TILE_SIZE + 25, r * TILE_SIZE + 5, 10, 10);
                } else {
                    // Ja nav elektrības, logi ir tumši
                    ctx.fillStyle = "#7e3d11";
                    ctx.fillRect(c * TILE_SIZE + 5, r * TILE_SIZE + 5, 10, 10);
                    ctx.fillRect(c * TILE_SIZE + 25, r * TILE_SIZE + 5, 10, 10);
                }
            }

            // Ja ceļam ir elektrība, uzzīmējam tam pa vidu mazas dzeltenas līnijas (kā vadus)
            if (tileType === 1 && powerGrid[r][c]) {
                ctx.fillStyle = "#f1c40f";
                ctx.fillRect(c * TILE_SIZE + 18, r * TILE_SIZE + 18, 4, 4);
            }

            // Režģa līnijas
            ctx.strokeStyle = "#34495e";
            ctx.lineWidth = 0.5;
            ctx.strokeRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
    }
}

// Klikšķa apstrāde
canvas.addEventListener("click", function(event) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const clickedCol = Math.floor(mouseX / TILE_SIZE);
    const clickedRow = Math.floor(mouseY / TILE_SIZE);

    if (clickedCol >= 0 && clickedCol < COLS && clickedRow >= 0 && clickedRow < ROWS) {
        let cost = COSTS[currentTool];

        if (currentTool === 'clear') {
            world[clickedRow][clickedCol] = 0; // Nojauc
        } else {
            // Pārbauda vai ir pietiekami daudz naudas un vieta ir tukša (zāle)
            if (money >= cost && world[clickedRow][clickedCol] === 0) {
                money -= cost;
                document.getElementById("money-display").innerText = money;
                
                if (currentTool === 'road') world[clickedRow][clickedCol] = 1;
                if (currentTool === 'house') world[clickedRow][clickedCol] = 2;
                if (currentTool === 'power') world[clickedRow][clickedCol] = 3;
            }
        }

        // Pēc katra būvējuma pārrēķinām tīklu un pārzīmējam
        updatePowerGrid();
        calculateIncome();
        drawWorld();
    }
});

// Spēles ekonomikas cikls (Izpildās reizi sekundē)
setInterval(function() {
    money += income;
    document.getElementById("money-display").innerText = money;
}, 1000);

// Sākuma palaišana
updatePowerGrid();
drawWorld();
