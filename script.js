const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// 定数定義
const COLS = 15;
const ROWS = 20;
const BLOCK_SIZE = 32; // 480 / 15 = 32
const COLORS = ['#FF5733', '#33FF57', '#3357FF', '#F333FF', '#FFFF33'];
const PLAYER_GRAVITY_INTERVAL = 10; // プレイヤー重力の更新間隔
const BLOCK_GRAVITY_INTERVAL = 16;  // ブロック強力の更新間隔（落下速度を遅く調整）
const FALL_DELAY_FRAMES = 24;        // ブロック落下の溜め（猶予時間：約0.4秒）

// AIRシステム定数
const MAX_AIR = 100;
const AIR_DECREASE_RATE = 0.03; // 1フレームあたりの減少量（60fpsなら1秒で約1.8%減少）
const AIR_CAPSULE_CHANCE = 0.05; // AIRカプセルの出現確率

// ゲームの状態
let playerFrameCount = 0;
let blockFrameCount = 0;
let grid = [];
let player = {
    x: 7, // グリッド上のX座標
    y: 0, // グリッド上のY座標
    direction: 'down', // 向き
    color: '#FFFFFF'
};
let needsRedraw = true;
let air = MAX_AIR;
let isGameOver = false;

// 初期化
function init() {
    air = MAX_AIR;
    isGameOver = false;

    // グリッドをランダムな色で埋める
    for (let y = 0; y < ROWS; y++) {
        let row = [];
        for (let x = 0; x < COLS; x++) {
            // とりあえずプレイヤーの初期位置だけ空にしておく
            if (x === player.x && y === player.y) {
                row.push(null);
            } else {
                if (Math.random() < AIR_CAPSULE_CHANCE) {
                    row.push({ type: 'air', state: 'normal', timer: 0, fallDelay: FALL_DELAY_FRAMES, isUnsupported: false });
                } else {
                    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
                    row.push({ type: 'block', color: color, state: 'normal', timer: 0, fallDelay: FALL_DELAY_FRAMES, isUnsupported: false });
                }
            }
        }
        grid.push(row);
    }

    // キーボード入力の監視
    document.addEventListener('keydown', handleInput);

    // タッチボタンの監視
    setupTouchControls();

    // ゲームループ開始
    requestAnimationFrame(gameLoop);
}

// タッチコントロール設定
function setupTouchControls() {
    const bindButton = (id, action) => {
        const btn = document.getElementById(id);
        if (!btn) return;

        // タッチイベントの遅延を防ぐためtouchstartを使用
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault(); // デフォルトの動作（スクロールなど）を防ぐ
            processInput(action);
        }, { passive: false });

        // PCでのクリックテスト用
        btn.addEventListener('click', (e) => {
             processInput(action);
        });
    };

    bindButton('btn-up', 'up');
    bindButton('btn-down', 'down');
    bindButton('btn-left', 'left');
    bindButton('btn-right', 'right');
    bindButton('btn-dig', 'dig');
}

// 入力処理共通化
function processInput(action) {
    if (isGameOver) return;

    let nextX = player.x;
    let nextY = player.y;
    let moved = false;

    if (action === 'dig') {
        dig();
        return;
    }

    switch(action) {
        case 'up':
            player.direction = 'up';
            nextY--;
            moved = true;
            break;
        case 'down':
            player.direction = 'down';
            nextY++;
            moved = true;
            break;
        case 'left':
            player.direction = 'left';
            nextX--;
            moved = true;
            break;
        case 'right':
            player.direction = 'right';
            nextX++;
            moved = true;
            break;
    }

    if (moved) {
        needsRedraw = true; // 向き変更または移動のため再描画
        // 画面外に出ないように制限
        if (nextX >= 0 && nextX < COLS && nextY >= 0 && nextY < ROWS) {
            const targetBlock = grid[nextY][nextX];

            // 移動先が空(null)またはAIRカプセルの場合移動可能
            if (!targetBlock || targetBlock.type === 'air') {
                // AIRカプセルなら取得
                if (targetBlock && targetBlock.type === 'air') {
                    grid[nextY][nextX] = null;
                    air = Math.min(air + 20, MAX_AIR);
                }

                player.x = nextX;
                player.y = nextY;
            }
        }
    }
}

// キーボード入力処理
function handleInput(e) {
    if (isGameOver) return;
    switch(e.key) {
        case 'ArrowUp':
            processInput('up');
            break;
        case 'ArrowDown':
            processInput('down');
            break;
        case 'ArrowLeft':
            processInput('left');
            break;
        case 'ArrowRight':
            processInput('right');
            break;
        case ' ':
            processInput('dig');
            break;
        default:
            return; // Ignore other keys
    }
}

// ブロックを掘る
function dig() {
    let targetX = player.x;
    let targetY = player.y;

    switch(player.direction) {
        case 'up': targetY--; break;
        case 'down': targetY++; break;
        case 'left': targetX--; break;
        case 'right': targetX++; break;
    }

    if (targetX >= 0 && targetX < COLS && targetY >= 0 && targetY < ROWS) {
        const targetBlock = grid[targetY][targetX];
        if (targetBlock) {
            if (targetBlock.type === 'air') {
                grid[targetY][targetX] = null;
            } else if (targetBlock.type === 'block') {
                const color = targetBlock.color;
                const stack = [{x: targetX, y: targetY}];
                const visited = Array(ROWS).fill(null).map(() => Array(COLS).fill(false));
                visited[targetY][targetX] = true;

                let blocksToClear = [];
                while (stack.length > 0) {
                    const curr = stack.pop();
                    blocksToClear.push(curr);

                    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
                    for (let d of dirs) {
                        let nx = curr.x + d[0];
                        let ny = curr.y + d[1];
                        if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) {
                            if (!visited[ny][nx]) {
                                const b = grid[ny][nx];
                                if (b && b.type === 'block' && b.color === color && b.state !== 'clearing') {
                                    visited[ny][nx] = true;
                                    stack.push({x: nx, y: ny});
                                }
                            }
                        }
                    }
                }

                for (let b of blocksToClear) {
                    grid[b.y][b.x] = null;
                }
            }
            needsRedraw = true;
        }
    }
}

// 同色ブロック判定補助関数
function isSameColorBlock(b, color) {
    return b && b.type === 'block' && b.color === color && b.state !== 'clearing';
}

// 描画処理
function draw() {
    // 背景クリア
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // --- ゲームエリア描画 ---

    // ブロックの描画
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            const block = grid[y][x];
            if (block) {
                let drawSize = BLOCK_SIZE;
                let drawX = x * BLOCK_SIZE;
                let drawY = y * BLOCK_SIZE;

                // 消去アニメーション
                if (block.state === 'clearing') {
                    const ratio = block.timer / 15; // 15は最大タイマー値
                    drawSize = BLOCK_SIZE * ratio;
                    const offset = (BLOCK_SIZE - drawSize) / 2;
                    drawX += offset;
                    drawY += offset;

                    // 点滅効果
                    if (block.timer % 4 < 2) {
                        ctx.globalAlpha = 0.5;
                    }
                }

                // 溜め（猶予時間）中の微振動エフェクト
                if (block.state !== 'clearing' && block.isUnsupported && block.fallDelay > 0) {
                    drawX += (Math.random() - 0.5) * 3;
                }

                if (block.type === 'air') {
                    // AIRカプセル描画
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(drawX, drawY, drawSize, drawSize);

                    ctx.fillStyle = '#0000FF';
                    ctx.font = 'bold 12px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('AIR', drawX + drawSize/2, drawY + drawSize/2);

                    ctx.strokeStyle = '#222';
                    ctx.strokeRect(drawX, drawY, drawSize, drawSize);
                } else {
                    // 通常ブロック
                    ctx.fillStyle = block.color;
                    ctx.fillRect(drawX, drawY, drawSize, drawSize);

                    if (block.state === 'clearing') {
                        ctx.strokeStyle = '#222';
                        ctx.strokeRect(drawX, drawY, drawSize, drawSize);
                    } else {
                        // 隣接する同色ブロックの有無を確認して外枠のみ描画（ブロック結合）
                        const topConnected = y > 0 && isSameColorBlock(grid[y-1][x], block.color);
                        const bottomConnected = y < ROWS - 1 && isSameColorBlock(grid[y+1][x], block.color);
                        const leftConnected = x > 0 && isSameColorBlock(grid[y][x-1], block.color);
                        const rightConnected = x < COLS - 1 && isSameColorBlock(grid[y][x+1], block.color);

                        ctx.strokeStyle = '#222';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        if (!topConnected) {
                            ctx.moveTo(drawX, drawY);
                            ctx.lineTo(drawX + drawSize, drawY);
                        }
                        if (!bottomConnected) {
                            ctx.moveTo(drawX, drawY + drawSize);
                            ctx.lineTo(drawX + drawSize, drawY + drawSize);
                        }
                        if (!leftConnected) {
                            ctx.moveTo(drawX, drawY);
                            ctx.lineTo(drawX, drawY + drawSize);
                        }
                        if (!rightConnected) {
                            ctx.moveTo(drawX + drawSize, drawY);
                            ctx.lineTo(drawX + drawSize, drawY + drawSize);
                        }
                        ctx.stroke();
                    }
                }

                ctx.globalAlpha = 1.0; // アルファ値をリセット
            }
        }
    }

    // プレイヤーの描画
    ctx.fillStyle = player.color;
    // プレイヤーを少し小さく描画して見やすくする
    const playerPadding = 4;
    const px = player.x * BLOCK_SIZE + playerPadding;
    const py = player.y * BLOCK_SIZE + playerPadding;
    const pSize = BLOCK_SIZE - playerPadding * 2;

    ctx.fillRect(px, py, pSize, pSize);

    // 向きを表示
    ctx.fillStyle = '#000';
    const eyeSize = 4;
    let eyeX = px + pSize / 2 - eyeSize / 2;
    let eyeY = py + pSize / 2 - eyeSize / 2;

    switch(player.direction) {
        case 'up': eyeY -= 8; break;
        case 'down': eyeY += 8; break;
        case 'left': eyeX -= 8; break;
        case 'right': eyeX += 8; break;
    }
    ctx.fillRect(eyeX, eyeY, eyeSize, eyeSize);

    // --- UI描画 (右側エリア) ---
    const uiX = 480;
    const uiWidth = 100;

    // UI背景（念のため）
    ctx.fillStyle = '#222';
    ctx.fillRect(uiX, 0, uiWidth, canvas.height);

    // AIRゲージ枠
    const gaugeX = uiX + 20;
    const gaugeY = 50;
    const gaugeW = 30;
    const gaugeH = 300;

    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 2;
    ctx.strokeRect(gaugeX, gaugeY, gaugeW, gaugeH);

    // AIRラベル
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('AIR', gaugeX + gaugeW/2, gaugeY - 10);

    // AIR残量バー
    const airHeight = (air / MAX_AIR) * gaugeH;
    const airY = gaugeY + (gaugeH - airHeight);

    if (air <= 20) {
        // 点滅させるか赤くする
        if (Math.floor(Date.now() / 200) % 2 === 0) {
            ctx.fillStyle = '#FF0000';
        } else {
             ctx.fillStyle = '#880000';
        }
    } else {
        ctx.fillStyle = '#00FFFF';
    }
    ctx.fillRect(gaugeX + 1, airY, gaugeW - 2, airHeight);

    // 数値表示
    ctx.fillStyle = '#FFF';
    ctx.fillText(Math.floor(air) + '%', gaugeX + gaugeW/2, gaugeY + gaugeH + 20);

    // ゲームオーバー表示
    if (isGameOver) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#FF0000';
        ctx.font = 'bold 40px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2);
    }
}

// 落下猶予（溜め）タイマーの更新
function updateFallDelays() {
    // 1. AIRカプセル
    for (let x = 0; x < COLS; x++) {
        for (let y = 0; y < ROWS; y++) {
            const block = grid[y][x];
            if (block && block.type === 'air') {
                const isSupported = (y === ROWS - 1) || (grid[y + 1][x] !== null);
                block.isUnsupported = !isSupported;
                if (isSupported) {
                    block.fallDelay = FALL_DELAY_FRAMES;
                } else if (block.fallDelay > 0) {
                    block.fallDelay--;
                }
            }
        }
    }

    // 2. クラスター（通常ブロック）
    let clusters = getClusters();
    for (let cluster of clusters) {
        let clusterSet = new Set(cluster.map(p => `${p.x},${p.y}`));
        let isSupported = false;

        for (let p of cluster) {
            let belowY = p.y + 1;
            if (belowY >= ROWS) {
                isSupported = true;
                break;
            }
            let belowBlock = grid[belowY][p.x];
            if (belowBlock && !clusterSet.has(`${p.x},${belowY}`)) {
                isSupported = true;
                break;
            }
        }

        for (let p of cluster) {
            const block = grid[p.y][p.x];
            if (block) {
                block.isUnsupported = !isSupported;
                if (isSupported) {
                    block.fallDelay = FALL_DELAY_FRAMES;
                } else if (block.fallDelay > 0) {
                    block.fallDelay--;
                }
            }
        }
    }
}

// 更新処理
function update() {
    if (isGameOver) return;

    // AIR減少
    if (air > 0) {
        air -= AIR_DECREASE_RATE;
        if (air <= 0) {
            air = 0;
            isGameOver = true;
            needsRedraw = true;
        } else {
             needsRedraw = true;
        }
    }

    updateClearingBlocks();
    updateFallDelays();

    // 溜め振動中のブロックがあれば再描画
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            const b = grid[y][x];
            if (b && b.isUnsupported && b.fallDelay > 0) {
                needsRedraw = true;
                break;
            }
        }
    }

    playerFrameCount++;
    if (playerFrameCount >= PLAYER_GRAVITY_INTERVAL) {
        const playerMoved = updatePlayerGravity();
        if (playerMoved) {
            needsRedraw = true;
        }
        playerFrameCount = 0;
    }

    blockFrameCount++;
    if (blockFrameCount >= BLOCK_GRAVITY_INTERVAL) {
        const blocksMoved = updateBlockGravity();
        if (blocksMoved) {
            needsRedraw = true;
        }
        blockFrameCount = 0;
    }
}

// プレイヤーの重力処理
function updatePlayerGravity() {
    // 地面より上にいて、下が空(null)なら落下
    if (player.y < ROWS - 1) {
        if (!grid[player.y + 1][player.x]) {
            player.y++;
            return true;
        }
    }
    return false;
}

// 結合ブロックのクラスター（連結成分）抽出関数
function getClusters() {
    let visited = Array(ROWS).fill(null).map(() => Array(COLS).fill(false));
    let clusters = [];

    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            const block = grid[y][x];
            if (!block || visited[y][x] || block.state === 'clearing' || block.type === 'air') continue;

            let cluster = [];
            let color = block.color;
            let stack = [{x, y}];
            visited[y][x] = true;

            while (stack.length > 0) {
                let current = stack.pop();
                cluster.push(current);
                const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];

                for (let d of dirs) {
                    let nx = current.x + d[0];
                    let ny = current.y + d[1];

                    if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) {
                        const nextBlock = grid[ny][nx];
                        if (!visited[ny][nx] && nextBlock &&
                            nextBlock.type === 'block' &&
                            nextBlock.color === color &&
                            nextBlock.state !== 'clearing') {

                            visited[ny][nx] = true;
                            stack.push({x: nx, y: ny});
                        }
                    }
                }
            }
            clusters.push(cluster);
        }
    }

    return clusters;
}

// ブロックの重力処理（同色結合クラスター単位）
function updateBlockGravity() {
    let moved = false;

    // 1. AIRカプセルの重力処理（単体で落下）
    for (let x = 0; x < COLS; x++) {
        for (let y = ROWS - 2; y >= 0; y--) {
            const block = grid[y][x];
            if (block && block.type === 'air' && block.state !== 'clearing') {
                if (!grid[y + 1][x] && (block.fallDelay === undefined || block.fallDelay <= 0)) {
                    if (player.x === x && player.y === y + 1) {
                        air = Math.min(air + 20, MAX_AIR);
                        grid[y][x] = null;
                        moved = true;
                    } else {
                        grid[y + 1][x] = block;
                        grid[y][x] = null;
                        moved = true;
                    }
                }
            }
        }
    }

    // 2. 通常ブロックのクラスタ単位の重力処理
    let clusters = getClusters();

    // 落下順序のため、クラスター内の最大Yが大きい順（下にあるクラスター順）にソート
    clusters.sort((a, b) => {
        let maxA = Math.max(...a.map(p => p.y));
        let maxB = Math.max(...b.map(p => p.y));
        return maxB - maxA;
    });

    for (let cluster of clusters) {
        let clusterSet = new Set(cluster.map(p => `${p.x},${p.y}`));

        // クラスターのサポート（支え）判定
        let isSupported = false;
        let minFallDelay = Infinity;

        for (let p of cluster) {
            let block = grid[p.y][p.x];
            if (block && block.fallDelay !== undefined) {
                if (block.fallDelay < minFallDelay) minFallDelay = block.fallDelay;
            }

            let belowY = p.y + 1;
            if (belowY >= ROWS) {
                // 地面に接している
                isSupported = true;
                break;
            }
            let belowBlock = grid[belowY][p.x];
            if (belowBlock && !clusterSet.has(`${p.x},${belowY}`)) {
                // 同一クラスター以外のブロックまたはAIRカプセルが下にある
                isSupported = true;
                break;
            }
        }

        if (!isSupported && minFallDelay <= 0) {
            // クラスター全ブロックを一体として1マス下に移動
            let blocksToMove = cluster.map(p => ({
                x: p.x,
                y: p.y,
                block: grid[p.y][p.x]
            }));

            // 元の位置をクリア
            for (let item of blocksToMove) {
                grid[item.y][item.x] = null;
            }

            // 移動先にブロックを再配置
            for (let item of blocksToMove) {
                let newY = item.y + 1;
                if (player.x === item.x && player.y === newY) {
                    isGameOver = true;
                }
                grid[newY][item.x] = item.block;
            }

            moved = true;
        }
    }

    return moved;
}

// 消去アニメーションの更新
function updateClearingBlocks() {
    let animating = false;
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            const block = grid[y][x];
            if (block && block.state === 'clearing') {
                animating = true;
                block.timer--;
                if (block.timer <= 0) {
                    grid[y][x] = null;
                    needsRedraw = true; // 消えた
                }
            }
        }
    }
    if (animating) {
        needsRedraw = true;
    }
}

// 連結判定と消去処理
function checkMatches() {
    let visited = Array(ROWS).fill(null).map(() => Array(COLS).fill(false));

    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            const block = grid[y][x];
            // AIRカプセルはマッチング対象外
            if (!block || visited[y][x] || block.state === 'clearing' || block.type === 'air') continue;

            let group = [];
            let color = block.color;
            let stack = [{x, y}];
            visited[y][x] = true;
            group.push({x, y});

            // 深さ優先探索で連結ブロックを探す
            while(stack.length > 0) {
                let current = stack.pop();
                const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];

                for (let d of dirs) {
                    let nx = current.x + d[0];
                    let ny = current.y + d[1];

                    if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) {
                        const nextBlock = grid[ny][nx];
                        if (!visited[ny][nx] && nextBlock &&
                            nextBlock.color === color &&
                            nextBlock.state !== 'clearing' &&
                            nextBlock.type !== 'air') {

                            visited[ny][nx] = true;
                            group.push({x: nx, y: ny});
                            stack.push({x: nx, y: ny});
                        }
                    }
                }
            }

            // 4つ以上連結していたら消去対象にする
            if (group.length >= 4) {
                for (let b of group) {
                    grid[b.y][b.x].state = 'clearing';
                    grid[b.y][b.x].timer = 15; // アニメーション時間（約0.25秒）
                }
                needsRedraw = true;
            }
        }
    }
}

// ゲームループ
function gameLoop() {
    if (needsRedraw) {
        draw();
        needsRedraw = false;
    }
    update();
    requestAnimationFrame(gameLoop);
}

// ゲーム開始
init();
