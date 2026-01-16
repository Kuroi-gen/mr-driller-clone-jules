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

// 初期化
function init() {
    // グリッドをランダムな色で埋める
    for (let y = 0; y < ROWS; y++) {
        let row = [];
        for (let x = 0; x < COLS; x++) {
            // 地面より下（y > 2）をブロックで埋める、など調整も可能だが、
            // 今回は「敷き詰められた画面」という要望なので全体を埋める
            // ただし、プレイヤーの初期位置付近は空けておくなどの配慮があってもいいが
            // シンプルにランダムに埋める。プレイヤーと重なる部分は後で描画順で解決するか、
            // プレイヤーがいる場所はブロックを置かないようにする。

            // とりあえずプレイヤーの初期位置だけ空にしておく
            if (x === player.x && y === player.y) {
                row.push(null);
            } else {
                const color = COLORS[Math.floor(Math.random() * COLORS.length)];
                row.push({ color: color });
            }
        }
        grid.push(row);
    }

    // キーボード入力の監視
    document.addEventListener('keydown', handleInput);

    // ゲームループ開始
    requestAnimationFrame(gameLoop);
}

// 入力処理
function handleInput(e) {
    let nextX = player.x;
    let nextY = player.y;
    let moved = false;

    switch(e.key) {
        case 'ArrowUp':
            player.direction = 'up';
            nextY--;
            moved = true;
            break;
        case 'ArrowDown':
            player.direction = 'down';
            nextY++;
            moved = true;
            break;
        case 'ArrowLeft':
            player.direction = 'left';
            nextX--;
            moved = true;
            break;
        case 'ArrowRight':
            player.direction = 'right';
            nextX++;
            moved = true;
            break;
        case ' ':
            dig();
            break;
    }

    if (moved) {
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
                ctx.fillStyle = block.color;
                ctx.fillRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);

                // ブロックの枠線（見やすくするため）
                ctx.strokeStyle = '#222';
                ctx.strokeRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
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
    frameCount++;
    if (frameCount >= GRAVITY_INTERVAL) {
        updatePlayerGravity();
        updateBlockGravity();
        frameCount = 0;
    }
}

// プレイヤーの重力処理
function updatePlayerGravity() {
    // 地面より上にいて、下が空(null)なら落下
    if (player.y < ROWS - 1) {
        if (!grid[player.y + 1][player.x]) {
            player.y++;
        }
    }
}

// ブロックの重力処理
function updateBlockGravity() {
    // 下から上へ走査（落ちる処理のため）
    for (let x = 0; x < COLS; x++) {
        for (let y = ROWS - 2; y >= 0; y--) {
            const block = grid[y][x];
            if (block) {
                // 下が空で、かつプレイヤーがその下にいなければ落下
                if (!grid[y + 1][x] && !(player.x === x && player.y === y + 1)) {
                    grid[y + 1][x] = block;
                    grid[y][x] = null;
                }
            }
        }
    }
}

// ゲームループ
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// ゲーム開始
init();
