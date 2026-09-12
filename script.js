const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// 定数定義
const COLS = 15;
const ROWS = 20;
const BLOCK_SIZE = 32; // 480 / 15 = 32
const COLORS = ['#FF5733', '#33FF57', '#3357FF', '#F333FF', '#FFFF33'];
const GRAVITY_INTERVAL = 10; // 重力の更新間隔（フレーム数）

// AIRシステム定数
const MAX_AIR = 100;
const AIR_DECREASE_RATE = 0.03; // 1フレームあたりの減少量（60fpsなら1秒で約1.8%減少）
const AIR_CAPSULE_CHANCE = 0.05; // AIRカプセルの出現確率

// ゲームの状態
let frameCount = 0;
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
                    row.push({ type: 'air', state: 'normal', timer: 0 });
                } else {
                    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
                    row.push({ type: 'block', color: color, state: 'normal', timer: 0 });
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
        if (grid[targetY][targetX]) {
            grid[targetY][targetX] = null;
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
             // ゲージ更新のために頻繁に再描画が必要だが、
             // フレーム毎だと重いかもしれないので一定間隔か、あるいはUI部分だけならOK
             // ここではneedsRedrawを立てるかどうか検討
             // AIRバーの変化を見せるため、例えば10フレームに1回再描画するか、
             // そもそもAIR_DECREASE_RATEが小さいので、値が1変わるごとに描画でもよい
             // 簡易的に毎回描画リクエストする（描画負荷は低いので）
             needsRedraw = true;
        }
    }

    updateClearingBlocks();

    frameCount++;
    if (frameCount >= GRAVITY_INTERVAL) {
        const playerMoved = updatePlayerGravity();
        const blocksMoved = updateBlockGravity();

        if (playerMoved || blocksMoved) {
            needsRedraw = true;
        }

        // ブロックが動いていない（安定している）場合のみマッチ判定を行う
        if (!blocksMoved) {
            checkMatches();
        }

        frameCount = 0;
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

// ブロックの重力処理
function updateBlockGravity() {
    let moved = false;
    // 下から上へ走査（落ちる処理のため）
    for (let x = 0; x < COLS; x++) {
        for (let y = ROWS - 2; y >= 0; y--) {
            const block = grid[y][x];
            if (block && block.state !== 'clearing') {
                // 下が空の場合に落下処理
                if (!grid[y + 1][x]) {
                    if (player.x === x && player.y === y + 1) {
                        if (block.type === 'air') {
                            // AIRカプセルの場合はプレイヤーが自動取得
                            air = Math.min(air + 20, MAX_AIR);
                            grid[y][x] = null;
                            moved = true;
                        } else {
                            // 通常ブロックの場合はプレイヤー圧死（ゲームオーバー）
                            grid[y + 1][x] = block;
                            grid[y][x] = null;
                            isGameOver = true;
                            moved = true;
                        }
                    } else {
                        // プレイヤーがいない場合は通常の落下
                        grid[y + 1][x] = block;
                        grid[y][x] = null;
                        moved = true;
                    }
                }
            }
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
