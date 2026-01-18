const Engine = Matter.Engine, Render = Matter.Render, Runner = Matter.Runner,
          Bodies = Matter.Bodies, Composite = Matter.Composite, Constraint = Matter.Constraint,
          Events = Matter.Events, Vector = Matter.Vector;

    let engine, render, runner;
    let players = [];
    let gameActive = false;
    let startTime;
    let finishList = [];
    let moveInterval;
    
    let isSlowMotion = false; 
    let currentZoomLevel = 1.0; 
    let liquidPhase = 0; 

    const MAP_HEIGHT = 1500;
    let MAP_WIDTH = 600; 
    const GOAL_Y = MAP_HEIGHT - 100;

    function goToStep2() {
        const input = document.getElementById('player-count');
        const errEl = document.getElementById('error-msg');
        let count = parseInt(input.value);

        if (isNaN(count) || count < 2 || count > 30) {
            errEl.innerText = "🚫 참가 인원은 2명에서 30명 사이여야 합니다.";
            input.style.border = "2px solid #e74c3c";
            return;
        }123123
        
        errEl.innerText = "";
        input.style.border = "1px solid #7f8c8d";

        const container = document.getElementById('player-inputs');
        container.innerHTML = '';
        container.style.display = 'grid';
        container.style.gridTemplateColumns = '1fr 1fr';
        container.style.gap = '5px';


        for (let i = 0; i < count; i++) {
            const inputEl = document.createElement('input');
            inputEl.type = 'text';
            inputEl.placeholder = `선수 ${i + 1}`;
            inputEl.value = `Player ${i + 1}`;
            inputEl.style.margin = '0';
            inputEl.style.width = '100%';
            container.appendChild(inputEl);
        }
        document.getElementById('step-1').classList.add('hidden');
        document.getElementById('step-2').classList.remove('hidden');
    }

    function prepareGame() {
        const inputs = document.querySelectorAll('#player-inputs input');
        const names = Array.from(inputs).map(i => i.value || 'Unknown');
        document.getElementById('step-2').classList.add('hidden');
        document.getElementById('top-share-btn').style.display = 'none'; 
        initPhysics(names); 
        startCountdown();
    }

    function startCountdown() {
        const cdScreen = document.getElementById('countdown-screen');
        const cdText = document.getElementById('countdown-text');
        cdScreen.classList.remove('hidden');
        let count = 3;
        cdText.innerText = count; cdText.style.color = '#e74c3c';
        const timer = setInterval(() => {
            count--;
            if (count > 0) {
                cdText.innerText = count;
                if(count === 2) cdText.style.color = '#e67e22';
                if(count === 1) cdText.style.color = '#f1c40f';
            } else if (count === 0) {
                cdText.innerText = "GO!"; cdText.style.color = '#2ecc71';
            } else {
                clearInterval(timer);
                cdScreen.classList.add('hidden');
                startGameLogic();
            }
        }, 1000);
    }

    function initPhysics(names) {
        if (runner) Runner.stop(runner);
        if (engine) Engine.clear(engine);
        document.getElementById('game-canvas-wrapper').innerHTML = '';
        document.getElementById('overlay-layer').innerHTML = '';

        const frameEl = document.getElementById('mobile-frame');
        const frameW = frameEl.clientWidth;
        const frameH = frameEl.clientHeight;
        
        MAP_WIDTH = Math.max(frameW - 20, names.length * 45);

        engine = Engine.create();
        engine.world.gravity.y = 1.2;
        engine.timing.timeScale = 1;
        
        currentZoomLevel = 1.0;
        isSlowMotion = false;

        render = Render.create({
            element: document.getElementById('game-canvas-wrapper'),
            engine: engine,
            options: { width: frameW, height: frameH, wireframes: false, background: '#2c3e50', hasBounds: true }
        });

        const wallOpts = { isStatic: true, render: { fillStyle: '#34495e' } };
        Composite.add(engine.world, [
                // 바닥 (충분히 넓게)
                Bodies.rectangle(MAP_WIDTH/2, MAP_HEIGHT + 50, MAP_WIDTH * 2, 100, wallOpts), 
                // 왼쪽 벽 (0 위치)
                Bodies.rectangle(0, MAP_HEIGHT/2, 40, MAP_HEIGHT*2, wallOpts), 
                // 오른쪽 벽 (MAP_WIDTH 위치)
                Bodies.rectangle(MAP_WIDTH, MAP_HEIGHT/2, 40, MAP_HEIGHT*2, wallOpts), 
                // 결승선 (보이지 않는 센서)
                Bodies.rectangle(MAP_WIDTH/2, GOAL_Y, MAP_WIDTH, 10, { isStatic: true, isSensor: true, render: { visible: false } })
        ]);

        players = [];
        const availableWidth = MAP_WIDTH - 100;
        const spacing = availableWidth / (names.length + 1);        
        
        names.forEach((name, i) => {
            const x = (MAP_WIDTH / 2) - ((names.length - 1) * spacing / 2) + (i * spacing);
            createPlayer(x, 150, name, i);
        });
        
        initMinimap(names);

        Render.run(render);
        runner = Runner.create();
        Runner.run(runner, engine);

        Events.on(runner, 'afterUpdate', () => {
            if(!gameActive && finishList.length === names.length) return;
            updateCameraAndSpeed(); 
            updateMinimap();
            updateOverlay();
            checkFinish();
        });

        // 렌더링 이벤트 연결: 팔다리 그리기 + 용암 그리기
        Events.on(render, 'afterRender', () => {
             renderLiquidLimbs();
             renderLava();
        });
    }

    function createPlayer(x, y, name, index) {
        const color = `hsl(${index * 137.5}, 85%, 60%)`;
        const group = Matter.Body.nextGroup(true);

        const torso = Bodies.rectangle(x, y, 20, 30, { collisionFilter: { group }, render: { fillStyle: color } });
        const limbOpts = { collisionFilter: { group }, render: { fillStyle: '#ecf0f1' } };
        const lh = Bodies.circle(x - 15, y - 20, 5, limbOpts);
        const rh = Bodies.circle(x + 15, y - 20, 5, limbOpts);
        const lf = Bodies.circle(x - 10, y + 25, 5, limbOpts);
        const rf = Bodies.circle(x + 10, y + 25, 5, limbOpts);

        const join = (bodyA, bodyB, pointA) => Constraint.create({ 
            bodyA, bodyB, pointA, 
            stiffness: 0.9, damping: 0.1, length: 15, 
            render: { visible: false } 
        });

        const joints = [
            join(torso, lh, { x: -8, y: -10 }), 
            join(torso, rh, { x: 8, y: -10 }),  
            join(torso, lf, { x: -8, y: 10 }),  
            join(torso, rf, { x: 8, y: 10 })    
        ];

        Composite.add(engine.world, [torso, lh, rh, lf, rf, ...joints]);

        const nameTag = document.createElement('div');
        nameTag.className = 'name-tag';
        nameTag.innerText = name;
        document.getElementById('overlay-layer').appendChild(nameTag);

        const playerObj = { 
            name, color, 
            parts: { torso, lh, rh, lf, rf }, 
            constraints: {}, joints, finished: false, nameTagEl: nameTag 
        };
        ['lh', 'rh', 'lf', 'rf'].forEach(k => stick(playerObj, k));
        players.push(playerObj);
    }

    function stick(player, partKey) {
        const body = player.parts[partKey];
        showSlapEffect(body.position.x, body.position.y);
        const c = Constraint.create({
            bodyB: body, pointB: { x: 0, y: 0 },
            pointA: { x: body.position.x, y: body.position.y },
            stiffness: 0.8, length: 0,
            render: { strokeStyle: 'rgba(255,255,255,0.4)', lineWidth: 1 }
        });
        Composite.add(engine.world, c);
        player.constraints[partKey] = c;
    }

    function showSlapEffect(x, y) {
        const el = document.createElement('div');
        el.className = 'slap-effect';
        el.innerText = ['찰싹!', '쩍!', '착!', '딱!'][Math.floor(Math.random()*4)];
        el.dataset.worldX = x; el.dataset.worldY = y;
        document.getElementById('overlay-layer').appendChild(el);
        setTimeout(() => el.remove(), 600);
    }

    function startGameLogic() {
        gameActive = true;
        startTime = Date.now();
        finishList = [];
        isSlowMotion = false;
        if (moveInterval) clearInterval(moveInterval);
        moveInterval = setInterval(movementLogic, 300);
    }

    function movementLogic() {
        if (!gameActive) return;
        players.forEach(p => {
            if (p.finished) return;
            const torsoY = p.parts.torso.position.y;
            const limbs = ['lh', 'rh', 'lf', 'rf'];
            
            let limbsAbove = 0;
            limbs.forEach(k => { if (p.parts[k].position.y < torsoY) limbsAbove++; });

            let chance = 0;
            if (limbsAbove === 0) chance = 0.8;
            else if (limbsAbove === 1) chance = 0.6;
            else if (limbsAbove === 2) chance = 0.55;
            else if (limbsAbove >= 3) chance = 0.5;

            limbs.forEach(k => {
                if (p.constraints[k] && Math.random() < chance) {
                    Composite.remove(engine.world, p.constraints[k]);
                    p.constraints[k] = null;
                    setTimeout(() => {
                        if (!p.finished && !p.constraints[k]) stick(p, k);
                    }, 400 + Math.random() * 400);
                }
            });
        });
    }

    function getWorldToScreen(x, y, bounds, canvas) {
        const scaleX = canvas.width / (bounds.max.x - bounds.min.x);
        const scaleY = canvas.height / (bounds.max.y - bounds.min.y);
        return {
            x: (x - bounds.min.x) * scaleX,
            y: (y - bounds.min.y) * scaleY
        };
    }

    function updateOverlay() {
        const canvas = document.querySelector('#game-canvas-wrapper canvas');
        if(!canvas) return;
        const bounds = render.bounds;

        players.forEach(p => {
            if (p.nameTagEl && !p.finished) {
                const pos = getWorldToScreen(p.parts.torso.position.x, p.parts.torso.position.y, bounds, canvas);
                p.nameTagEl.style.left = `${pos.x}px`;
                p.nameTagEl.style.top = `${pos.y}px`;
                p.nameTagEl.style.fontSize = `${Math.max(8, 12 / currentZoomLevel)}px`; 

            } else if (p.finished && p.nameTagEl) {
                p.nameTagEl.style.display = 'none';
            }
        });

        const effects = document.querySelectorAll('.slap-effect');
        effects.forEach(el => {
            const wx = parseFloat(el.dataset.worldX);
            const wy = parseFloat(el.dataset.worldY);
            const pos = getWorldToScreen(wx, wy, bounds, canvas);
            el.style.left = `${pos.x}px`;
            el.style.top = `${pos.y}px`;
            const newSize = Math.max(5, 14 / currentZoomLevel);
            el.style.fontSize = `${newSize}px`;
        });
    }

    function initMinimap(names) {
        const mm = document.getElementById('minimap');
        mm.style.display = 'block';
        mm.innerHTML = '<div class="mm-goal"></div>';
        players.forEach((p, i) => {
            const dot = document.createElement('div');
            dot.className = 'mm-player'; dot.style.backgroundColor = p.color; dot.id = `mm-dot-${i}`;
            const nameSpan = document.createElement('span');
            nameSpan.className = 'mm-name always-show'; nameSpan.innerText = p.name;
            dot.appendChild(nameSpan); mm.appendChild(dot);
        });
    }
    function updateMinimap() {
        players.forEach((p, i) => {
            const dot = document.getElementById(`mm-dot-${i}`);
            if (dot && !p.finished) {
                const pct = Math.min(100, Math.max(0, (p.parts.torso.position.y / GOAL_Y) * 100));
                dot.style.top = `${pct}%`;
            } else if (p.finished && dot) {
                dot.style.top = '100%';
            }
        });
    }

    function renderLiquidLimbs() {
        const ctx = render.context;
        liquidPhase += 0.2; 

        Render.startViewTransform(render);

        players.forEach(p => {
            if (p.finished) return; 
            if (!p.parts.torso.id) return; 

            ctx.strokeStyle = p.color;
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            p.joints.forEach((constraint, i) => {
                const bodyA = constraint.bodyA;
                const bodyB = constraint.bodyB;
                if(!bodyA || !bodyB) return;

                const start = Vector.add(bodyA.position, Vector.rotate(constraint.pointA, bodyA.angle));
                const end = Vector.add(bodyB.position, Vector.rotate(constraint.pointB, bodyB.angle));
                
                const mid = Vector.mult(Vector.add(start, end), 0.5);
                
                const offsetAmount = 4;
                const wobX = Math.sin(liquidPhase + i * 1.5) * offsetAmount;
                const wobY = Math.cos(liquidPhase + i * 1.5) * offsetAmount;

                ctx.beginPath();
                ctx.moveTo(start.x, start.y);
                ctx.quadraticCurveTo(mid.x + wobX, mid.y + wobY, end.x, end.y);
                ctx.stroke();
            });
        });

        Render.endViewTransform(render);
    }

    // [신규 기능] 용암 웨이브 그리기 함수
    function renderLava() {
        const ctx = render.context;
        const bounds = render.bounds;

        // 3개의 레이어 설정 (뒤쪽부터 앞쪽 순)
        const layers = [
            { color: 'rgba(192, 57, 43, 0.8)', amp: 30, freq: 0.01, speed: 0.02, yOff: 0 }, // 어두운 빨강
            { color: 'rgba(231, 76, 60, 0.8)', amp: 25, freq: 0.015, speed: 0.03, yOff: 15 }, // 중간 빨강
            { color: 'rgba(243, 156, 18, 0.8)', amp: 20, freq: 0.02, speed: 0.04, yOff: 30 }  // 밝은 주황
        ];

        Render.startViewTransform(render);

        layers.forEach(layer => {
            ctx.fillStyle = layer.color;
            ctx.beginPath();
            
            // 화면에 보이는 영역보다 조금 더 넓게 그림 (끊김 방지)
            const startX = bounds.min.x - 200;
            const endX = bounds.max.x + 200;
            
            // 왼쪽 하단 시작점
            ctx.moveTo(startX, MAP_HEIGHT + 500); 

            // 왼쪽 상단 (웨이브 시작)
            // x값에 따라 y값을 sin 함수로 변화시킴
            for (let x = startX; x <= endX; x += 30) {
                const y = GOAL_Y + layer.yOff + Math.sin(x * layer.freq + liquidPhase * layer.speed * 0.5) * layer.amp;
                ctx.lineTo(x, y);
            }

            // 오른쪽 하단 및 닫기
            ctx.lineTo(endX, MAP_HEIGHT + 500);
            ctx.closePath();
            ctx.fill();
        });

        Render.endViewTransform(render);
    }

    function updateCameraAndSpeed() {
        // 아직 완주하지 않은 선수들만 추적
        let targets = players.filter(p => !p.finished);
        
        // 만약 모두 완주했다면, 완주한 선수들 전체를 보여줌 (결과 화면 배경용)
        if (targets.length === 0) targets = players; 
        if (targets.length === 0) return;
        let minY = Infinity, maxY = -Infinity;
        let minX = Infinity, maxX = -Infinity;
        targets.forEach(p => {
            const pos = p.parts.torso.position;
            if(pos.y < minY) minY = pos.y;
            if(pos.y > maxY) maxY = pos.y;
            if(pos.x < minX) minX = pos.x;
            if(pos.x > maxX) maxX = pos.x;
        });
        // 슬로우 모션 로직 (선두가 결승선 근처일 때)
        if (maxY > GOAL_Y - 400 && gameActive) {
            isSlowMotion = true;
            engine.timing.timeScale = 0.5;
        } else {
            isSlowMotion = false;
            engine.timing.timeScale = 1;
        }
        const frameEl = document.getElementById('mobile-frame');
        const frameH = frameEl.clientHeight;
        const frameW = frameEl.clientWidth;
        // [핵심 수정] 줌 레벨 계산
        // 가로(X)축 범위를 더 적극적으로 반영하도록 가중치와 여백을 늘림
        // spreadX: 좌우 최외곽 선수 거리 + 400px (여백)
        const spreadX = (maxX - minX) + 400;
        const spreadY = (maxY - minY) + 400;
        const zoomX = spreadX / frameW;
        const zoomY = spreadY / frameH;
        // 가로와 세로 중 더 크게 벌어진 쪽을 기준으로 줌 설정
        let calcZoom = Math.max(zoomX, zoomY);
        // [수정] 최소 0.6배(줌인) ~ 최대 5.0배(줌아웃)까지 허용
        // 기존 1.2배 제한 때문에 30명일 때 화면이 잘렸음. 5.0배면 충분함.
        let targetZoom = Math.max(0.6, Math.min(5.0, calcZoom));
        // 부드러운 카메라 전환 (Interpolation)
        currentZoomLevel += (targetZoom - currentZoomLevel) * 0.05;
        const visibleH = frameH * currentZoomLevel;
        const visibleW = frameW * currentZoomLevel;
        const centerY = (minY + maxY) / 2;
        const centerX = (minX + maxX) / 2;
        
        // 카메라는 맵 밖으로 너무 나가지 않도록 클램핑
        // Y축은 바닥 아래를 보여주지 않도록, X축은 중앙을 따라가되 화면 크기 반영
        const clampedY = Math.max(-1000, Math.min(centerY - visibleH / 2, MAP_HEIGHT + 200 - visibleH));
        const clampedX = centerX - visibleW / 2;
        Render.lookAt(render, {
            min: { x: clampedX, y: clampedY },
            max: { x: clampedX + visibleW, y: clampedY + visibleH }
        });
    }

    function checkFinish() {
        let allFinished = true;
        players.forEach(p => {
            if (!p.finished) {
                if (p.parts.torso.position.y >= GOAL_Y) {
                    p.finished = true;
                    finishList.push({ name: p.name, time: Date.now() - startTime });
                    setTimeout(() => {
                        Composite.remove(engine.world, [p.parts.torso, p.parts.lh, p.parts.rh, p.parts.lf, p.parts.rf]);
                        if(p.joints) Composite.remove(engine.world, p.joints); 
                        Object.values(p.constraints).forEach(c => { if(c) Composite.remove(engine.world, c); });
                        if(p.nameTagEl) p.nameTagEl.remove();
                    }, 600);
                } else {
                    allFinished = false;
                }
            }
        });
        if (allFinished && gameActive) endGame();
    }

    function endGame() {
        gameActive = false;
        clearInterval(moveInterval);
        engine.timing.timeScale = 1; 
        
        currentZoomLevel = Math.max(currentZoomLevel, 1.5); 
        setTimeout(() => {
            const resultScreen = document.getElementById('result-screen');
            
            // 1. 결과 화면 보이기
            resultScreen.classList.remove('hidden');
            document.getElementById('top-share-btn').style.display = 'flex';
            // ✅ [추가됨] 결과 화면이 나오면 하단 광고를 숨김
            const bottomAd = document.getElementById('bottom-ad');
            if(bottomAd) bottomAd.style.display = 'none';
            // 2. HTML에 미리 만들어둔 'result-list-box'를 찾습니다.
            const listBox = document.getElementById('result-list-box');
            
            // 박스가 없으면 에러 방지
            if (!listBox) {
                console.error("result-list-box를 찾을 수 없습니다.");
                return;
            }
            // 3. 기존 내용을 싹 비웁니다.
            listBox.innerHTML = '';
            // 4. 결과 목록을 채워 넣습니다.
            finishList.forEach((item, idx) => {
                const div = document.createElement('div');
                div.className = 'rank-card'; 
                let rankIcon = idx + 1;
                if (idx === 0) rankIcon = '🥇';
                else if (idx === 1) rankIcon = '🥈';
                else if (idx === 2) rankIcon = '🥉';
                div.innerHTML = `
                    <div style="display:flex; align-items:center; min-width: 0;">
                        <span class="rank" style="font-weight:bold; margin-right:8px; color:#f1c40f; min-width:20px;">${rankIcon}</span>
                        <span class="name" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.name}</span>
                    </div>
                    <span class="time" style="font-family:monospace; color:#bdc3c7; font-size:12px; margin-left:5px;">${(item.time/1000).toFixed(2)}s</span>
                `;
                listBox.appendChild(div);
            });
        }, 1000);
    }


    async function shareResult() {
        let text = "🎮 찐득이 레이싱 플레이하기";
        if (finishList.length > 0) {
            const winner = finishList[0];
            text = `🏆 찐득이 레이싱 우승!\n🥇 ${winner.name} (${(winner.time/1000).toFixed(2)}s)`;
        }
        try { await navigator.share({ title: 'Sticky Man', text, url: location.href }); } 
        catch(e) { 
            navigator.clipboard.writeText(text + "\n" + location.href); 
            alert('링크가 복사되었습니다!'); 
        }
        const adEl = document.getElementById('interstitial-ad');
        if(adEl) adEl.style.display = 'flex';    }

    window.closeAd = function() { 
        const adEl = document.getElementById('interstitial-ad');
        if(adEl) adEl.style.display = 'none';

    }
    const symbols = ['︶', '꒷', '꒦']; // 변경될 문자 순서
    // 0.2초마다 실행

    setInterval(() => {
        // 모든 dynamic-symbol 클래스를 가진 요소를 찾음
        document.querySelectorAll('.dynamic-symbol').forEach(el => {
            // 현재 어떤 문자인지 확인하거나, 저장된 offset 값을 가져옴
            let currentIdx = parseInt(el.dataset.currentIdx || el.dataset.offset || 0);
            
            // 다음 순서로 증가
            currentIdx = (currentIdx + 1) % symbols.length;
            
            // 화면에 적용 및 인덱스 저장
            el.innerText = symbols[currentIdx];
            el.dataset.currentIdx = currentIdx;
        });
    }, 200); // 200ms 속도로 변경 (숫자를 줄이면 더 빨라짐)