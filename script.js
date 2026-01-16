const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// 定数定義
const COLS = 15;
const ROWS = 20;
const BLOCK_SIZE = 32; // 480 / 15 = 32
const COLORS = ['#FF5733', '#33FF57', '#3357FF', '#F333FF', '#FFFF33'];

// ゲームの状態
let grid = [];
let player = {
    x: 7, // グリッド上のX座標
    y: 0, // グリッド上のY座標
    color: '#FFFFFF'
};
let needsRedraw = true;

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

    switch(e.key) {
        case 'ArrowUp':
            nextY--;
            break;
        case 'ArrowDown':
            nextY++;
            break;
        case 'ArrowLeft':
            nextX--;
            break;
        case 'ArrowRight':
            nextX++;
            break;
        default:
            return; // Ignore other keys
    }

    // 画面外に出ないように制限
    if (nextX >= 0 && nextX < COLS && nextY >= 0 && nextY < ROWS) {
        player.x = nextX;
        player.y = nextY;
        needsRedraw = true;
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
    ctx.fillRect(
        player.x * BLOCK_SIZE + playerPadding,
        player.y * BLOCK_SIZE + playerPadding,
        BLOCK_SIZE - playerPadding * 2,
        BLOCK_SIZE - playerPadding * 2
    );
}

// ゲームループ
function gameLoop() {
    if (needsRedraw) {
        draw();
        needsRedraw = false;
    }
    requestAnimationFrame(gameLoop);
}

// ゲーム開始
init();
