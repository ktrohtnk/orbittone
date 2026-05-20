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

// Neon モード用音響
let neonSynth;
let neonDrone;
let neonNoise;

// Print モード用音響（Oval/Fennesz/Múmインスパイア）
let printSynth;        // Fennesz風ディストーションシンセ
let printDrone;        // 重厚なディストーションドローン
let printLiquidSynth;  // キラキラ・水滴音用シンセ
let printGlitch;       // Oval風グリッチノイズ源
let printGlitchEnv;    // グリッチ用エンベロープ
let printGlitchFilter;  // グリッチ用可変フィルター
let printCrackle;      // Múm風レコードパチパチ音
let printCrackleVol;   // レコードパチパチ音ボリューム


// 手書き風の滲み・ガタガタを描画するためのユーティリティ（シードと角度を使って固定化）
function drawJitterPolygon(ctx, points, jitter, seed, angle, closePath = true) {
    if (points.length === 0) return;
    let currentSeed = seed;
    function rand() {
        let x = Math.sin(currentSeed++) * 10000;
        return x - Math.floor(x);
    }
    
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    
    ctx.beginPath();
    let startX = 0, startY = 0;
    
    for (let i = 0; i < (closePath ? points.length : points.length - 1); i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const steps = Math.max(2, Math.floor(dist / 10)); // 10pxごとにポイントを追加
        
        if (i === 0) {
            let lx = (rand() - 0.5) * jitter;
            let ly = (rand() - 0.5) * jitter;
            startX = p1.x + lx * cosA - ly * sinA;
            startY = p1.y + lx * sinA + ly * cosA;
            ctx.moveTo(startX, startY);
        }
        
        for (let j = 1; j <= steps; j++) {
            // 閉じる場合、最後のセグメントの最終点は必ず開始点と完全に一致させる（棘・バリを防ぐため）
            if (closePath && i === points.length - 1 && j === steps) {
                ctx.lineTo(startX, startY);
            } else {
                const t = j / steps;
                const tx = p1.x + (p2.x - p1.x) * t;
                const ty = p1.y + (p2.y - p1.y) * t;
                let lx = (rand() - 0.5) * jitter;
                let ly = (rand() - 0.5) * jitter;
                ctx.lineTo(tx + lx * cosA - ly * sinA, ty + lx * sinA + ly * cosA);
            }
        }
    }
    if (closePath) ctx.closePath();
}

function drawJitterCircle(ctx, x, y, radius, jitter, seed, angle) {
    // printモード用：半径に応じた多角形（最小3角形〜最大12角形）を生成
    // 半径5〜105の範囲を3〜12角形にマッピングする
    const sides = Math.min(12, Math.max(3, Math.floor(3 + ((radius - 5) / 100) * 9)));
    
    const pts = [];
    for (let i = 0; i < sides; i++) {
        // 多角形全体が物理演算の回転（angle）に合わせて回るようにする
        const a = (i / sides) * Math.PI * 2 + angle;
        pts.push({
            x: x + Math.cos(a) * radius,
            y: y + Math.sin(a) * radius
        });
    }
    
    // 多角形の各辺を手書き風に歪ませて描画する
    drawJitterPolygon(ctx, pts, jitter, seed, angle, true);
}

function createBgGridPattern() {
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 20; // 40から20に変更してより細かく
    pCanvas.height = 20;
    const pctx = pCanvas.getContext('2d');
    pctx.fillStyle = '#e8e8e8'; // slightly off-white rough paper
    pctx.fillRect(0, 0, 20, 20);
    pctx.strokeStyle = '#cccccc';
    pctx.lineWidth = 0.5; // より細く
    pctx.beginPath();
    pctx.moveTo(0, 20); pctx.lineTo(20, 20);
    pctx.moveTo(20, 0); pctx.lineTo(20, 20);
    pctx.stroke();
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

// Tone.js の初期化（ユーザーアクションが必要）
document.getElementById('start-btn').addEventListener('click', async () => {
    await Tone.start();
    
    // --- Sketch Mode ---
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
    
    // --- Neon Mode ---
    // warm resonant steelpan tones with shimmering metallic overtones, soft mallet attack, tuned metallic percussion with bell-like sustain, inharmonic metallic harmonics, drifting overtones, organic pitch wobble, spectral metallic drone, ghostly harmonic particles, deep evolving resonance, soft tropical reverb dissolving into granular noise and harmonic debris
    neonSynth = new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 2.5, // よりスティールパンらしい金属的な響き
        modulationIndex: 4, // 響きの豊かさ
        oscillator: { type: "sine" },
        envelope: {
            attack: 0.005, // 瞬時すぎないアタックで太鼓っぽさを回避し「コンッ」という金属感へ
            decay: 1.5, // サスティーン長め
            sustain: 0.5, // Bell-like sustain
            release: 4.0 // フェードアウトを長く
        },
        modulation: { type: "triangle" }, // より鋭い金属音
        modulationEnvelope: {
            attack: 0.002, // 変調のアタックは鋭く
            decay: 1.0,
            sustain: 0.2,
            release: 3.0
        }
    }).chain(
        new Tone.Vibrato({ frequency: 1.0, depth: 0.03 }), // Organic pitch wobble
        new Tone.Chorus(4, 3.0, 0.4), // Drifting overtones / ghostly harmonic particles
        new Tone.PingPongDelay("4n", 0.4), // ディレイを長く、大きくしてアンビエント感を強化
        new Tone.Reverb({ decay: 12, preDelay: 0.1, wet: 0.75 }), // より深いアンビエント
        new Tone.Limiter(-2),
        Tone.Destination
    );
    neonSynth.volume.value = 6.0;

    // 低音部もスティールパンのような打楽器的な響きに (Bass Steelpan)
    neonDrone = new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 2.5,
        modulationIndex: 3, 
        oscillator: { type: "sine" },
        envelope: {
            attack: 0.01, 
            decay: 2.0,
            sustain: 0.6, 
            release: 5.0 // サスティーン長め
        },
        modulation: { type: "triangle" },
        modulationEnvelope: {
            attack: 0.01,
            decay: 1.5,
            sustain: 0.3,
            release: 4.0
        }
    }).chain(
        new Tone.Chorus(4, 2.5, 0.5),
        new Tone.FeedbackDelay("2n", 0.6), // 深いディレイ
        new Tone.Reverb({ decay: 15, wet: 0.85 }), // 深いアンビエント
        new Tone.Limiter(-2),
        Tone.Destination
    );
    neonDrone.volume.value = -1.0; 

    // 消えゆく際のチリチリとした綺麗なノイズ（細かい粒）
    neonNoise = new Tone.NoiseSynth({
        noise: { type: "white" }, // ホワイトノイズに変更
        envelope: {
            attack: 2.0, // 音が減衰する頃にゆっくり立ち上がる
            decay: 1.0,
            sustain: 1.0,
            release: 6.0 // 長くフェードアウト
        }
    }).chain(
        new Tone.Filter(8000, "highpass"), // 細かい粒のみを通す
        new Tone.FeedbackDelay("8n", 0.4),
        new Tone.Reverb({ decay: 15, wet: 1.0 }), // リバーブを最強に
        new Tone.Limiter(-2),
        Tone.Destination
    );
    neonNoise.volume.value = -20; // うるさくないように控えめに調整

    // --- Print Mode (Oval/Fennesz/Múm inspired Noise-Electronica) ---
    // Fennesz風ディストーション・フィードバックギターシンセ
    const printDist = new Tone.Distortion(0.55); // ほどよい歪み
    const printCrusher = new Tone.BitCrusher(6); // ローファイ感
    const printFilter = new Tone.Filter(1800, "lowpass");
    const printDelay = new Tone.FeedbackDelay("6n", 0.65); // 高いフィードバック値でノイズを誘発
    const printReverb = new Tone.Reverb({ decay: 10, wet: 0.75 }); // 空間を飽和させる深残響
    
    printSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sawtooth" }, // 歪ませるためのこぎり波
        envelope: {
            attack: 0.15,
            decay: 0.3,
            sustain: 0.6,
            release: 3.5
        }
    }).chain(printDist, printCrusher, printFilter, printDelay, printReverb, new Tone.Limiter(-2), Tone.Destination);
    printSynth.volume.value = -16; // 歪みで音が大きくなるため音量は控えめ

    // 重厚なディストーションドローン（大きい玉用）
    printDrone = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "square" },
        envelope: {
            attack: 0.8,
            decay: 0.5,
            sustain: 0.7,
            release: 4.5
        }
    }).chain(
        new Tone.Filter(250, "lowpass"),
        new Tone.Distortion(0.3),
        new Tone.Reverb({ decay: 8, wet: 0.8 }),
        new Tone.Limiter(-2),
        Tone.Destination
    );
    printDrone.volume.value = -20;

    // キラキラ・水滴（ピチャピチャ）音用シンセ
    printLiquidSynth = new Tone.Synth({
        oscillator: { type: "sine" }, // クリーンなサイン波
        envelope: {
            attack: 0.002,
            decay: 0.08,
            sustain: 0,
            release: 0.12
        }
    }).chain(
        new Tone.FeedbackDelay("8n.", 0.6), // 空間的きらめき
        new Tone.Reverb({ decay: 6, wet: 0.65 }), // 水中感のあるみずみずしい残響
        new Tone.Limiter(-2),
        Tone.Destination
    );
    printLiquidSynth.volume.value = -11;

    // Oval風グリッチノイズジェネレータ
    printGlitch = new Tone.Noise("pink");
    printGlitchEnv = new Tone.AmplitudeEnvelope({
        attack: 0.001,
        decay: 0.015,
        sustain: 0,
        release: 0.015
    });
    printGlitchFilter = new Tone.Filter({
        type: "bandpass",
        frequency: 5000,
        Q: 8
    });
    
    printGlitch.connect(printGlitchEnv);
    printGlitchEnv.connect(printGlitchFilter);
    printGlitchFilter.chain(
        new Tone.FeedbackDelay("16n", 0.3),
        new Tone.Reverb({ decay: 3, wet: 0.4 }),
        new Tone.Limiter(-2),
        Tone.Destination
    );
    printGlitch.start(); // 常時再生させ、エンベロープで発音させる

    // Múm風アナログレコードパチパチ音（背景音）
    printCrackle = new Tone.Noise("white");
    printCrackleVol = new Tone.Volume(-45); // かすかに聴こえるレベル
    const printCrackleFilter = new Tone.Filter({
        type: "bandpass",
        frequency: 9500,
        Q: 6
    });
    
    printCrackle.connect(printCrackleFilter);
    printCrackleFilter.connect(printCrackleVol);
    printCrackleVol.toDestination();
    
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
    
    // Toggle order: sketch -> neon -> print
    if (currentStyle === 'sketch') currentStyle = 'neon';
    else if (currentStyle === 'neon') currentStyle = 'print';
    else currentStyle = 'sketch';
    
    const btn = document.getElementById('mode-btn');
    
    if (currentStyle === 'sketch') {
        btn.innerText = 'Style: Sketch';
        document.body.style.background = '#eade57'; 
        btn.style.color = '#222';
        btn.style.borderColor = '#222';
        document.getElementById('clear-btn').style.color = '#222';
        document.getElementById('clear-btn').style.borderColor = '#222';
    } else if (currentStyle === 'neon') {
        btn.innerText = 'Style: Neon';
        document.body.style.background = 'radial-gradient(circle at center, #1b2033 0%, #0a0c14 100%)';
        btn.style.color = 'white';
        btn.style.borderColor = 'rgba(255,255,255,0.5)';
        document.getElementById('clear-btn').style.color = 'white';
        document.getElementById('clear-btn').style.borderColor = 'rgba(255,255,255,0.5)';
    } else {
        btn.innerText = 'Style: Print';
        document.body.style.background = '#e8e8e8'; 
        btn.style.color = '#222';
        btn.style.borderColor = '#222';
        document.getElementById('clear-btn').style.color = '#222';
        document.getElementById('clear-btn').style.borderColor = '#222';
    }

    // モード切り替え時の遷移サウンド演出 & 定常ノイズコントロール
    if (isAudioInitialized) {
        if (printCrackle) printCrackle.stop();

        if (currentStyle === 'sketch') {
            // 優しいサイン波のサイン音
            synth.triggerAttackRelease("E5", "4n", undefined, 0.4);
        } else if (currentStyle === 'neon') {
            // UIとしての控えめな切り替え音（音量と響きを最小限に抑えた単音）
            neonSynth.triggerAttackRelease("A4", "8n", undefined, 0.05);
        } else if (currentStyle === 'print') {
            // Múm風レコードクラックルの再生開始
            printCrackle.start();
            // Oval風の微細なプチプチグリッチスイープ
            if (printGlitchFilter && printGlitchEnv) {
                printGlitchFilter.frequency.value = 4000;
                printGlitchEnv.triggerAttackRelease(0.04, undefined, 0.6);
                setTimeout(() => {
                    printGlitchFilter.frequency.value = 9000;
                    printGlitchEnv.triggerAttackRelease(0.015, undefined, 0.6);
                }, 40);
                setTimeout(() => {
                    printGlitchFilter.frequency.value = 14000;
                    printGlitchEnv.triggerAttackRelease(0.01, undefined, 0.4);
                }, 80);
            }
        }
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
let currentHoldSeed = 0;

// 入力ハンドリング
function handleStart(x, y, e) {
    if(e.target.closest('button')) return;
    isHolding = true;
    isDrawingPath = false;
    holdStartPos = { x, y };
    holdStartTime = Date.now();
    drawPoints = [{ x, y }];
    currentHoldSeed = Math.random() * 10000;
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
            flash: 0,
            seed: currentHoldSeed
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
    
    // 描いた軌跡の頂点を、結合されたボディのローカル座標として保存する（描画時に正確な形を復元するため）
    const localPoints = simplified.map(p => ({
        x: p.x - orbitBody.position.x,
        y: p.y - orbitBody.position.y
    }));
    
    // ランダムな回転速度（有機的なゆったりとした回転）
    const speed = (Math.random() * 0.01) + 0.005;
    const dir = Math.random() > 0.5 ? 1 : -1;
    
    // リキテンスタイン風ハーフトーンのための網点の間隔（枠の大きさに比例、細かめにする）
    const size = Math.max(orbitBody.bounds.max.x - orbitBody.bounds.min.x, orbitBody.bounds.max.y - orbitBody.bounds.min.y);
    const toneSpacing = Math.max(5, size / 25); // 最低5px、全体的に細かく
    
    currentOrbits.push({
        body: orbitBody,
        rotationSpeed: speed * dir,
        toneSpacing: toneSpacing,
        localPoints: localPoints, // なぞった形を完全に保持
        maxRadius: size * 1.5, // 半径の最大値を固定してズレを防ぐ
        seed: Math.random() * 10000
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
                    
                    if (currentStyle === 'sketch') {
                        // --- Sketch: 優しいアコースティックアンビエント ---
                        if (particle.plugin.radius > 50) {
                            droneSynth.triggerAttackRelease(note, duration, undefined, vol * 0.8);
                            synth.triggerAttackRelease(note, duration, undefined, vol * 0.4);
                        } else {
                            synth.triggerAttackRelease(note, duration, undefined, vol);
                        }
                    } else if (currentStyle === 'neon') {
                        // --- Neon: 金属的・スペーシーアンビエント ---
                        if (particle.plugin.radius > 50) {
                            neonDrone.triggerAttackRelease(note, duration, undefined, vol * 0.7);
                            neonSynth.triggerAttackRelease(note, duration * 0.5, undefined, vol * 0.5);
                            neonNoise.triggerAttackRelease(duration, undefined, vol * 0.3); // 減衰時にノイズを鳴らす
                        } else {
                            neonSynth.triggerAttackRelease(note, duration * 0.3, undefined, vol);
                        }
                    } else if (currentStyle === 'print') {
                        // --- Print: ノイズエレクトロニカ (Oval/Fennesz/Múm) ---
                        
                        const isOneClick = particle.plugin.radius < 15; // ワンクリック（タップ）で即生成される極小玉
                        
                        if (isOneClick) {
                            // 【ワンクリックの極小玉】
                            // 歪みシンセを避け、クリーンな水滴ピチャ音（スイープサイン波）をトリガー
                            const freq = Tone.Frequency(note).toFrequency();
                            printLiquidSynth.triggerAttackRelease(freq, 0.08, undefined, vol * 0.85);
                            
                            // ピッチスイープ（1.6倍の超高音から本来の周波数へ0.03秒で急降下させ、みずみずしい「ピチャッ」感を出す）
                            printLiquidSynth.frequency.setValueAtTime(freq * 1.6, Tone.now());
                            printLiquidSynth.frequency.exponentialRampToValueAtTime(freq, Tone.now() + 0.03);
                            
                            // モード切り替え時に似た「プチプチパチッ」というきらめく高速グリッチをトリガー
                            if (printGlitchFilter && printGlitchEnv) {
                                printGlitchFilter.frequency.value = 3500 + Math.random() * 1000;
                                printGlitchEnv.triggerAttackRelease(0.03, undefined, vol * 0.8);
                                setTimeout(() => {
                                    printGlitchFilter.frequency.value = 8500 + Math.random() * 1000;
                                    printGlitchEnv.triggerAttackRelease(0.015, undefined, vol * 0.7);
                                }, 30);
                                setTimeout(() => {
                                    printGlitchFilter.frequency.value = 13500 + Math.random() * 1000;
                                    printGlitchEnv.triggerAttackRelease(0.01, undefined, vol * 0.5);
                                }, 60);
                            }
                        } else {
                            // 【長押しで少しでも大きくした中・大サイズの玉】
                            // Fennesz風の歪みギターアンビエント音を復活
                            if (particle.plugin.radius > 50) {
                                printDrone.triggerAttackRelease(note, duration, undefined, vol * 0.8);
                                printSynth.triggerAttackRelease(note, duration * 0.8, undefined, vol * 0.4);
                            } else {
                                printSynth.triggerAttackRelease(note, duration * 0.4, undefined, vol * 0.7);
                            }
                            
                            // 通常のグリッチクリック（マイルドなノイズ）をブレンド
                            if (printGlitchEnv && printGlitchFilter) {
                                const glitchFreq = Math.min(1500 + (105 - particle.plugin.radius) * 100 + Math.random() * 2000, 9500);
                                printGlitchFilter.frequency.value = glitchFreq;
                                
                                const glitchVol = vol * (0.5 - (particle.plugin.radius / 200));
                                if (glitchVol > 0.02) {
                                    printGlitchEnv.triggerAttackRelease(0.003 + Math.random() * 0.01, undefined, glitchVol);
                                }
                            }
                        }
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
        // ローカル座標から現在の回転・位置を適用してワールド座標の頂点を計算
        const cosA = Math.cos(orbit.body.angle);
        const sinA = Math.sin(orbit.body.angle);
        const pts = orbit.localPoints.map(p => ({
            x: orbit.body.position.x + (p.x * cosA - p.y * sinA),
            y: orbit.body.position.y + (p.x * sinA + p.y * cosA)
        }));

        if (currentStyle === 'sketch') {
            ctx.strokeStyle = '#222';
            ctx.lineWidth = 0.5;
            
            const matrix = new DOMMatrix()
                .translate(orbit.body.position.x, orbit.body.position.y)
                .rotate(orbit.body.angle * 180 / Math.PI);
            gridPattern.setTransform(matrix);
            
            ctx.fillStyle = gridPattern; 
            
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) {
                ctx.lineTo(pts[i].x, pts[i].y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        } else if (currentStyle === 'print') {
            // ベースの手書き風の線（なぞった時と同じ太さ 1.0）
            ctx.strokeStyle = '#222';
            ctx.lineWidth = 1.0;
            drawJitterPolygon(ctx, pts, 1.5, orbit.seed, orbit.body.angle);
            ctx.stroke();
            
            // 滲み（インク溜まり）効果のための少し太くて薄い線（控えめに）
            ctx.strokeStyle = 'rgba(34, 34, 34, 0.15)';
            ctx.lineWidth = 2.0;
            drawJitterPolygon(ctx, pts, 2.5, orbit.seed + 1, orbit.body.angle);
            ctx.stroke();
            
        } else {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'; 
            ctx.lineWidth = 2; // なぞった時と同じ太さ 2 に統一
            ctx.shadowBlur = 10;
            ctx.shadowColor = 'rgba(100, 200, 255, 0.5)'; 
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) {
                ctx.lineTo(pts[i].x, pts[i].y);
            }
            ctx.closePath();
            ctx.stroke();
            ctx.shadowBlur = 0; 
        }
    });

    // ユーザーが現在描いている軌跡のプレビュー
    if (isDrawingPath && drawPoints.length > 0) {
        if (currentStyle === 'print') {
            ctx.strokeStyle = '#222';
            ctx.lineWidth = 1.0;
            // 描画中は固定シードと角度0を渡してブレないようにする
            drawJitterPolygon(ctx, drawPoints, 1.5, 0, 0, false);
            ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.moveTo(drawPoints[0].x, drawPoints[0].y);
            for(let i = 1; i < drawPoints.length; i++) {
                ctx.lineTo(drawPoints[i].x, drawPoints[i].y);
            }
            
            if (currentStyle === 'sketch') {
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
    }

    // 長押し中の玉サイズプレビュー
    if (isHolding && !isDrawingPath) {
        const duration = Date.now() - holdStartTime;
        const clampedDuration = Math.min(Math.max(duration, 50), 5000);
        const radius = 5 + (clampedDuration / 5000) * 100;
        
        if (currentStyle === 'print') {
            const hue = 180 + (clampedDuration / 5000) * 160;
            ctx.strokeStyle = `hsl(${hue}, 80%, 75%)`;
            ctx.lineWidth = 4.0;
            // プレビュー時と生成時でシード値とジッター量（歪み具合）を完全に一致させる
            drawJitterCircle(ctx, holdStartPos.x, holdStartPos.y, radius, radius * 0.15 + 1.5, currentHoldSeed, 0);
            ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.arc(holdStartPos.x, holdStartPos.y, radius, 0, Math.PI * 2);
            if (currentStyle === 'sketch') {
                ctx.strokeStyle = '#222';
                ctx.lineWidth = 0.5;
            } else {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.lineWidth = 2;
            }
            ctx.stroke();
        }
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
            
            // 玉の形が均一にならないよう、半径に応じた強めのジッター（歪み）を加える
            drawJitterCircle(ctx, p.position.x, p.position.y, r, r * 0.15 + 1.5, p.plugin.seed, p.angle);
            
            // 塗りつぶしなし、色付きの太い線のみ
            ctx.strokeStyle = p.plugin.color;
            ctx.lineWidth = 4.0;
            ctx.stroke();
            
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
