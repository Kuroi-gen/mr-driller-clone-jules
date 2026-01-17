const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// 定数定義
const COLS = 15;
const ROWS = 20;
const BLOCK_SIZE = 32; // 480 / 15 = 32
const COLORS = ['#FF5733', '#33FF57', '#3357FF', '#F333FF', '#FFFF33'];
const GRAVITY_INTERVAL = 10; // 重力の更新間隔（フレーム数）

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

// 初期化
function init() {
    // グリッドをランダムな色で埋める
    for (let y = 0; y < ROWS; y++) {
        let row = [];
        for (let x = 0; x < COLS; x++) {
            // とりあえずプレイヤーの初期位置だけ空にしておく
            if (x === player.x && y === player.y) {
                row.push(null);
            } else {
                const color = COLORS[Math.floor(Math.random() * COLORS.length)];
                row.push({ color: color, state: 'normal', timer: 0 });
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
            // 移動先が空(null)の場合のみ移動可能
            if (!grid[nextY][nextX]) {
                player.x = nextX;
                player.y = nextY;
            }
        }
    }
}

// キーボード入力処理
function handleInput(e) {
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

// 描画処理
function draw() {
    // 背景クリア
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

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

                ctx.fillStyle = block.color;
                ctx.fillRect(drawX, drawY, drawSize, drawSize);

                ctx.strokeStyle = '#222';
                ctx.strokeRect(drawX, drawY, drawSize, drawSize);

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
}

// 更新処理
function update() {
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
                // 下が空で、かつプレイヤーがその下にいなければ落下
                // clearing状態のブロックの上には乗れる（消えるまでは実体がある扱いとする）
                if (!grid[y + 1][x] && !(player.x === x && player.y === y + 1)) {
                    grid[y + 1][x] = block;
                    grid[y][x] = null;
                    moved = true;
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
            if (!grid[y][x] || visited[y][x] || grid[y][x].state === 'clearing') continue;

            let group = [];
            let color = grid[y][x].color;
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
                        if (!visited[ny][nx] && grid[ny][nx] &&
                            grid[ny][nx].color === color &&
                            grid[ny][nx].state !== 'clearing') {

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
