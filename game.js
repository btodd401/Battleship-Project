// Game Constants
const BOARD_SIZE = 10;
const SHIPS = [
    { name: 'Carrier', size: 5 },
    { name: 'Battleship', size: 4 },
    { name: 'Cruiser', size: 3 },
    { name: 'Submarine', size: 3 },
    { name: 'Destroyer', size: 2 }
];


// Game State
let gameState = {
    playerBoard: [],
    enemyBoard: [],
    playerShips: [],
    enemyShips: [],
    currentPhase: 'placement', // placement, playing, gameover
    currentTurn: 'player', // player, enemy
    selectedShip: null,
    shipOrientation: 'horizontal', // horizontal, vertical
    gameOver: false,
    winner: null,
    dragging: null, // ship being dragged to a new position during placement
    dragHover: null, // last hovered cell during a drag
    suppressNextClick: false, // skip the click event that fires right after a drag
    // AI targeting state
    aiTargetState: {
        huntMode: false,
        hits: [], // confirmed hits on the ship currently being hunted
        orientation: null, // 'horizontal' or 'vertical', once two hits line up
        targetQueue: [] // queue of cells to target in hunt mode
    }
};

// Initialize boards
function initializeBoard() {
    return Array(BOARD_SIZE).fill(null).map(() => 
        Array(BOARD_SIZE).fill(null).map(() => ({
            hasShip: false,
            shipName: null,
            isHit: false,
            isMiss: false,
            isSunk: false
        }))
    );
}

// Convert coordinate (e.g., "A1") to row, col indices
function coordinateToIndices(coord) {
    const col = coord.charCodeAt(0) - 65; // A=0, B=1, etc.
    const row = parseInt(coord.slice(1)) - 1; // 1=0, 2=1, etc.
    return { row, col };
}

// Convert row, col indices to coordinate string
function indicesToCoordinate(row, col) {
    const colLetter = String.fromCharCode(65 + col);
    const rowNum = row + 1;
    return `${colLetter}${rowNum}`;
}

// Check if ship placement is valid
function isValidPlacement(board, row, col, size, orientation) {
    if (orientation === 'horizontal') {
        if (col + size > BOARD_SIZE) return false;
        for (let i = 0; i < size; i++) {
            if (board[row][col + i].hasShip) return false;
        }
    } else {
        if (row + size > BOARD_SIZE) return false;
        for (let i = 0; i < size; i++) {
            if (board[row + i][col].hasShip) return false;
        }
    }
    return true;
}

// Place ship on board
function placeShip(board, row, col, size, orientation, shipName) {
    const positions = [];
    if (orientation === 'horizontal') {
        for (let i = 0; i < size; i++) {
            board[row][col + i].hasShip = true;
            board[row][col + i].shipName = shipName;
            positions.push({ row: row, col: col + i });
        }
    } else {
        for (let i = 0; i < size; i++) {
            board[row + i][col].hasShip = true;
            board[row + i][col].shipName = shipName;
            positions.push({ row: row + i, col: col });
        }
    }
    return positions;
}

// AI Ship Placement (Random)
function aiPlaceShips() {
    const board = initializeBoard();
    const ships = [];
    
    for (const ship of SHIPS) {
        let placed = false;
        let attempts = 0;
        
        while (!placed && attempts < 100) {
            const orientation = Math.random() > 0.5 ? 'horizontal' : 'vertical';
            const row = Math.floor(Math.random() * BOARD_SIZE);
            const col = Math.floor(Math.random() * BOARD_SIZE);
            
            if (isValidPlacement(board, row, col, ship.size, orientation)) {
                const positions = placeShip(board, row, col, ship.size, orientation, ship.name);
                ships.push({ name: ship.name, positions, hits: 0 });
                placed = true;
            }
            attempts++;
        }
    }
    
    return { board, ships };
}

// AI Firing Logic with Hunt Mode
function aiFire() {
    const aiState = gameState.aiTargetState;

    // Hunt mode: work through the queue of candidate cells, skipping any that
    // have already been fired at (the queue is kept fresh, but be defensive).
    if (aiState.huntMode) {
        if (aiState.targetQueue.length === 0) {
            aiState.targetQueue = getHuntTargets(aiState.hits);
        }
        while (aiState.targetQueue.length > 0) {
            const { row, col } = aiState.targetQueue.shift();
            const cell = gameState.playerBoard[row][col];
            if (!cell.isHit && !cell.isMiss) {
                return { row, col };
            }
        }
        // Nothing left to try around the known hits - give up the hunt.
        aiState.huntMode = false;
        aiState.hits = [];
        aiState.orientation = null;
    }

    // Random firing
    let row, col;
    let validShot = false;
    let attempts = 0;
    
    while (!validShot && attempts < 100) {
        row = Math.floor(Math.random() * BOARD_SIZE);
        col = Math.floor(Math.random() * BOARD_SIZE);
        
        const cell = gameState.playerBoard[row][col];
        if (!cell.isHit && !cell.isMiss) {
            validShot = true;
        }
        attempts++;
    }
    
    return { row, col };
}

// Given the confirmed hits on the ship being hunted, return the cells worth
// firing at next (only in-bounds cells that haven't been fired at yet).
function getHuntTargets(hits) {
    const inBounds = (r, c) => r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
    const isUntried = (r, c) => {
        const cell = gameState.playerBoard[r][c];
        return !cell.isHit && !cell.isMiss;
    };
    const isValid = (r, c) => inBounds(r, c) && isUntried(r, c);

    if (hits.length === 0) return [];

    // Only one hit so far: try the four cells around it (the user's "4
    // surrounding areas"), in random order.
    if (hits.length === 1) {
        const { row, col } = hits[0];
        const adjacent = [
            { row: row - 1, col },
            { row: row + 1, col },
            { row, col: col - 1 },
            { row, col: col + 1 }
        ].filter(p => isValid(p.row, p.col));
        adjacent.sort(() => Math.random() - 0.5);
        return adjacent;
    }

    // Two or more hits: the orientation is known, so only extend the line at
    // its two ends. Recomputing from all hits means that if one end misses we
    // automatically keep firing from the other end until the ship is sunk.
    const rows = hits.map(h => h.row);
    const cols = hits.map(h => h.col);
    const targets = [];

    if (rows.every(r => r === rows[0])) {
        const row = rows[0];
        const minCol = Math.min(...cols);
        const maxCol = Math.max(...cols);
        if (isValid(row, minCol - 1)) targets.push({ row, col: minCol - 1 });
        if (isValid(row, maxCol + 1)) targets.push({ row, col: maxCol + 1 });
    } else if (cols.every(c => c === cols[0])) {
        const col = cols[0];
        const minRow = Math.min(...rows);
        const maxRow = Math.max(...rows);
        if (isValid(minRow - 1, col)) targets.push({ row: minRow - 1, col });
        if (isValid(maxRow + 1, col)) targets.push({ row: maxRow + 1, col });
    }

    // Fallback: hits aren't collinear (e.g. two ships side by side) - probe the
    // untried neighbours of every known hit.
    if (targets.length === 0) {
        for (const { row, col } of hits) {
            const neighbours = [
                { row: row - 1, col }, { row: row + 1, col },
                { row, col: col - 1 }, { row, col: col + 1 }
            ];
            for (const p of neighbours) {
                if (isValid(p.row, p.col) && !targets.some(t => t.row === p.row && t.col === p.col)) {
                    targets.push(p);
                }
            }
        }
    }

    return targets;
}

// Update AI targeting state after a shot
function updateAITargeting(row, col, wasHit, shipSunk) {
    const aiState = gameState.aiTargetState;

    if (shipSunk) {
        // Ship sunk - clear the hunt and return to random firing.
        aiState.huntMode = false;
        aiState.hits = [];
        aiState.orientation = null;
        aiState.targetQueue = [];
        return;
    }

    if (wasHit) {
        // Record the hit and (re)enter hunt mode.
        aiState.huntMode = true;
        aiState.hits.push({ row, col });

        // Once we have two hits the ship's orientation is known.
        if (aiState.hits.length >= 2) {
            const rows = aiState.hits.map(h => h.row);
            aiState.orientation = rows.every(r => r === rows[0]) ? 'horizontal' : 'vertical';
        }

        // Recompute targets from every known hit so we always keep firing along
        // the ship's line until it's sunk.
        aiState.targetQueue = getHuntTargets(aiState.hits);
    } else if (aiState.huntMode) {
        // Missed while hunting - recompute the remaining candidates around the
        // known hits (this drops the missed cell and keeps the other end).
        aiState.targetQueue = getHuntTargets(aiState.hits);
        if (aiState.targetQueue.length === 0) {
            aiState.huntMode = false;
            aiState.hits = [];
            aiState.orientation = null;
        }
    }
}

// Process a shot
function processShot(board, ships, row, col, isPlayer) {
    const cell = board[row][col];
    let result = { hit: false, sunk: null, gameOver: false };
    
    if (cell.hasShip && !cell.isHit) {
        cell.isHit = true;
        result.hit = true;
        
        // Check if ship is sunk
        const ship = ships.find(s => 
            s.positions.some(p => p.row === row && p.col === col)
        );
        
        if (ship) {
            ship.hits++;
            if (ship.hits === ship.positions.length) {
                result.sunk = ship.name;
                // Mark all cells of sunk ship as sunk
                ship.positions.forEach(pos => {
                    board[pos.row][pos.col].isSunk = true;
                });
            }
        }
        
        // Check if all ships are sunk
        const allSunk = ships.every(s => s.hits === s.positions.length);
        if (allSunk) {
            result.gameOver = true;
            gameState.winner = isPlayer ? 'player' : 'enemy';
        }
    } else if (!cell.isHit && !cell.isMiss) {
        cell.isMiss = true;
    }
    
    return result;
}

// UI Functions
function renderBoard(boardElement, board, ships = [], isEnemy = false) {
    boardElement.innerHTML = '';
    
    // Add column labels (1-10) at top
    const emptyCorner = document.createElement('div');
    emptyCorner.className = 'label-cell corner';
    boardElement.appendChild(emptyCorner);
    
    for (let col = 0; col < BOARD_SIZE; col++) {
        const colLabel = document.createElement('div');
        colLabel.className = 'label-cell column';
        colLabel.textContent = col + 1;
        boardElement.appendChild(colLabel);
    }
    
    // Add rows with row labels and cells
    for (let row = 0; row < BOARD_SIZE; row++) {
        // Row label (A-J)
        const rowLabel = document.createElement('div');
        rowLabel.className = 'label-cell row';
        rowLabel.textContent = String.fromCharCode(65 + row);
        boardElement.appendChild(rowLabel);
        
        // Cells
        for (let col = 0; col < BOARD_SIZE; col++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.row = row;
            cell.dataset.col = col;
            
            const cellData = board[row][col];
            
            if (isEnemy) {
                // Enemy board: hide ships, show hits/misses
                if (cellData.isHit) {
                    cell.classList.add('hit');
                    if (cellData.isSunk) {
                        cell.classList.add('sunk');
                    }
                } else if (cellData.isMiss) {
                    cell.classList.add('miss');
                }
            } else {
                // Player board: show ships, hits, misses
                if (cellData.hasShip) {
                    cell.classList.add('ship');
                }
                if (cellData.isHit) {
                    cell.classList.add('hit');
                    if (cellData.isSunk) {
                        cell.classList.add('sunk');
                    }
                } else if (cellData.isMiss) {
                    cell.classList.add('miss');
                }
            }
            
            boardElement.appendChild(cell);
        }
    }

    renderShipOverlays(boardElement, ships, isEnemy);
}

// Build an inline SVG silhouette for a given ship, sized to span its cells.
// Coordinates are expressed along the ship's long axis (in cells, 0..size) and
// its cross axis (0..1), then projected to x/y based on orientation so the same
// shape works for both horizontal and vertical placement.
function buildShipSVG(name, size, orientation) {
    const U = 10;
    const L = size * U;
    const horiz = orientation === 'horizontal';
    const viewBox = horiz ? `0 0 ${L} ${U}` : `0 0 ${U} ${L}`;

    const P = (a, c) => horiz
        ? `${(a * U).toFixed(2)},${(c * U).toFixed(2)}`
        : `${(c * U).toFixed(2)},${(a * U).toFixed(2)}`;
    const stroke = 'stroke="#10151f" stroke-width="1" vector-effect="non-scaling-stroke" stroke-linejoin="round"';
    const poly = (pts, fill, extra = stroke) =>
        `<polygon points="${pts.map(p => P(p[0], p[1])).join(' ')}" fill="${fill}" ${extra}/>`;
    const rect = (a0, a1, c0, c1, fill, extra = stroke) =>
        poly([[a0, c0], [a1, c0], [a1, c1], [a0, c1]], fill, extra);
    const circ = (a, c, r, fill) => {
        const cx = horiz ? a * U : c * U;
        const cy = horiz ? c * U : a * U;
        return `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${(r * U).toFixed(2)}" fill="${fill}" ${stroke}/>`;
    };

    // Hull: flat stern at a=0, pointed bow at a=size.
    const hull = [
        [0.05, 0.24], [size - 0.55, 0.18], [size - 0.04, 0.5],
        [size - 0.55, 0.82], [0.05, 0.76]
    ];

    let shapes = '';
    if (name === 'Carrier') {
        shapes += poly(hull, '#475569');
        shapes += rect(0.2, size - 0.35, 0.3, 0.44, '#334155'); // flight deck
        for (let a = 0.6; a < size - 0.5; a += 0.85) {
            shapes += rect(a, a + 0.38, 0.36, 0.385, '#cbd5e1', ''); // runway dashes
        }
        shapes += rect(size - 1.15, size - 0.75, 0.1, 0.32, '#64748b'); // island
        shapes += rect(size - 1.0, size - 0.9, -0.02, 0.1, '#94a3b8', ''); // mast
    } else if (name === 'Submarine') {
        const body = [
            [0.28, 0.34], [size - 0.28, 0.34], [size - 0.04, 0.5],
            [size - 0.28, 0.66], [0.28, 0.66], [0.04, 0.5]
        ];
        shapes += poly(body, '#3f4753');
        shapes += rect(size * 0.42, size * 0.6, 0.14, 0.34, '#566072'); // conning tower
        shapes += rect(size * 0.49, size * 0.53, 0.0, 0.14, '#94a3b8', ''); // periscope
    } else {
        shapes += poly(hull, '#5b6573');
        shapes += rect(size * 0.4, size * 0.66, 0.1, 0.42, '#818c9e'); // superstructure
        shapes += rect(size * 0.5, size * 0.57, -0.02, 0.1, '#aab3c2', ''); // mast
        const turrets = Math.max(1, size - 2);
        const span = size - 1.2;
        for (let i = 0; i < turrets; i++) {
            const a = turrets === 1 ? size / 2 : 0.6 + (span * i) / (turrets - 1);
            shapes += circ(a, 0.5, 0.13, '#2f3744');
        }
    }

    return `<svg viewBox="${viewBox}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${shapes}</svg>`;
}

// Draw ship silhouettes on top of a board, aligned to the rendered cells.
// Enemy ships are only revealed once sunk (or when the game is over).
function renderShipOverlays(boardElement, ships, isEnemy) {
    const existing = boardElement.querySelector('.ship-overlay');
    if (existing) existing.remove();
    if (!ships || ships.length === 0) return;

    const overlay = document.createElement('div');
    overlay.className = 'ship-overlay';
    boardElement.appendChild(overlay);
    const overlayRect = overlay.getBoundingClientRect();

    ships.forEach(ship => {
        const sunk = ship.hits >= ship.positions.length;
        if (isEnemy && !sunk && !gameState.gameOver) return;

        const rows = ship.positions.map(p => p.row);
        const cols = ship.positions.map(p => p.col);
        const minRow = Math.min(...rows), maxRow = Math.max(...rows);
        const minCol = Math.min(...cols), maxCol = Math.max(...cols);
        const orientation = minRow === maxRow ? 'horizontal' : 'vertical';

        const firstCell = boardElement.querySelector(`.cell[data-row="${minRow}"][data-col="${minCol}"]`);
        const lastCell = boardElement.querySelector(`.cell[data-row="${maxRow}"][data-col="${maxCol}"]`);
        if (!firstCell || !lastCell) return;

        const r1 = firstCell.getBoundingClientRect();
        const r2 = lastCell.getBoundingClientRect();
        const left = Math.min(r1.left, r2.left) - overlayRect.left;
        const top = Math.min(r1.top, r2.top) - overlayRect.top;
        const width = Math.max(r1.right, r2.right) - Math.min(r1.left, r2.left);
        const height = Math.max(r1.bottom, r2.bottom) - Math.min(r1.top, r2.top);

        const sprite = document.createElement('div');
        sprite.className = 'ship-sprite' + (sunk ? ' sunk' : '');
        sprite.style.left = `${left}px`;
        sprite.style.top = `${top}px`;
        sprite.style.width = `${width}px`;
        sprite.style.height = `${height}px`;
        sprite.innerHTML = buildShipSVG(ship.name, ship.positions.length, orientation);
        overlay.appendChild(sprite);
    });
}

function renderShipsToPlace() {
    const container = document.getElementById('shipsToPlace');
    container.innerHTML = '';
    
    SHIPS.forEach((ship, index) => {
        const shipItem = document.createElement('div');
        shipItem.className = 'ship-item';
        shipItem.textContent = `${ship.name} (${ship.size})`;
        shipItem.dataset.index = index;
        
        if (gameState.playerShips.some(s => s.name === ship.name)) {
            shipItem.classList.add('placed');
        }
        
        if (gameState.selectedShip === index) {
            shipItem.classList.add('selected');
        }
        
        shipItem.addEventListener('click', () => selectShip(index));
        container.appendChild(shipItem);
    });
}

function selectShip(index) {
    // Prevent selecting a ship that's already placed
    const ship = SHIPS[index];
    if (gameState.playerShips.some(s => s.name === ship.name)) {
        updateStatus(`${ship.name} is already placed! Select a different ship.`);
        return;
    }
    
    gameState.selectedShip = index;
    renderShipsToPlace();
    clearPreview();
}function clearPreview() {
    const boardElement = document.getElementById('playerBoard');
    const cells = boardElement.querySelectorAll('.cell');
    cells.forEach(cell => {
        cell.classList.remove('preview', 'invalid');
    });
}
function showPreview(row, col) {
    if (gameState.selectedShip === null) return;
    
    const ship = SHIPS[gameState.selectedShip];
    const boardElement = document.getElementById('playerBoard');
    const cells = boardElement.querySelectorAll('.cell');
    
    const isValid = isValidPlacement(
        gameState.playerBoard, 
        row, col, 
        ship.size, 
        gameState.shipOrientation
    );
    
    // Grid: querySelectorAll('.cell') returns only the 100 game cells, not labels
    // Simple 10x10 grid indexing: row * 10 + col
    if (gameState.shipOrientation === 'horizontal') {
        for (let i = 0; i < ship.size; i++) {
            if (col + i < BOARD_SIZE) {
                const cellIndex = row * 10 + (col + i);
                if (cells[cellIndex]) {
                    cells[cellIndex].classList.add(isValid ? 'preview' : 'invalid');
                }
            }
        }
    } else {
        for (let i = 0; i < ship.size; i++) {
            if (row + i < BOARD_SIZE) {
                const cellIndex = (row + i) * 10 + col;
                if (cells[cellIndex]) {
                    cells[cellIndex].classList.add(isValid ? 'preview' : 'invalid');
                }
            }
        }
    }
}

// --- Ship drag-to-move helpers (placement phase) ---
function getShipOrientation(ship) {
    if (ship.positions.length < 2) return 'horizontal';
    return ship.positions[0].row === ship.positions[1].row ? 'horizontal' : 'vertical';
}

// Convert the cell under the cursor into the ship's top-left origin, preserving
// the grab offset and clamping so the whole ship stays on the board.
function dragOrigin(hoverRow, hoverCol) {
    const size = gameState.dragging.size;
    const offset = gameState.dragging.offset;
    let row = hoverRow;
    let col = hoverCol;
    if (gameState.shipOrientation === 'horizontal') {
        col = Math.max(0, Math.min(hoverCol - offset, BOARD_SIZE - size));
        row = Math.max(0, Math.min(hoverRow, BOARD_SIZE - 1));
    } else {
        row = Math.max(0, Math.min(hoverRow - offset, BOARD_SIZE - size));
        col = Math.max(0, Math.min(hoverCol, BOARD_SIZE - 1));
    }
    return { row, col };
}

// Remove a placed ship from the board and enter the dragging state.
function liftShipForDrag(shipName, grabRow, grabCol) {
    const ship = gameState.playerShips.find(s => s.name === shipName);
    if (!ship) return;
    const orientation = getShipOrientation(ship);
    const sorted = [...ship.positions].sort((a, b) => (a.row - b.row) || (a.col - b.col));
    let offset = sorted.findIndex(p => p.row === grabRow && p.col === grabCol);
    if (offset < 0) offset = 0;

    ship.positions.forEach(p => {
        const c = gameState.playerBoard[p.row][p.col];
        c.hasShip = false;
        c.shipName = null;
    });
    gameState.playerShips = gameState.playerShips.filter(s => s.name !== shipName);

    gameState.selectedShip = SHIPS.findIndex(s => s.name === shipName);
    gameState.shipOrientation = orientation;
    gameState.dragging = {
        shipName,
        size: ship.positions.length,
        offset,
        original: { positions: ship.positions, orientation }
    };
    gameState.dragHover = { row: grabRow, col: grabCol };
    document.getElementById('startGame').disabled = true;
}

// Drop the dragged ship at the hovered cell, or snap it back if invalid.
function dropDraggedShip() {
    const drag = gameState.dragging;
    if (!drag) return;
    const hover = gameState.dragHover || { row: 0, col: 0 };
    const o = dragOrigin(hover.row, hover.col);
    const valid = isValidPlacement(gameState.playerBoard, o.row, o.col, drag.size, gameState.shipOrientation);

    if (valid) {
        const positions = placeShip(gameState.playerBoard, o.row, o.col, drag.size, gameState.shipOrientation, drag.shipName);
        gameState.playerShips.push({ name: drag.shipName, positions, hits: 0 });
    } else {
        const orig = drag.original;
        orig.positions.forEach(p => {
            const c = gameState.playerBoard[p.row][p.col];
            c.hasShip = true;
            c.shipName = drag.shipName;
        });
        gameState.playerShips.push({ name: drag.shipName, positions: orig.positions, hits: 0 });
        gameState.shipOrientation = orig.orientation;
    }

    gameState.dragging = null;
    gameState.dragHover = null;
    gameState.selectedShip = null;
    gameState.suppressNextClick = true;

    clearPreview();
    renderBoard(document.getElementById('playerBoard'), gameState.playerBoard, gameState.playerShips, false);
    renderShipsToPlace();

    if (gameState.playerShips.length === SHIPS.length) {
        document.getElementById('startGame').disabled = false;
        updateStatus(valid ? "All ships placed! Click Start Game to begin." : "Couldn't move there \u2014 ship returned to its spot.");
    } else {
        updateStatus("Place your next ship!");
    }
}

function refreshDragPreview() {
    if (!gameState.dragging || !gameState.dragHover) return;
    const o = dragOrigin(gameState.dragHover.row, gameState.dragHover.col);
    clearPreview();
    showPreview(o.row, o.col);
}

function updateStatus(message) {
    document.getElementById('gameStatus').textContent = message;
}

function updateTurnIndicator() {
    const indicator = document.getElementById('turnIndicator');
    if (gameState.currentTurn === 'player') {
        indicator.textContent = "Your Turn";
        indicator.style.color = '#22c55e';
    } else {
        indicator.textContent = "AI Turn";
        indicator.style.color = '#ef4444';
    }
}

// Game Flow Functions
function initializeGame() {
    gameState.playerBoard = initializeBoard();
    gameState.enemyBoard = initializeBoard();
    gameState.playerShips = [];
    gameState.enemyShips = [];
    gameState.currentPhase = 'placement';
    gameState.currentTurn = 'player';
    gameState.selectedShip = null;
    gameState.shipOrientation = 'horizontal';
    gameState.gameOver = false;
    gameState.winner = null;
    gameState.dragging = null;
    gameState.dragHover = null;
    gameState.suppressNextClick = false;
    
    // Reset AI targeting state
    gameState.aiTargetState = {
        huntMode: false,
        hits: [],
        orientation: null,
        targetQueue: []
    };
    
    renderBoard(document.getElementById('playerBoard'), gameState.playerBoard, gameState.playerShips, false);
    renderBoard(document.getElementById('enemyBoard'), gameState.enemyBoard, gameState.enemyShips, true);
    renderShipsToPlace();
    
    document.getElementById('shipPlacement').classList.remove('hidden');
    document.getElementById('startGame').disabled = true;
    
    updateStatus("Place your ships to begin!");
}

function startGame() {
    // If game is over, fully reset to placement phase
    if (gameState.gameOver) {
        initializeGame();
        return;
    }
    
    // Normal game start (from placement phase)
    const aiData = aiPlaceShips();
    gameState.enemyBoard = aiData.board;
    gameState.enemyShips = aiData.ships;
    
    gameState.currentPhase = 'playing';
    gameState.currentTurn = 'player';
    
    document.getElementById('shipPlacement').classList.add('hidden');
    document.getElementById('startGame').disabled = true;
    
    renderBoard(document.getElementById('enemyBoard'), gameState.enemyBoard, gameState.enemyShips, true);
    updateStatus("Game started! Fire at the enemy board!");
    updateTurnIndicator();
}

function handlePlayerShot(row, col) {
    if (gameState.currentPhase !== 'playing' || gameState.currentTurn !== 'player') {
        return;
    }
    
    const result = processShot(gameState.enemyBoard, gameState.enemyShips, row, col, true);
    
    renderBoard(document.getElementById('enemyBoard'), gameState.enemyBoard, gameState.enemyShips, true);
    
    if (result.hit) {
        updateStatus(`Hit at ${indicesToCoordinate(row, col)}!${result.sunk ? ` ${result.sunk} sunk!` : ''}`);
        
        if (result.gameOver) {
            endGame('player');
            return;
        }
    } else {
        updateStatus(`Miss at ${indicesToCoordinate(row, col)}`);
    }
    
    // AI's turn
    gameState.currentTurn = 'enemy';
    updateTurnIndicator();
    
    setTimeout(aiTurn, 1000);
}

function aiTurn() {
    if (gameState.gameOver) return;
    
    const { row, col } = aiFire();
    const result = processShot(gameState.playerBoard, gameState.playerShips, row, col, false);
    
    // Update AI targeting state based on shot result
    updateAITargeting(row, col, result.hit, result.sunk !== null);
    
    renderBoard(document.getElementById('playerBoard'), gameState.playerBoard, gameState.playerShips, false);
    
    if (result.hit) {
        updateStatus(`AI hit your ${indicesToCoordinate(row, col)}!${result.sunk ? ` Your ${result.sunk} was sunk!` : ''}`);
        
        if (result.gameOver) {
            endGame('enemy');
            return;
        }
    } else {
        updateStatus(`AI missed at ${indicesToCoordinate(row, col)}`);
    }
    
    gameState.currentTurn = 'player';
    updateTurnIndicator();
}

function endGame(winner) {
    gameState.gameOver = true;
    gameState.winner = winner;
    
    if (winner === 'player') {
        updateStatus("🎉 Congratulations! You sunk all enemy ships!");
    } else {
        updateStatus("💀 Game Over! AI sunk all your ships!");
    }

    // Reveal the enemy fleet now that the game is over.
    renderBoard(document.getElementById('enemyBoard'), gameState.enemyBoard, gameState.enemyShips, true);

    document.getElementById('startGame').disabled = false;
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    initializeGame();
    
    // Player board click (ship placement)
    document.getElementById('playerBoard').addEventListener('click', (e) => {
        if (gameState.currentPhase !== 'placement') return;
        if (gameState.suppressNextClick) {
            gameState.suppressNextClick = false;
            return;
        }
        
        const cell = e.target.closest('.cell');
        if (!cell) return;
        
        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);
        
        if (gameState.selectedShip === null) {
            updateStatus("Select a ship to place first!");
            return;
        }
        
        const ship = SHIPS[gameState.selectedShip];
        
        if (isValidPlacement(gameState.playerBoard, row, col, ship.size, gameState.shipOrientation)) {
            const positions = placeShip(
                gameState.playerBoard, 
                row, col, 
                ship.size, 
                gameState.shipOrientation, 
                ship.name
            );
            
            gameState.playerShips.push({ 
                name: ship.name, 
                positions, 
                hits: 0 
            });
            
            renderBoard(document.getElementById('playerBoard'), gameState.playerBoard, gameState.playerShips, false);
            renderShipsToPlace();
            
            gameState.selectedShip = null;
            
            if (gameState.playerShips.length === SHIPS.length) {
                document.getElementById('startGame').disabled = false;
                updateStatus("All ships placed! Click Start Game to begin.");
            } else {
                updateStatus("Place your next ship!");
            }
        } else {
            updateStatus("Invalid placement! Try a different position.");
        }
    });
    
    // Player board hover (preview)
    document.getElementById('playerBoard').addEventListener('mouseover', (e) => {
        if (gameState.currentPhase !== 'placement') return;
        
        const cell = e.target.closest('.cell');
        if (!cell) return;
        
        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);
        
        if (gameState.dragging) {
            gameState.dragHover = { row, col };
            refreshDragPreview();
            return;
        }
        
        clearPreview();
        showPreview(row, col);
    });
    
    document.getElementById('playerBoard').addEventListener('mouseout', () => {
        if (gameState.dragging) return;
        clearPreview();
    });
    
    // Pick up an already-placed ship to drag it elsewhere (placement phase)
    document.getElementById('playerBoard').addEventListener('mousedown', (e) => {
        if (gameState.currentPhase !== 'placement') return;
        if (gameState.dragging) return;
        
        const cell = e.target.closest('.cell');
        if (!cell) return;
        
        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);
        const boardCell = gameState.playerBoard[row][col];
        if (!boardCell.hasShip) return;
        
        e.preventDefault();
        liftShipForDrag(boardCell.shipName, row, col);
        renderBoard(document.getElementById('playerBoard'), gameState.playerBoard, gameState.playerShips, false);
        renderShipsToPlace();
        refreshDragPreview();
        updateStatus(`Moving ${gameState.dragging.shipName} \u2014 release to drop, press R to rotate.`);
    });
    
    // Release anywhere to drop the dragged ship
    document.addEventListener('mouseup', () => {
        if (gameState.dragging) dropDraggedShip();
    });
    
    // Enemy board click (firing)
    document.getElementById('enemyBoard').addEventListener('click', (e) => {
        const cell = e.target.closest('.cell');
        if (!cell) return;
        
        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);
        
        handlePlayerShot(row, col);
    });
    
    // Rotate ship
    document.getElementById('rotateShip').addEventListener('click', () => {
        gameState.shipOrientation = gameState.shipOrientation === 'horizontal' ? 'vertical' : 'horizontal';
        if (gameState.dragging) {
            refreshDragPreview();
            updateStatus(`Moving ${gameState.dragging.shipName} \u2014 ${gameState.shipOrientation}. Release to drop.`);
        } else {
            updateStatus(`Orientation: ${gameState.shipOrientation}`);
        }
    });
    
    // Random placement
    document.getElementById('randomPlacement').addEventListener('click', () => {
        // Clear existing ships
        gameState.playerBoard = initializeBoard();
        gameState.playerShips = [];
        
        // Place all ships randomly
        for (const ship of SHIPS) {
            let placed = false;
            let attempts = 0;
            
            while (!placed && attempts < 100) {
                const orientation = Math.random() > 0.5 ? 'horizontal' : 'vertical';
                const row = Math.floor(Math.random() * BOARD_SIZE);
                const col = Math.floor(Math.random() * BOARD_SIZE);
                
                if (isValidPlacement(gameState.playerBoard, row, col, ship.size, orientation)) {
                    const positions = placeShip(
                        gameState.playerBoard, 
                        row, col, 
                        ship.size, 
                        orientation, 
                        ship.name
                    );
                    
                    gameState.playerShips.push({ 
                        name: ship.name, 
                        positions, 
                        hits: 0 
                    });
                    placed = true;
                }
                attempts++;
            }
        }
        
        renderBoard(document.getElementById('playerBoard'), gameState.playerBoard, gameState.playerShips, false);
        renderShipsToPlace();
        
        document.getElementById('startGame').disabled = false;
        updateStatus("Ships placed randomly! Click Start Game to begin.");
    });
    
    // Start game
    document.getElementById('startGame').addEventListener('click', () => {
        startGame();
    });
    
    // Reset game
    document.getElementById('resetGame').addEventListener('click', () => {
        initializeGame();
    });
    
    // Keyboard shortcut for rotate
    document.addEventListener('keydown', (e) => {
        if (e.key === 'r' || e.key === 'R') {
            if (gameState.currentPhase === 'placement') {
                gameState.shipOrientation = gameState.shipOrientation === 'horizontal' ? 'vertical' : 'horizontal';
                if (gameState.dragging) {
                    refreshDragPreview();
                    updateStatus(`Moving ${gameState.dragging.shipName} \u2014 ${gameState.shipOrientation}. Release to drop.`);
                } else {
                    updateStatus(`Orientation: ${gameState.shipOrientation}`);
                }
            }
        }
    });

    // Ship overlays are positioned in pixels, so realign them when the layout changes.
    window.addEventListener('resize', () => {
        renderShipOverlays(document.getElementById('playerBoard'), gameState.playerShips, false);
        renderShipOverlays(document.getElementById('enemyBoard'), gameState.enemyShips, true);
    });
});
