const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const COLS = 14, ROWS = 14;
const TILE_WIDTH = 54, TILE_HEIGHT = 27;
const ORIGIN_X = canvas.width / 2, ORIGIN_Y = 50;

let money = 3000, taxRate = 7, population = 0;
let world = Array(ROWS).fill().map(() => Array(COLS).fill(0)); // 0=zāle, 1=ceļš, 2=R, 3=C, 4=stacija
let hasPower = Array(ROWS).fill().map(() => Array(COLS).fill(false));
let zoneLevels = {}; // Glabā ēku augstumu
let cars = []; // Mašīnu saraksts
let currentTool = 'road';
let mouseX = -1, mouseY = -1;

function setTool(tool) {
    currentTool = tool;
    document.querySelectorAll(".controls button").forEach(b => b.classList.remove("active"));
    document.getElementById(`b-${tool}`).classList.add("active");
}

function changeTax(amt) {
    taxRate = Math.max(1, Math.min(15, taxRate + amt));
    document.getElementById("t-disp").innerText = taxRate;
}

function isoToXy(r, c) {
    return { x: ORIGIN_X + (c - r) * (TILE_WIDTH / 2), y: ORIGIN_Y + (c + r) * (TILE_HEIGHT / 2) };
}

// SIMULĀCIJA - Strādā automātiski fonā
function simulate() {
    // 1. Elektrības pārbaude (Plūst pa ceļiem un blakus esošām ēkām)
    hasPower = Array(ROWS).fill().map(() => Array(COLS).fill(false));
    let queue = [];
    for(let r=0; r<ROWS; r++) {
        for(let c=0; c<COLS; c++) { if(world[r][c] === 4) { hasPower[r][c] = true; queue.push({r,c}); } }
    }
    while(queue.length > 0) {
        let curr = queue.shift();
        let dirs = [{r:curr.r-1, c:curr.c}, {r:curr.r+1, c:curr.c}, {r:curr.r, c:curr.c-1}, {r:curr.r, c:curr.c+1}];
        for(let d of dirs) {
            if(d.r>=0 && d.r<ROWS && d.c>=0 && d.c<COLS && !hasPower[d.r][d.c] && world[d.r][d.c] !== 0) {
                hasPower[d.r][d.c] = true;
                if(world[d.r][d.c] === 1) queue.push({r:d.r, c:d.c}); // Pa ceļiem strāva iet tālāk
            }
        }
    }

    // 2. Ēku augšana un nodokļi
    let totalPop = 0, income = 0;
    let rDemand = 60 + (9 - taxRate) * 5;
    let cDemand = 40 + (9 - taxRate) * 4;

    for(let r=0; r<ROWS; r++) {
        for(let c=0; c<COLS; c++) {
            let type = world[r][c];
            let key = `${r},${c}`;
            
            if(type === 2 || type === 3) {
                if(!zoneLevels[key]) zoneLevels[key] = 0;
                
                // Ja ir elektrība un labs pieprasījums -> māja aug!
                let demand = (type === 2) ? rDemand : cDemand;
                if(hasPower[r][c] && zoneLevels[key] < 3 && demand > 30 && Math.random() > 0.5) {
                    zoneLevels[key]++;
                }
                
                // Saskaitām cilvēkus un nodokļus
                if(zoneLevels[key] > 0) {
                    if(type === 2) { totalPop += zoneLevels[key] * 50; income += zoneLevels[key] * taxRate * 2; }
                    if(type === 3) { income += zoneLevels[key] * taxRate * 4; }
                }
            }
        }
    }

    population = totalPop;
    money += income;

    // Atjaunojam UI tekstus
    document.getElementById("m-disp").innerText = money;
    document.getElementById("p-disp").innerText = population;
    document.getElementById("i-disp").innerText = (income >= 0 ? "+" : "") + income;
    document.getElementById("br").style.height = Math.max(5, rDemand) + "%";
    document.getElementById("bc").style.height = Math.max(5, cDemand) + "%";

    // Kustina mašīnītes pa ceļiem
    if(Math.random() > 0.5 && cars.length < 10) {
        for(let r=0; r<ROWS; r++) {
            for(let c=0; c<COLS; c++) {
                if(world[r][c] === 1 && cars.length < 10 && Math.random() > 0.9) cars.push({r, c});
            }
        }
    }
    for(let i=cars.length-1; i>=0; i--) {
        let car = cars[i];
        let options = [{r:car.r-1,c:car.c},{r:car.r+1,c:car.c},{r:car.r,c:car.c-1},{r:car.r,c:car.c+1}]
                      .filter(o => o.r>=0 && o.r<ROWS && o.c>=0 && o.c<COLS && world[o.r][o.c]===1);
        if(options.length > 0 && Math.random() > 0.3) {
            let next = options[Math.floor(Math.random()*options.length)];
            car.r = next.r; car.c = next.c;
        } else if (Math.random() > 0.8) { cars.splice(i, 1); }
    }

    draw();
}

// ZĪMĒŠANA (Grafika)
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for(let r=0; r<ROWS; r++) {
        for(let c=0; c<COLS; c++) {
            let pos = isoToXy(r, c);
            let type = world[r][c];
            let cx = pos.x, cy = pos.y + TILE_HEIGHT/2;

            // Zīmē zemi (rombu)
            ctx.fillStyle = (r + c) % 2 === 0 ? "#273d27" : "#2e472e";
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y); ctx.lineTo(pos.x + TILE_WIDTH/2, pos.y + TILE_HEIGHT/2);
            ctx.lineTo(pos.x, pos.y + TILE_HEIGHT); ctx.lineTo(pos.x - TILE_WIDTH/2, pos.y + TILE_HEIGHT/2);
            ctx.closePath(); ctx.fill();

            // Zīmē ceļu
            if(type === 1) {
                ctx.fillStyle = "#444"; ctx.beginPath();
                ctx.moveTo(pos.x, pos.y); ctx.lineTo(pos.x + TILE_WIDTH/2, pos.y + TILE_HEIGHT/2);
                ctx.lineTo(pos.x, pos.y + TILE_HEIGHT); ctx.lineTo(pos.x - TILE_WIDTH/2, pos.y + TILE_HEIGHT/2);
                ctx.closePath(); ctx.fill();
            }

            // Zīmē mājas / veikalus (3D kluči)
            let lvl = zoneLevels[`${r},${c}`] || 0;
            if((type === 2 || type === 3) && lvl > 0) {
                let h = lvl * 20; // Augstums atkarīgs no līmeņa
                let sideColor = type === 2 ? "#5c4033" : "#1f3a52";
                let frontColor = type === 2 ? "#73503f" : "#2b4f6e";
                let roofColor = type === 2 ? "#2ecc71" : "#3498db";

                // Kreisā siena
                ctx.fillStyle = sideColor; ctx.beginPath();
                ctx.moveTo(cx - TILE_WIDTH/2+2, cy); ctx.lineTo(cx, cy + TILE_HEIGHT/2-1);
                ctx.lineTo(cx, cy + TILE_HEIGHT/2-1 - h); ctx.lineTo(cx - TILE_WIDTH/2+2, cy - h);
                ctx.closePath(); ctx.fill();

                // Labā siena
                ctx.fillStyle = frontColor; ctx.beginPath();
                ctx.moveTo(cx, cy + TILE_HEIGHT/2-1); ctx.lineTo(cx + TILE_WIDTH/2-2, cy);
                ctx.lineTo(cx + TILE_WIDTH/2-2, cy - h); ctx.lineTo(cx, cy + TILE_HEIGHT/2-1 - h);
                ctx.closePath(); ctx.fill();

                // Jumts
                ctx.fillStyle = roofColor; ctx.beginPath();
                ctx.moveTo(cx, cy - h); ctx.lineTo(cx + TILE_WIDTH/2-2, cy - h);
                ctx.lineTo(cx, cy + TILE_HEIGHT/2-1 - h); ctx.lineTo(cx - TILE_WIDTH/2+2, cy - h);
                ctx.closePath(); ctx.fill();
                
                // Zibens zīme, ja nav strāvas
                if(!hasPower[r][c]) { ctx.fillStyle = "#f1c40f"; ctx.font = "10px sans-serif"; ctx.fillText("⚡", cx-4, cy-h-3); }
            }

            // Elektrostacija
            if(type === 4) {
                ctx.fillStyle = "#7f8c8d"; ctx.fillRect(cx - 12, cy - 20, 24, 20);
                ctx.fillStyle = "#333"; ctx.fillRect(cx - 8, cy - 32, 5, 12); // Skurstenis
            }
        }
    }

    // Uzzīmē mašīnas
    cars.forEach(car => {
        let pos = isoToXy(car.r, car.c);
        ctx.fillStyle = "#f1c40f"; // Dzeltenas mašīnītes
        ctx.fillRect(pos.x - 3, pos.y + TILE_HEIGHT/2 - 2, 6, 4);
    });
}

// PELES KLIKŠĶI (Būvēšana)
canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    let dx = (e.clientX - rect.left) - ORIGIN_X, dy = (e.clientY - rect.top) - ORIGIN_Y;
    let c = Math.floor((dy / (TILE_HEIGHT / 2) + dx / (TILE_WIDTH / 2)) / 2);
    let r = Math.floor((dy / (TILE_HEIGHT / 2) - dx / (TILE_WIDTH / 2)) / 2);

    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
        let costs = { 'road': 10, 'zoneR': 50, 'zoneC': 60, 'power': 400, 'clear': 0 };
        if (currentTool === 'clear') {
            world[r][c] = 0; delete zoneLevels[`${r},${c}`];
        } else if (world[r][c] === 0 && money >= costs[currentTool]) {
            money -= costs[currentTool];
            if (currentTool === 'road') world[r][r=r,c] = 1;
            if (currentTool === 'zoneR') world[r][c] = 2;
            if (currentTool === 'zoneC') world[r][c] = 3;
            if (currentTool === 'power') world[r][c] = 4;
        }
        document.getElementById("m-disp").innerText = money;
        simulate();
    }
});

// Palaišana
setInterval(simulate, 2000); // Ik pēc 2 sekundēm notiek simulācijas solis
simulate();
