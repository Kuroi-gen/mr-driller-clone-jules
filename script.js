const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// 定数定義
const COLS = 15;
const GOAL_DEPTH = 500; // ゴール深さ（メートル）
const ROWS = GOAL_DEPTH + 1; // 0〜500mまでの行数（計501行）
const VISIBLE_ROWS = 20; // 画面に表示する行数
const BLOCK_SIZE = 32; // 480 / 15 = 32
const COLORS = ['#FF5733', '#33FF57', '#3357FF', '#F333FF', '#FFFF33'];
const PLAYER_GRAVITY_INTERVAL = 10; // プレイヤー重力の更新間隔
const BLOCK_GRAVITY_INTERVAL = 16;  // ブロック重力の更新間隔
const FALL_DELAY_FRAMES = 24;        // ブロック落下の溜め（猶予時間）

// AIRシステム定数
const MAX_AIR = 100;
const AIR_DECREASE_RATE = 0.03; // 1フレームあたりの減少量
const AIR_CAPSULE_CHANCE = 0.05; // AIRカプセルの出現確率

// ゲームの状態定義
const STATE_START = 'START';
const STATE_PLAYING = 'PLAYING';
const STATE_GAMEOVER = 'GAMEOVER';
const STATE_GAMECLEAR = 'GAMECLEAR';

let gameState = STATE_START;
let stateChangeCooldown = 0; // 状態遷移直後の誤操作防止用クールダウン

// ゲームの変数
let playerFrameCount = 0;
let blockFrameCount = 0;
let grid = [];
let player = {
    x: 7, // グリッド上のX座標
    y: 0, // グリッド上のY座標
    direction: 'down', // 向き
    color: '#FFFFFF'
};
let cameraY = 0; // カメラのスクロールY座標
let needsRedraw = true;
let air = MAX_AIR;

// 初期表示とイベントリスナー設定
function init() {
    // キーボード入力の監視
    document.addEventListener('keydown', handleInput);

    // タッチ・ボタンコントロール設定
    setupTouchControls();

    // キャンバスクリックイベント
    canvas.addEventListener('click', () => {
        handleStateTransition();
    });

    // 初期化時はスタート画面にセット
    gameState = STATE_START;
    needsRedraw = true;

    // ゲームループ開始
    requestAnimationFrame(gameLoop);
}

// 新しいゲームを開始する初期化
function startNewGame() {
    air = MAX_AIR;
    grid = [];
    player.x = 7;
    player.y = 0;
    player.direction = 'down';
    cameraY = 0;
    playerFrameCount = 0;
    blockFrameCount = 0;

    // グリッドを生成
    for (let y = 0; y < ROWS; y++) {
        let row = [];
        for (let x = 0; x < COLS; x++) {
            // プレイヤーの初期位置とその周辺（最上段の数マス）を空にする
            if (y === 0 && Math.abs(x - player.x) <= 1) {
                row.push(null);
            } else if (y === GOAL_DEPTH) {
                // GOAL_DEPTH (500m) はゴールライン表示用
                row.push({ type: 'goal', color: '#FFD700', state: 'normal' });
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

    gameState = STATE_PLAYING;
    stateChangeCooldown = 30; // 0.5秒クールダウン
    needsRedraw = true;
}

// 状態遷移処理
function handleStateTransition() {
    if (stateChangeCooldown > 0) return false;

    if (gameState === STATE_START) {
        startNewGame();
        return true;
    } else if (gameState === STATE_GAMEOVER || gameState === STATE_GAMECLEAR) {
        gameState = STATE_START;
        stateChangeCooldown = 20;
        needsRedraw = true;
        return true;
    }
    return false;
}

// タッチコントロール設定
function setupTouchControls() {
    const bindButton = (id, action) => {
        const btn = document.getElementById(id);
        if (!btn) return;

        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (handleStateTransition()) return;
            processInput(action);
        }, { passive: false });

        btn.addEventListener('click', (e) => {
            if (handleStateTransition()) return;
            processInput(action);
        });
    };

    bindButton('btn-up', 'up');
    bindButton('btn-down', 'down');
    bindButton('btn-left', 'left');
    bindButton('btn-right', 'right');
    bindButton('btn-dig', 'dig');
}

// キーボード入力処理
function handleInput(e) {
    if (['Space', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        if (handleStateTransition()) {
            e.preventDefault();
            return;
        }
    }

    if (gameState !== STATE_PLAYING) return;

    switch(e.key) {
        case 'ArrowUp':
            processInput('up');
            e.preventDefault();
            break;
        case 'ArrowDown':
            processInput('down');
            e.preventDefault();
            break;
        case 'ArrowLeft':
            processInput('left');
            e.preventDefault();
            break;
        case 'ArrowRight':
            processInput('right');
            e.preventDefault();
            break;
        case ' ':
        case 'Enter':
            processInput('dig');
            e.preventDefault();
            break;
    }
}

// 入力処理共通化
function processInput(action) {
    if (gameState !== STATE_PLAYING) return;

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
        needsRedraw = true;
        if (nextX >= 0 && nextX < COLS && nextY >= 0 && nextY < ROWS) {
            const targetBlock = grid[nextY][nextX];

            // ゴール判定 (500m到達)
            if (nextY >= GOAL_DEPTH) {
                player.x = nextX;
                player.y = nextY;
                gameState = STATE_GAMECLEAR;
                stateChangeCooldown = 40;
                return;
            }

            // 移動先が空(null)またはAIRカプセルの場合移動可能
            if (!targetBlock || targetBlock.type === 'air') {
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

// カメラ位置の更新
function updateCamera() {
    // プレイヤーが画面の上部から数えて8行目付近になるようにスクロールターゲットを計算
    let targetRow = player.y - 8;
    targetRow = Math.max(0, Math.min(ROWS - VISIBLE_ROWS, targetRow));
    const targetY = targetRow * BLOCK_SIZE;

    // スムーズスクロール
    const diff = targetY - cameraY;
    if (Math.abs(diff) > 0.5) {
        cameraY += diff * 0.2;
        needsRedraw = true;
    } else if (cameraY !== targetY) {
        cameraY = targetY;
        needsRedraw = true;
    }
}

// スタート画面描画
function drawStartScreen() {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // タイトル背景デザイン
    ctx.fillStyle = '#222';
    ctx.fillRect(20, 20, canvas.width - 40, canvas.height - 40);

    // タイトルロゴ
    ctx.fillStyle = '#FFD700';
    ctx.font = '900 42px "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#FF5733';
    ctx.shadowBlur = 10;
    ctx.fillText('MR. DRILLER', canvas.width / 2, 130);
    ctx.shadowBlur = 0;

    // サブタイトル / 目標
    ctx.fillStyle = '#00FFFF';
    ctx.font = 'bold 20px Arial';
    ctx.fillText('〜 地下 500m を目指せ！ 〜', canvas.width / 2, 180);

    // ルール・操作説明
    ctx.fillStyle = '#FFF';
    ctx.font = '16px Arial';
    ctx.textAlign = 'left';
    const startX = 100;
    let textY = 240;

    ctx.fillText('【操作方法】', startX, textY); textY += 30;
    ctx.fillText('・矢印キー / D-PAD : プレイヤー移動', startX + 20, textY); textY += 25;
    ctx.fillText('・スペースキー / DIGボタン : ブロック消去', startX + 20, textY); textY += 35;

    ctx.fillText('【ルール】', startX, textY); textY += 30;
    ctx.fillText('・同じ色のブロックを掘ると一括消去！', startX + 20, textY); textY += 25;
    ctx.fillText('・AIRカプセルを取って酸素を補給！', startX + 20, textY); textY += 25;
    ctx.fillText('・落下してくるブロックに潰されるとミス！', startX + 20, textY); textY += 25;
    ctx.fillText('・地下500mのゴールに到達すればクリア！', startX + 20, textY); textY += 45;

    // スタート案内（点滅）
    ctx.textAlign = 'center';
    if (Math.floor(Date.now() / 500) % 2 === 0) {
        ctx.fillStyle = '#FF5733';
        ctx.font = 'bold 24px Arial';
        ctx.fillText('PRESS SPACE OR DIG TO START', canvas.width / 2, 560);
    }
}

// ゲーム画面描画
function drawGame() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 描画範囲の決定
    const startRow = Math.max(0, Math.floor(cameraY / BLOCK_SIZE) - 1);
    const endRow = Math.min(ROWS, Math.ceil((cameraY + canvas.height) / BLOCK_SIZE) + 1);

    // ブロックの描画
    for (let y = startRow; y < endRow; y++) {
        for (let x = 0; x < COLS; x++) {
            const block = grid[y][x];
            if (block) {
                let drawSize = BLOCK_SIZE;
                let drawX = x * BLOCK_SIZE;
                let drawY = y * BLOCK_SIZE - cameraY;

                if (block.type === 'goal') {
                    // ゴールブロック描画
                    ctx.fillStyle = '#FFD700';
                    ctx.fillRect(drawX, drawY, drawSize, drawSize);
                    ctx.fillStyle = '#000';
                    ctx.font = 'bold 12px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('GOAL', drawX + drawSize / 2, drawY + drawSize / 2);
                    continue;
                }

                // 消去アニメーション
                if (block.state === 'clearing') {
                    const ratio = block.timer / 15;
                    drawSize = BLOCK_SIZE * ratio;
                    const offset = (BLOCK_SIZE - drawSize) / 2;
                    drawX += offset;
                    drawY += offset;

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

                ctx.globalAlpha = 1.0;
            }
        }
    }

    // プレイヤーの描画
    ctx.fillStyle = player.color;
    const playerPadding = 4;
    const px = player.x * BLOCK_SIZE + playerPadding;
    const py = player.y * BLOCK_SIZE - cameraY + playerPadding;
    const pSize = BLOCK_SIZE - playerPadding * 2;

    ctx.fillRect(px, py, pSize, pSize);

    // プレイヤーの目の描画（向き指示）
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

    // UI背景
    ctx.fillStyle = '#222';
    ctx.fillRect(uiX, 0, uiWidth, canvas.height);

    // AIRゲージ枠
    const gaugeX = uiX + 25;
    const gaugeY = 60;
    const gaugeW = 30;
    const gaugeH = 260;

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
        if (Math.floor(Date.now() / 200) % 2 === 0) {
            ctx.fillStyle = '#FF0000';
        } else {
            ctx.fillStyle = '#880000';
        }
    } else {
        ctx.fillStyle = '#00FFFF';
    }
    ctx.fillRect(gaugeX + 1, airY, gaugeW - 2, airHeight);

    // AIR数値表示
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 14px Arial';
    ctx.fillText(Math.floor(air) + '%', gaugeX + gaugeW/2, gaugeY + gaugeH + 20);

    // 深さ(DEPTH)表示
    const depthY = gaugeY + gaugeH + 70;
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 14px Arial';
    ctx.fillText('DEPTH', uiX + uiWidth/2, depthY);

    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 20px Arial';
    ctx.fillText(`${player.y}m`, uiX + uiWidth/2, depthY + 30);

    ctx.fillStyle = '#888';
    ctx.font = '12px Arial';
    ctx.fillText(`/ ${GOAL_DEPTH}m`, uiX + uiWidth/2, depthY + 50);

    // オーバーレイ表示（ゲームオーバー / ゲームクリア）
    if (gameState === STATE_GAMEOVER) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#FF3333';
        ctx.font = 'bold 44px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 30);

        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 20px Arial';
        ctx.fillText(`到達深さ: ${player.y} m`, canvas.width / 2, canvas.height / 2 + 20);

        if (stateChangeCooldown <= 0 && Math.floor(Date.now() / 400) % 2 === 0) {
            ctx.fillStyle = '#FFFF00';
            ctx.font = 'bold 18px Arial';
            ctx.fillText('PRESS ANY KEY TO RETURN', canvas.width / 2, canvas.height / 2 + 80);
        }
    } else if (gameState === STATE_GAMECLEAR) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 44px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('STAGE CLEAR!', canvas.width / 2, canvas.height / 2 - 40);

        ctx.fillStyle = '#00FFFF';
        ctx.font = 'bold 24px Arial';
        ctx.fillText('地下 500m 到達おめでとう！', canvas.width / 2, canvas.height / 2 + 10);

        ctx.fillStyle = '#FFF';
        ctx.font = '18px Arial';
        ctx.fillText(`残りAIR: ${Math.floor(air)}%`, canvas.width / 2, canvas.height / 2 + 50);

        if (stateChangeCooldown <= 0 && Math.floor(Date.now() / 400) % 2 === 0) {
            ctx.fillStyle = '#FFFF00';
            ctx.font = 'bold 18px Arial';
            ctx.fillText('PRESS ANY KEY TO RETURN', canvas.width / 2, canvas.height / 2 + 110);
        }
    }
}

// 全体描画関数
function draw() {
    if (gameState === STATE_START) {
        drawStartScreen();
    } else {
        drawGame();
    }
}

// 落下猶予（溜め）タイマーの更新
function updateFallDelays() {
    const startRow = Math.max(0, Math.floor(cameraY / BLOCK_SIZE) - 2);
    const endRow = Math.min(ROWS, Math.ceil((cameraY + canvas.height) / BLOCK_SIZE) + 2);

    for (let x = 0; x < COLS; x++) {
        for (let y = startRow; y < endRow; y++) {
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

    let clusters = getClusters(startRow, endRow);
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
    if (stateChangeCooldown > 0) {
        stateChangeCooldown--;
    }

    if (gameState === STATE_START) {
        needsRedraw = true; // スタート画面の点滅テキストアニメーションのため
        return;
    }

    if (gameState !== STATE_PLAYING) {
        needsRedraw = true;
        return;
    }

    // カメラ位置更新
    updateCamera();

    // AIR減少
    if (air > 0) {
        air -= AIR_DECREASE_RATE;
        if (air <= 0) {
            air = 0;
            gameState = STATE_GAMEOVER;
            stateChangeCooldown = 30;
            needsRedraw = true;
        } else {
            needsRedraw = true;
        }
    }

    updateClearingBlocks();
    updateFallDelays();

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
    if (player.y < ROWS - 1) {
        if (!grid[player.y + 1][player.x]) {
            player.y++;
            if (player.y >= GOAL_DEPTH) {
                gameState = STATE_GAMECLEAR;
                stateChangeCooldown = 40;
            }
            return true;
        }
    }
    return false;
}

// 結合ブロックのクラスター（連結成分）抽出関数
function getClusters(minY = 0, maxY = ROWS) {
    minY = Math.max(0, minY);
    maxY = Math.min(ROWS, maxY);

    let visited = Array(ROWS).fill(null).map(() => Array(COLS).fill(false));
    let clusters = [];

    for (let y = minY; y < maxY; y++) {
        for (let x = 0; x < COLS; x++) {
            const block = grid[y][x];
            if (!block || visited[y][x] || block.state === 'clearing' || block.type === 'air' || block.type === 'goal') continue;

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

// ブロックの重力処理
function updateBlockGravity() {
    let moved = false;

    const startRow = Math.max(0, Math.floor(cameraY / BLOCK_SIZE) - 4);
    const endRow = Math.min(ROWS - 1, Math.ceil((cameraY + canvas.height) / BLOCK_SIZE) + 4);

    // 1. AIRカプセルの重力処理
    for (let x = 0; x < COLS; x++) {
        for (let y = endRow; y >= startRow; y--) {
            const block = grid[y][x];
            if (block && block.type === 'air' && block.state !== 'clearing') {
                if (y + 1 < ROWS && !grid[y + 1][x] && (block.fallDelay === undefined || block.fallDelay <= 0)) {
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
    let clusters = getClusters(startRow, endRow);

    clusters.sort((a, b) => {
        let maxA = Math.max(...a.map(p => p.y));
        let maxB = Math.max(...b.map(p => p.y));
        return maxB - maxA;
    });

    for (let cluster of clusters) {
        let clusterSet = new Set(cluster.map(p => `${p.x},${p.y}`));

        let isSupported = false;
        let minFallDelay = Infinity;

        for (let p of cluster) {
            let block = grid[p.y][p.x];
            if (block && block.fallDelay !== undefined) {
                if (block.fallDelay < minFallDelay) minFallDelay = block.fallDelay;
            }

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

        if (!isSupported && minFallDelay <= 0) {
            let blocksToMove = cluster.map(p => ({
                x: p.x,
                y: p.y,
                block: grid[p.y][p.x]
            }));

            for (let item of blocksToMove) {
                grid[item.y][item.x] = null;
            }

            for (let item of blocksToMove) {
                let newY = item.y + 1;
                if (player.x === item.x && player.y === newY) {
                    gameState = STATE_GAMEOVER;
                    stateChangeCooldown = 30;
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
    const startRow = Math.max(0, Math.floor(cameraY / BLOCK_SIZE) - 2);
    const endRow = Math.min(ROWS, Math.ceil((cameraY + canvas.height) / BLOCK_SIZE) + 2);

    for (let y = startRow; y < endRow; y++) {
        for (let x = 0; x < COLS; x++) {
            const block = grid[y][x];
            if (block && block.state === 'clearing') {
                animating = true;
                block.timer--;
                if (block.timer <= 0) {
                    grid[y][x] = null;
                    needsRedraw = true;
                }
            }
        }
    }
    if (animating) {
        needsRedraw = true;
    }
}

// ゲームループ
function gameLoop() {
    update();
    if (needsRedraw) {
        draw();
        needsRedraw = false;
    }
    requestAnimationFrame(gameLoop);
}

// ゲーム開始
init();
