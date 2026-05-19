const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d', { alpha: false });
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Matter.js のセットアップ
const Engine = Matter.Engine,
      Runner = Matter.Runner,
      Bodies = Matter.Bodies,
      World = Matter.World,
      Events = Matter.Events,
      Body = Matter.Body;

const engine = Engine.create();
engine.gravity.y = 0.2; // 穏やかな重力表現

let isAudioInitialized = false;
let synth;
let droneSynth;
let currentStyle = 'sketch'; // 'sketch', 'print', or 'neon' by default
let gridPattern;
let noisePattern;
let bgGridPattern;
let halftonePattern;

function createBgGridPattern() {
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 40;
    pCanvas.height = 40;
    const pctx = pCanvas.getContext('2d');
    pctx.fillStyle = '#e8e8e8'; // slightly off-white rough paper
    pctx.fillRect(0, 0, 40, 40);
    pctx.strokeStyle = '#cccccc';
    pctx.lineWidth = 1;
    pctx.beginPath();
    pctx.moveTo(0, 40); pctx.lineTo(40, 40);
    pctx.moveTo(40, 0); pctx.lineTo(40, 40);
    pctx.stroke();
    return ctx.createPattern(pCanvas, 'repeat');
}

function createHalftonePattern() {
    const pCanvas = document.createElement('canvas');
    const size = 256;
    pCanvas.width = size;
    pCanvas.height = size;
    const pctx = pCanvas.getContext('2d');
    pctx.clearRect(0, 0, size, size);
    pctx.fillStyle = '#222';
    
    // ベースとなる網点を非常に大きく（高解像度で）描画しておく
    const step = 64;
    for (let y = 0; y < size; y += step) {
        for (let x = 0; x < size; x += step) {
            pctx.beginPath();
            pctx.arc(x + step/2, y + step/2, step * 0.35, 0, Math.PI * 2);
            pctx.fill();
        }
    }
    return ctx.createPattern(pCanvas, 'repeat');
}

function createGridPattern() {
    const pCanvas = document.createElement('canvas');
    const size = 100;
    pCanvas.width = size;
    pCanvas.height = size;
    const pctx = pCanvas.getContext('2d');
    pctx.clearRect(0, 0, size, size);
    pctx.strokeStyle = '#222';
    pctx.lineWidth = 0.5;
    
    pctx.beginPath();
    pctx.moveTo(0, 0); pctx.lineTo(size, size);
    pctx.moveTo(size, 0); pctx.lineTo(0, size);
    pctx.stroke();
    
    return ctx.createPattern(pCanvas, 'repeat');
}

function createNoisePattern() {
    const nCanvas = document.createElement('canvas');
    nCanvas.width = 128;
    nCanvas.height = 128;
    const nctx = nCanvas.getContext('2d');
    const imgData = nctx.createImageData(128, 128);
    for (let i = 0; i < imgData.data.length; i += 4) {
        const noise = Math.random() * 255;
        imgData.data[i] = noise;
        imgData.data[i+1] = noise;
        imgData.data[i+2] = noise;
        imgData.data[i+3] = Math.random() * 100; // Semi-transparent noise
    }
    nctx.putImageData(imgData, 0, 0);
    return ctx.createPattern(nCanvas, 'repeat');
}

// パターンを初期化
gridPattern = createGridPattern();
noisePattern = createNoisePattern();
bgGridPattern = createBgGridPattern();
halftonePattern = createHalftonePattern();

// Tone.js の初期化（ユーザーアクションが必要）
document.getElementById('start-btn').addEventListener('click', async () => {
    await Tone.start();
    
    // アンビエントで柔らかい音色（サイン波）の設定
    synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sine" },
        envelope: {
            attack: 0.05,
            decay: 0.5,
            sustain: 0.2,
            release: 2
        }
    }).chain(
        new Tone.FeedbackDelay("8n.", 0.5), // ディレイによる空間的反復
        new Tone.Reverb({ decay: 8, wet: 0.6 }), // 深い空気感
        new Tone.Limiter(-2),
        Tone.Destination
    );
    
    synth.volume.value = -8;
    
    // 低音用の倍音豊かなドローンシンセ
    droneSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { 
            type: "fatsawtooth",
            count: 3,
            spread: 20
        },
        envelope: {
            attack: 0.5,
            decay: 0.5,
            sustain: 0.8,
            release: 4
        }
    }).chain(
        new Tone.Filter(300, "lowpass"),
        new Tone.Reverb({ decay: 10, wet: 0.8 }),
        new Tone.Limiter(-2),
        Tone.Destination
    );
    droneSynth.volume.value = -14; // うるさすぎないように調整
    
    isAudioInitialized = true;
    document.getElementById('ui-layer').style.opacity = '0';
    document.getElementById('clear-btn').style.opacity = '1';
    document.getElementById('clear-btn').style.pointerEvents = 'auto';
    document.getElementById('mode-btn').style.opacity = '1';
    document.getElementById('mode-btn').style.pointerEvents = 'auto';
    setTimeout(() => {
        document.getElementById('ui-layer').style.display = 'none';
    }, 1000);
});

document.getElementById('mode-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    
    if (currentStyle === 'sketch') currentStyle = 'print';
    else if (currentStyle === 'print') currentStyle = 'neon';
    else currentStyle = 'sketch';
    
    const btn = document.getElementById('mode-btn');
    
    if (currentStyle === 'sketch') {
        btn.innerText = 'Style: Sketch';
        document.body.style.background = '#eade57'; 
        btn.style.color = '#222';
        btn.style.borderColor = '#222';
        document.getElementById('clear-btn').style.color = '#222';
        document.getElementById('clear-btn').style.borderColor = '#222';
    } else if (currentStyle === 'print') {
        btn.innerText = 'Style: Print';
        document.body.style.background = '#e8e8e8'; 
        btn.style.color = '#222';
        btn.style.borderColor = '#222';
        document.getElementById('clear-btn').style.color = '#222';
        document.getElementById('clear-btn').style.borderColor = '#222';
    } else {
        btn.innerText = 'Style: Neon';
        document.body.style.background = 'radial-gradient(circle at center, #1b2033 0%, #0a0c14 100%)';
        btn.style.color = 'white';
        btn.style.borderColor = 'rgba(255,255,255,0.5)';
        document.getElementById('clear-btn').style.color = 'white';
        document.getElementById('clear-btn').style.borderColor = 'rgba(255,255,255,0.5)';
    }
});

// 管理用配列
let particles = [];
let currentOrbits = [];

// インタラクションステート
let isHolding = false;
let isDrawingPath = false;
let holdStartPos = { x: 0, y: 0 };
let holdStartTime = 0;
let drawPoints = [];

// 入力ハンドリング
function handleStart(x, y, e) {
    if(e.target.closest('button')) return;
    isHolding = true;
    isDrawingPath = false;
    holdStartPos = { x, y };
    holdStartTime = Date.now();
    drawPoints = [{ x, y }];
}

function handleMove(x, y) {
    if (!isHolding) return;
    const dist = Math.hypot(x - holdStartPos.x, y - holdStartPos.y);
    if (!isDrawingPath && dist > 15) {
        isDrawingPath = true; // ドラッグと判定
    }
    if (isDrawingPath) {
        drawPoints.push({ x, y });
    }
}

function handleEnd() {
    if (!isHolding) return;
    if (isDrawingPath) {
        if (drawPoints.length > 5) {
            createOrbitFromPoints(drawPoints);
        }
    } else {
        const duration = Date.now() - holdStartTime;
        spawnParticle(holdStartPos.x, holdStartPos.y, duration);
    }
    isHolding = false;
    isDrawingPath = false;
}

// イベントリスナーの登録
window.addEventListener('mousedown', (e) => handleStart(e.clientX, e.clientY, e));
window.addEventListener('mousemove', (e) => handleMove(e.clientX, e.clientY));
window.addEventListener('mouseup', handleEnd);

window.addEventListener('touchstart', (e) => handleStart(e.touches[0].clientX, e.touches[0].clientY, e), {passive: false});
window.addEventListener('touchmove', (e) => {
    e.preventDefault();
    handleMove(e.touches[0].clientX, e.touches[0].clientY);
}, {passive: false});
window.addEventListener('touchend', handleEnd);

// 全消去機能
document.getElementById('clear-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    particles.forEach(p => World.remove(engine.world, p));
    currentOrbits.forEach(o => World.remove(engine.world, o.body));
    particles = [];
    currentOrbits = [];
});

// 玉の生成（サイズ＝質量＝音程）
function spawnParticle(x, y, duration) {
    const clampedDuration = Math.min(Math.max(duration, 50), 5000);
    const radius = 5 + (clampedDuration / 5000) * 100; // 最大サイズを大幅に拡大
    const hue = 180 + (clampedDuration / 5000) * 160; // 180 (Cyan) to 340 (Red/Pink)
    const color = `hsl(${hue}, 80%, 75%)`;
    
    // ペンタトニックスケール (小さい＝高音、大きい＝低音)
    const scale = [
        "C5", "A4", "G4", "E4", "D4", 
        "C4", "A3", "G3", "E3", "D3", 
        "C3", "A2", "G2", "E2", "C2"
    ];
    const index = Math.floor((clampedDuration / 5000) * (scale.length - 1));
    const note = scale[index];

    const particle = Bodies.circle(x, y, radius, {
        restitution: 0.85, // 弾む
        friction: 0.05,
        frictionAir: 0.005, // 浮遊感
        density: radius * 0.002,
        plugin: {
            isParticle: true,
            note: note,
            color: color,
            hue: hue,
            radius: radius,
            flash: 0
        }
    });

    World.add(engine.world, particle);
    particles.push(particle);
}

// 指でなぞった軌跡から回転する枠（Orbit）を生成
function createOrbitFromPoints(points) {
    const walls = [];
    const orbitThickness = 15;
    
    // 描画間隔を間引きして負荷軽減＆形状の安定化
    const simplified = [points[0]];
    let lastPoint = points[0];
    for (let i = 1; i < points.length; i++) {
        const dx = points[i].x - lastPoint.x;
        const dy = points[i].y - lastPoint.y;
        if (Math.hypot(dx, dy) > 30) {
            simplified.push(points[i]);
            lastPoint = points[i];
        }
    }
    
    // 枠を閉じる
    simplified.push(simplified[0]);
    
    // 座標を元に剛体（壁）の集合を作る
    for (let i = 0; i < simplified.length - 1; i++) {
        const p1 = simplified[i];
        const p2 = simplified[i+1];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        
        const midX = p1.x + dx / 2;
        const midY = p1.y + dy / 2;
        
        const wall = Bodies.rectangle(midX, midY, dist + 4, orbitThickness, {
            angle: angle,
            isStatic: true,
            restitution: 0.2 // 壁自体の反発は低め（玉側のrestitutionで弾む）
        });
        walls.push(wall);
    }
    
    // パーツを1つのボディに結合
    const orbitBody = Body.create({
        parts: walls,
        isStatic: true
    });
    
    // ランダムな回転速度（有機的なゆったりとした回転）
    const speed = (Math.random() * 0.01) + 0.005;
    const dir = Math.random() > 0.5 ? 1 : -1;
    
    currentOrbits.push({
        body: orbitBody,
        rotationSpeed: speed * dir
    });
    
    World.add(engine.world, orbitBody);
}

// 毎フレームの更新処理
Events.on(engine, 'beforeUpdate', () => {
    // 枠を回転させ続ける
    currentOrbits.forEach(orbit => {
        Body.rotate(orbit.body, orbit.rotationSpeed);
    });
});

Events.on(engine, 'afterUpdate', () => {
    // 画面外に落ちた玉を削除
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        if (p.position.y > canvas.height + 2000 || p.position.x < -2000 || p.position.x > canvas.width + 2000) {
            World.remove(engine.world, p);
            particles.splice(i, 1);
        }
    }
});

// 衝突による発音判定
Events.on(engine, 'collisionStart', function(event) {
    if (!isAudioInitialized) return;
    const pairs = event.pairs;
    const now = Date.now();
    
    for (let i = 0; i < pairs.length; i++) {
        const { bodyA, bodyB } = pairs[i];
        
        let particle = null;
        if (bodyA.plugin && bodyA.plugin.isParticle) particle = bodyA;
        else if (bodyB.plugin && bodyB.plugin.isParticle) particle = bodyB;
        
        if (particle) {
            const velocity = Matter.Vector.magnitude(particle.velocity);
            
            // 連打によるノイズ防止
            if (!particle.plugin.lastHit || (now - particle.plugin.lastHit > 80)) {
                if (velocity > 1.0) { // 一定速度以上の衝突で発音
                    const note = particle.plugin.note;
                    const vol = Math.min(velocity / 20, 1);
                    
                    // 玉が大きい（＝低音）ほど、ドローンのように長くサスティーンさせる
                    // 半径(5〜105程度)に基づいて発音時間(秒)を計算
                    const duration = 0.2 + (particle.plugin.radius / 100) * 4.0;
                    
                    if (particle.plugin.radius > 50) {
                        // サイズが大きい（低音）場合は倍音豊かなドローンシンセを重ねる
                        droneSynth.triggerAttackRelease(note, duration, undefined, vol * 0.8);
                        synth.triggerAttackRelease(note, duration, undefined, vol * 0.4);
                    } else {
                        synth.triggerAttackRelease(note, duration, undefined, vol);
                    }
                    
                    // 視覚的なフラッシュ効果
                    particle.plugin.lastHit = now;
                    particle.plugin.flash = 1.0;
                }
            }
        }
    }
});

// ループ開始
const runner = Runner.create();
Runner.run(runner, engine);

// 独自レンダリングループ
function render() {
    if (currentStyle === 'sketch') {
        ctx.fillStyle = '#eade57';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (currentStyle === 'print') {
        ctx.fillStyle = bgGridPattern;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
        // 背景（残像効果＝Trails effect）
        ctx.fillStyle = 'rgba(10, 12, 20, 0.3)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 枠（Orbit）の描画
    ctx.globalCompositeOperation = 'source-over';
    currentOrbits.forEach(orbit => {
        const parts = orbit.body.parts;
        if (currentStyle === 'sketch') {
            ctx.strokeStyle = '#222';
            ctx.lineWidth = 0.5;
            
            const matrix = new DOMMatrix()
                .translate(orbit.body.position.x, orbit.body.position.y)
                .rotate(orbit.body.angle * 180 / Math.PI);
            gridPattern.setTransform(matrix);
            
            ctx.fillStyle = gridPattern; 
            
            ctx.beginPath();
            ctx.moveTo(parts[1].position.x, parts[1].position.y);
            for (let i = 2; i < parts.length; i++) {
                ctx.lineTo(parts[i].position.x, parts[i].position.y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        } else if (currentStyle === 'print') {
            ctx.strokeStyle = '#222';
            ctx.lineWidth = 1;
            
            // 枠の大きさに応じて網点（トーン）の大きさを変える
            const bounds = orbit.body.bounds;
            const size = Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y);
            // 巨大な元パターンを「縮小」して使うことで、ドットがボヤけずクッキリする
            const scaleFactor = Math.max(0.05, size / 800); 
            
            const matrix = new DOMMatrix()
                .translate(orbit.body.position.x, orbit.body.position.y)
                .rotate(orbit.body.angle * 180 / Math.PI)
                .scale(scaleFactor, scaleFactor);
            
            halftonePattern.setTransform(matrix);
            ctx.fillStyle = halftonePattern;
            
            ctx.beginPath();
            ctx.moveTo(parts[1].position.x, parts[1].position.y);
            for (let i = 2; i < parts.length; i++) {
                ctx.lineTo(parts[i].position.x, parts[i].position.y);
            }
            ctx.closePath();
            
            ctx.globalAlpha = 0.5; // 半透明の網点
            ctx.fill();
            ctx.globalAlpha = 1.0;
            ctx.stroke();
        } else {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'; 
            ctx.lineWidth = 4; // さっきの太さに戻す
            ctx.shadowBlur = 10;
            ctx.shadowColor = 'rgba(100, 200, 255, 0.5)'; 
            ctx.beginPath();
            ctx.moveTo(parts[1].position.x, parts[1].position.y);
            for (let i = 2; i < parts.length; i++) {
                ctx.lineTo(parts[i].position.x, parts[i].position.y);
            }
            ctx.closePath();
            ctx.stroke();
            ctx.shadowBlur = 0; 
        }
    });

    // ユーザーが現在描いている軌跡のプレビュー
    if (isDrawingPath && drawPoints.length > 0) {
        ctx.beginPath();
        ctx.moveTo(drawPoints[0].x, drawPoints[0].y);
        for(let i = 1; i < drawPoints.length; i++) {
            ctx.lineTo(drawPoints[i].x, drawPoints[i].y);
        }
        
        if (currentStyle === 'sketch' || currentStyle === 'print') {
            ctx.strokeStyle = '#222';
            ctx.lineWidth = 0.5;
            ctx.stroke();
        } else {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.shadowBlur = 10;
            ctx.shadowColor = 'white';
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
    }

    // 長押し中の玉サイズプレビュー
    if (isHolding && !isDrawingPath) {
        const duration = Date.now() - holdStartTime;
        const clampedDuration = Math.min(Math.max(duration, 50), 5000);
        const radius = 5 + (clampedDuration / 5000) * 100;
        
        ctx.beginPath();
        ctx.arc(holdStartPos.x, holdStartPos.y, radius, 0, Math.PI * 2);
        if (currentStyle === 'sketch' || currentStyle === 'print') {
            ctx.strokeStyle = '#222';
            ctx.lineWidth = 0.5;
        } else {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 2;
        }
        ctx.stroke();
    }

    // 玉（Particles）の描画
    ctx.globalCompositeOperation = currentStyle === 'neon' ? 'lighter' : 'source-over';
    particles.forEach(p => {
        if (currentStyle === 'sketch') {
            const r = p.plugin.radius;
            const h = p.plugin.hue;
            // 水彩・インク滲み風のグラデーション
            const grad = ctx.createRadialGradient(p.position.x, p.position.y, r * 0.2, p.position.x, p.position.y, r * 1.5);
            grad.addColorStop(0, `hsla(${h}, 80%, 40%, 1)`); // 中心は濃く
            grad.addColorStop(0.5, `hsla(${h}, 80%, 50%, 0.8)`);
            grad.addColorStop(1, `hsla(${h}, 80%, 60%, 0)`); // 輪郭は滲んで消える
            
            ctx.beginPath();
            ctx.arc(p.position.x, p.position.y, r * 1.5, 0, Math.PI * 2);
            ctx.fillStyle = grad;
            ctx.shadowBlur = 5;
            ctx.shadowColor = `hsla(${h}, 80%, 50%, 0.3)`;
            ctx.fill();
            ctx.shadowBlur = 0;
            
            // ノイズテクスチャの重ね掛け
            ctx.globalCompositeOperation = 'multiply';
            ctx.beginPath();
            // 滲みの少し内側までにノイズを適用
            ctx.arc(p.position.x, p.position.y, r * 1.1, 0, Math.PI * 2);
            ctx.fillStyle = noisePattern;
            
            // 玉の動きに合わせてノイズも移動・回転させる
            const noiseMatrix = new DOMMatrix()
                .translate(p.position.x, p.position.y)
                .rotate(p.angle * 180 / Math.PI);
            noisePattern.setTransform(noiseMatrix);
            
            ctx.globalAlpha = 0.6;
            ctx.fill();
            ctx.globalAlpha = 1.0;
            ctx.globalCompositeOperation = 'source-over';
            
            if (p.plugin.flash > 0) p.plugin.flash -= 0.1;
        } else if (currentStyle === 'print') {
            const r = p.plugin.radius;
            
            // 玉は純粋なベタ塗りにする
            ctx.beginPath();
            ctx.arc(p.position.x, p.position.y, r, 0, Math.PI * 2);
            ctx.fillStyle = p.plugin.color;
            ctx.fill();
            
            if (p.plugin.flash > 0) p.plugin.flash -= 0.1;
        } else {
            ctx.beginPath();
            ctx.arc(p.position.x, p.position.y, p.plugin.radius, 0, 2 * Math.PI);
            let color = p.plugin.color;
            if (p.plugin.flash > 0) {
                ctx.fillStyle = '#ffffff';
                ctx.shadowBlur = 20 + p.plugin.flash * 20; // 最初の設定に戻す
                ctx.shadowColor = '#ffffff';
                p.plugin.flash -= 0.05;
            } else {
                ctx.fillStyle = color;
                ctx.shadowBlur = 15; // 最初の設定に戻す
                ctx.shadowColor = color;
            }
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    });
    ctx.globalCompositeOperation = 'source-over';

    requestAnimationFrame(render);
}

// リサイズ対応
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

// レンダリング開始
render();
