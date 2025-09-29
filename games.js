// Space Stress Relief Games: Astro Flap and Orbital Breaker

(function () {
  // Utility: tab switching
  function setupTabs() {
    const tabs = Array.from(document.querySelectorAll('.tab'));
    const panels = Array.from(document.querySelectorAll('.panel'));
    tabs.forEach(tab => tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const target = document.querySelector(tab.getAttribute('data-target'));
      if (target) target.classList.add('active');
    }));
  }

  // ============================
  // Astro Flap (Flappy-style)
  // ============================
  function initFlappy() {
    const canvas = document.getElementById('flappy-canvas');
    const ctx = canvas.getContext('2d');
    const startBtn = document.getElementById('flappy-start');
    const scoreEl = document.getElementById('flappy-score');

    const W = canvas.width;
    const H = canvas.height;

    let rafId = null;
    let running = false;
    let score = 0;

    const ship = { x: 110, y: H / 2, vy: 0 };
    const G = 0.45;
    const THRUST = -7;
    const PIPE_GAP = 150;
    const PIPE_W = 70;
    const PIPE_SPACING = 220;
    const SPEED = 2.6;

    let pipes = [];
    function reset() {
      score = 0;
      scoreEl.textContent = '0';
      ship.x = 110; ship.y = H / 2; ship.vy = 0;
      pipes = [];
      for (let i = 0; i < 4; i++) {
        spawnPipe(W + i * PIPE_SPACING);
      }
    }

    function spawnPipe(x) {
      const minTop = 60;
      const maxTop = H - PIPE_GAP - 60;
      const topH = Math.floor(minTop + Math.random() * (maxTop - minTop));
      pipes.push({ x, topH, passed: false });
    }

    function flap() {
      if (!running) return;
      ship.vy = THRUST;
    }

    function update() {
      ship.vy += G;
      ship.y += ship.vy;

      // move pipes
      for (const p of pipes) p.x -= SPEED;
      // recycle pipes
      if (pipes.length && pipes[0].x + PIPE_W < 0) pipes.shift();
      const lastX = pipes[pipes.length - 1].x;
      if (W - lastX > PIPE_SPACING - PIPE_W) spawnPipe(lastX + PIPE_SPACING);

      // scoring & collisions
      for (const p of pipes) {
        // score when ship passes pipe center
        if (!p.passed && p.x + PIPE_W < ship.x) {
          p.passed = true;
          score += 1; scoreEl.textContent = String(score);
        }

        // collision check
        const inX = ship.x > p.x - 24 && ship.x < p.x + PIPE_W + 24;
        const topBottomSafeStart = p.topH;
        const bottomTop = p.topH + PIPE_GAP;
        const hitTop = ship.y - 16 < topBottomSafeStart;
        const hitBottom = ship.y + 16 > bottomTop;
        if (inX && (hitTop || hitBottom)) return gameOver();
      }

      if (ship.y > H - 10 || ship.y < 10) return gameOver();
    }

    function drawStars() {
      ctx.fillStyle = '#0b1224';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,.8)';
      for (let i = 0; i < 60; i++) {
        const x = (i * 73 + Date.now() * 0.02) % W;
        const y = (i * 131) % H;
        ctx.fillRect(x, y, 1, 1);
      }
    }

    function drawShip() {
      ctx.save();
      ctx.translate(ship.x, ship.y);
      ctx.rotate(Math.min(Math.max(ship.vy / 10, -0.6), 0.6));
      ctx.fillStyle = '#6ee7ff';
      ctx.beginPath();
      ctx.moveTo(16, 0); ctx.lineTo(-10, -8); ctx.lineTo(-10, 8); ctx.closePath();
      ctx.fill();
      // glow
      ctx.shadowColor = '#6ee7ff';
      ctx.shadowBlur = 8;
      ctx.fillRect(-12, -3, 8, 6);
      ctx.restore();
    }

    function drawPipes() {
      ctx.fillStyle = '#818cf8';
      for (const p of pipes) {
        // top
        ctx.fillRect(p.x, 0, PIPE_W, p.topH);
        // bottom
        ctx.fillRect(p.x, p.topH + PIPE_GAP, PIPE_W, H - (p.topH + PIPE_GAP));
      }
    }

    function loop() {
      update();
      drawStars();
      drawPipes();
      drawShip();
      if (running) rafId = requestAnimationFrame(loop);
    }

    function gameOver() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#e5e7eb';
      ctx.font = 'bold 24px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Mission Failed', W / 2, H / 2 - 20);
      ctx.font = '14px Orbitron, sans-serif';
      ctx.fillText('Press Start to try again', W / 2, H / 2 + 10);
    }

    function start() {
      reset(); running = true; loop();
    }

    startBtn.addEventListener('click', start);
    canvas.addEventListener('mousedown', flap);
    window.addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); flap(); } });
    // idle render
    drawStars(); drawShip();
  }

  // ============================
  // Orbital Breaker (Brick Breaker)
  // ============================
  function initBreaker() {
    const canvas = document.getElementById('breaker-canvas');
    const ctx = canvas.getContext('2d');
    const startBtn = document.getElementById('breaker-start');
    const livesEl = document.getElementById('breaker-lives');
    const scoreEl = document.getElementById('breaker-score');

    const W = canvas.width;
    const H = canvas.height;

    let rafId = null;
    let running = false;
    let score = 0;
    let lives = 3;

    const paddle = { w: 90, h: 12, x: (W - 90) / 2, y: H - 24, speed: 6, left: false, right: false };
    const ball = { x: W / 2, y: H - 40, r: 7, vx: 3, vy: -4, stuck: true };
    const cols = 10, rows = 6, gap = 8, bw = (W - (cols + 1) * gap) / cols, bh = 18;
    let bricks = [];

    function resetLevel() {
      bricks = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          bricks.push({
            x: gap + c * (bw + gap),
            y: 60 + r * (bh + gap),
            w: bw,
            h: bh,
            hp: 1 + Math.floor(r / 2),
          });
        }
      }
    }

    function resetBall() {
      ball.x = paddle.x + paddle.w / 2;
      ball.y = paddle.y - ball.r - 2;
      ball.vx = (Math.random() * 2 + 2) * (Math.random() < 0.5 ? -1 : 1);
      ball.vy = -4;
      ball.stuck = true;
    }

    function start() {
      running = true;
      score = 0; lives = 3; livesEl.textContent = String(lives); scoreEl.textContent = String(score);
      resetLevel();
      resetBall();
      if (rafId) cancelAnimationFrame(rafId);
      loop();
    }

    function update() {
      // paddle movement
      if (paddle.left) paddle.x -= paddle.speed;
      if (paddle.right) paddle.x += paddle.speed;
      paddle.x = Math.max(0, Math.min(W - paddle.w, paddle.x));

      if (ball.stuck) {
        ball.x = paddle.x + paddle.w / 2;
        ball.y = paddle.y - ball.r - 2;
        return;
      }

      ball.x += ball.vx; ball.y += ball.vy;
      // walls
      if (ball.x < ball.r || ball.x > W - ball.r) ball.vx *= -1;
      if (ball.y < ball.r) ball.vy *= -1;

      // paddle collision
      if (ball.y + ball.r >= paddle.y && ball.x >= paddle.x && ball.x <= paddle.x + paddle.w && ball.vy > 0) {
        const hit = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
        ball.vx = hit * 4.2;
        ball.vy = -Math.abs(ball.vy);
      }

      // brick collision
      for (const br of bricks) {
        if (br.hp <= 0) continue;
        if (ball.x + ball.r > br.x && ball.x - ball.r < br.x + br.w && ball.y + ball.r > br.y && ball.y - ball.r < br.y + br.h) {
          // reflect roughly by which side is closer
          const overlapX = Math.min(Math.abs(ball.x + ball.r - br.x), Math.abs(br.x + br.w - (ball.x - ball.r)));
          const overlapY = Math.min(Math.abs(ball.y + ball.r - br.y), Math.abs(br.y + br.h - (ball.y - ball.r)));
          if (overlapX < overlapY) { ball.vx *= -1; } else { ball.vy *= -1; }
          br.hp -= 1; score += 10; scoreEl.textContent = String(score);
          break;
        }
      }

      // lose life
      if (ball.y - ball.r > H) {
        lives -= 1; livesEl.textContent = String(lives);
        if (lives <= 0) return gameOver();
        resetBall();
      }

      // win
      if (bricks.every(b => b.hp <= 0)) {
        resetLevel();
        resetBall();
      }
    }

    function drawBackground() {
      const grd = ctx.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#0b1026');
      grd.addColorStop(1, '#111736');
      ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
      // nebulas
      ctx.fillStyle = 'rgba(129,140,248,.15)';
      ctx.beginPath(); ctx.arc(W*0.25, 100, 80, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = 'rgba(110,231,255,.12)';
      ctx.beginPath(); ctx.arc(W*0.75, 160, 100, 0, Math.PI*2); ctx.fill();
    }

    function drawPaddle() {
      ctx.fillStyle = '#6ee7ff';
      ctx.fillRect(paddle.x, paddle.y, paddle.w, paddle.h);
    }

    function drawBall() {
      ctx.fillStyle = '#c7d2fe';
      ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fill();
    }

    function drawBricks() {
      for (const br of bricks) {
        if (br.hp <= 0) continue;
        ctx.fillStyle = br.hp === 1 ? '#818cf8' : '#a78bfa';
        ctx.fillRect(br.x, br.y, br.w, br.h);
      }
    }

    function loop() {
      update();
      drawBackground();
      drawPaddle();
      drawBall();
      drawBricks();
      if (running) rafId = requestAnimationFrame(loop);
    }

    function gameOver() {
      running = false; if (rafId) cancelAnimationFrame(rafId);
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0,0,W,H);
      ctx.fillStyle = '#e5e7eb'; ctx.textAlign = 'center';
      ctx.font = 'bold 24px Orbitron, sans-serif';
      ctx.fillText('All Lives Lost', W/2, H/2 - 20);
      ctx.font = '14px Orbitron, sans-serif';
      ctx.fillText('Press Start to play again', W/2, H/2 + 10);
    }

    // input
    window.addEventListener('keydown', (e) => {
      if (e.code === 'ArrowLeft') paddle.left = true;
      if (e.code === 'ArrowRight') paddle.right = true;
      if (e.code === 'Space' && ball.stuck) ball.stuck = false;
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'ArrowLeft') paddle.left = false;
      if (e.code === 'ArrowRight') paddle.right = false;
    });
    startBtn.addEventListener('click', start);

    // initial render
    drawBackground(); drawPaddle(); drawBall();
  }

  // boot
  window.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    initFlappy();
    initBreaker();
  });
})();


