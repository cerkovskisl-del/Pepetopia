const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const COLS = 14, ROWS = 14;
const TILE_WIDTH = 54, TILE_HEIGHT = 27;
const ORIGIN_X = canvas.width / 2, ORIGIN_Y = 60;

let money = 3000, taxRate = 7, population = 0;
let world = Array(ROWS).fill().map(() => Array(COLS).fill(0)); 
let hasPower = Array(ROWS).fill().map(() => Array(COLS).fill(false));
let zoneLevels = {}; 
let cars = []; 
let currentTool = 'road';

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

// SIMULATION ENGINE
function simulate() {
    // 1. Power Grid Grid Calculation (Flows through roads and buildings)
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
                if(world[d.r][d.c] === 1) queue.push({r:d.r, c:d.c}); 
            }
        }
    }

    // 2. RCI Growth & Financials
    let totalPop = 0, income = 0;
    let rDemand = 60 + (8 - taxRate) * 6;
    let cDemand = 40 + (8 - taxRate) * 5;

    for(let r=0; r<ROWS; r++) {
        for(let c=0; c<COLS; c++) {
            let type = world[r][c];
            let key = `${r},${c}`;
            
            if(type === 2 || type === 3) {
                if(!zoneLevels[key]) zoneLevels[key] = 0;
                
                let demand = (type === 2) ? rDemand : cDemand;
                if(hasPower[r][c] && zoneLevels[key] < 3 && demand > 25 && Math.random() > 0.4) {
                    zoneLevels[key]++;
                }
                
                if(zoneLevels[key] > 0) {
                    if(type === 2) { totalPop += zoneLevels[key] * 40; income += zoneLevels[key] * taxRate * 2; }
                    if(type === 3) { income += zoneLevels[key] * taxRate * 4; }
                }
            }
        }
    }

    population = totalPop;
    money += income;

    // Update UI elements
    document.getElementById("m-disp").innerText = money;
    document.getElementById("p-disp").innerText = population;
    document.getElementById("i-disp").innerText = (income >= 0 ? "+" : "") + income;
    document.getElementById("br").style.height = Math.max(5, Math.min(100, rDemand)) + "%";
    document.getElementById("bc").style.height = Math.max(5, Math.min(100, cDemand)) + "%";

    // Traffic updates
    if(Math.random() > 0.4 && cars.length < 12) {
        for(let r=0; r<ROWS; r++) {
            for(let c=0; c<COLS; c++) {
                if(world[r][c] === 1 && cars.length < 12 && Math.random() > 0.92) cars.push({r, c});
            }
        }
    }
    for(let i=cars.length-1; i>=0; i--) {
        let car = cars[i];
        let options = [{r:car.r-1,c:car.c},{r:car.r+1,c:car.c},{r:car.r,c:car.c-1},{r:car.r,c:car.c+1}]
                      .filter(o => o.r>=0 && o.r<ROWS && o.c>=0 && o.c<COLS && world[o.r][o.c]===1);
        if(options.length > 0 && Math.random() > 0.2) {
            let next = options[Math.floor(Math.random()*options.length)];
            car.r = next.r; car.c = next.c;
        } else if (Math.random() > 0.7) { cars.splice(i, 1); }
    }

    draw();
}

// RENDERING ENGINE (Beautiful isometric views)
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for(let r=0; r<ROWS; r++) {
        for(let c=0; c<COLS; c++) {
            let pos = isoToXy(r, c);
            let type = world[r][c];
            let cx = pos.x, cy = pos.y + TILE_HEIGHT/2;

            // Draw Terrain (Grid/Grass effect)
            ctx.fillStyle = (r + c) % 2 === 0 ? "#3c533c" : "#435d43";
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y); ctx.lineTo(pos.x + TILE_WIDTH/2, pos.y + TILE_HEIGHT/2);
            ctx.lineTo(pos.x, pos.y + TILE_HEIGHT); ctx.lineTo(pos.x - TILE_WIDTH/2, pos.y + TILE_HEIGHT/2);
            ctx.closePath(); ctx.fill();

            // Draw Road (Asphalt with bright borders)
            if(type === 1) {
                ctx.fillStyle = "#2b2b2b"; ctx.beginPath();
                ctx.moveTo(pos.x, pos.y); ctx.lineTo(pos.x + TILE_WIDTH/2, pos.y + TILE_HEIGHT/2);
                ctx.lineTo(pos.x, pos.y + TILE_HEIGHT); ctx.lineTo(pos.x - TILE_WIDTH/2, pos.y + TILE_HEIGHT/2);
                ctx.closePath(); ctx.fill();
                ctx.strokeStyle = "#3a3a3a"; ctx.lineWidth = 1; ctx.stroke();
            }

            // Draw Buildings (Isometric Pseudo-3D Blocks)
            let lvl = zoneLevels[`${r},${c}`] || 0;
            if((type === 2 || type === 3) && lvl > 0) {
                let h = lvl * 24; 
                
                // Color Palettes
                let sideColor = type === 2 ? "#5a4a42" : "#22313f";
                let frontColor = type === 2 ? "#705c52" : "#2c3e50";
                let roofColor = type === 2 ? "#4caf50" : "#3498db";

                // Left Wall Shadow
                ctx.fillStyle = sideColor; ctx.beginPath();
                ctx.moveTo(cx - TILE_WIDTH/2+2, cy); ctx.lineTo(cx, cy + TILE_HEIGHT/2-1);
                ctx.lineTo(cx, cy + TILE_HEIGHT/2-1 - h); ctx.lineTo(cx - TILE_WIDTH/2+2, cy - h);
                ctx.closePath(); ctx.fill();

                // Right Wall Front
                ctx.fillStyle = frontColor; ctx.beginPath();
                ctx.moveTo(cx, cy + TILE_HEIGHT/2-1); ctx.lineTo(cx + TILE_WIDTH/2-2, cy);
                ctx.lineTo(cx + TILE_WIDTH/2-2, cy - h); ctx.lineTo(cx, cy + TILE_HEIGHT/2-1 - h);
                ctx.closePath(); ctx.fill();

                // Bright Roof
                ctx.fillStyle = roofColor; ctx.beginPath();
                ctx.moveTo(cx, cy - h); ctx.lineTo(cx + TILE_WIDTH/2-2, cy - h);
                ctx.lineTo(cx, cy + TILE_HEIGHT/2-1 - h); ctx.lineTo(cx - TILE_WIDTH/2+2, cy - h);
                ctx.closePath(); ctx.fill();
                
                // Retro Windows detailing
                ctx.fillStyle = "#f1c40f";
                if(lvl >= 2) ctx.fillRect(cx + 4, cy - h + 6, 3, 5);
                if(lvl === 3) ctx.fillRect(cx - 8, cy - h + 15, 3, 5);

                // Disconnected flashing alert
                if(!hasPower[r][c]) { 
                    ctx.fillStyle = "#e74c3c"; ctx.font = "bold 12px Courier"; 
                    ctx.fillText("⚡", cx-4, cy-h-4); 
                }
            }

            // Industrial Power Plant
            if(type === 4) {
                ctx.fillStyle = "#7f8c8d"; ctx.fillRect(cx - 12, cy - 20, 24, 20);
                ctx.fillStyle = "#95a5a6"; ctx.fillRect(cx - 10, cy - 20, 8, 20);
                ctx.fillStyle = "#333333"; ctx.fillRect(cx - 8, cy - 34, 5, 14); // Stack
                ctx.fillStyle = "#d35400"; ctx.fillRect(cx - 7, cy - 37, 3, 3);  // Fire glow
            }
        }
    }

    // Render Simulated Traffic (Tiny red & yellow vintage cars)
    cars.forEach((car, index) => {
        let pos = isoToXy(car.r, car.c);
        ctx.fillStyle = index % 2 === 0 ? "#e74c3c" : "#f1c40f"; 
        ctx.fillRect(pos.x - 3, pos.y + TILE_HEIGHT/2 - 2, 6, 4);
    });
}

// CANVAS INTERACTION
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
            if (currentTool === 'road') world[r][c] = 1;
            if (currentTool === 'zoneR') world[r][c] = 2;
            if (currentTool === 'zoneC') world[r][c] = 3;
            if (currentTool === 'power') world[r][c] = 4;
        }
        document.getElementById("m-disp").innerText = money;
        simulate();
    }
});

// START LOOP
setInterval(simulate, 2000); 
simulate();
