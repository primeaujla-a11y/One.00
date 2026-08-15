/**
 * ONE.00 - Premium Reaction/Judgment Game
 * Core game logic with state machine, timing, scoring, and audio.
 */

(function () {
    'use strict';

    /* ================================================================
       DIFFICULTY CONFIGS
       ================================================================ */

    const DIFFICULTIES = {
        easy: {
            label: 'EASY',
            minDelay: 1800,
            maxDelay: 4000,
            decisionWindow: 3000,
            baseScore: 80,
            streakBonus: 20,
            speedBonusMax: 50,
            speedThreshold: 2000,
        },
        normal: {
            label: 'NORMAL',
            minDelay: 1200,
            maxDelay: 3500,
            decisionWindow: 2500,
            baseScore: 100,
            streakBonus: 25,
            speedBonusMax: 40,
            speedThreshold: 1800,
        },
        hard: {
            label: 'HARD',
            minDelay: 800,
            maxDelay: 2800,
            decisionWindow: 2000,
            baseScore: 130,
            streakBonus: 30,
            speedBonusMax: 35,
            speedThreshold: 1500,
        },
        insane: {
            label: 'INSANE',
            minDelay: 500,
            maxDelay: 2200,
            decisionWindow: 1500,
            baseScore: 170,
            streakBonus: 40,
            speedBonusMax: 30,
            speedThreshold: 1200,
        },
    };

    /* ================================================================
       STATE
       ================================================================ */

    const State = {
        MENU: 'MENU',
        WAITING: 'WAITING',
        COUNTING: 'COUNTING',
        STOPPED: 'STOPPED',
        RESULT: 'RESULT',
        GAME_OVER: 'GAME_OVER',
    };

    const game = {
        state: State.MENU,
        difficulty: 'normal',
        score: 0,
        streak: 0,
        runBestStreak: 0,
        bestStreak: 0,
        bestScore: 0,
        totalRounds: 0,
        correctAnswers: 0,
        wrongAnswers: 0,
        gamesPlayed: 0,
        overallCorrect: 0,
        overallTotal: 0,

        /* Timing - internal only, never exposed to DOM */
        botStartTime: 0,
        botStopTime: 0,
        pendingTimeout: null,
        stopTimeout: null,
        roundActive: false,
        answeredThisRound: false,
    };

    /* ================================================================
       DOM REFERENCES
       ================================================================ */

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const dom = {
        screens: {
            menu: $('#screen-menu'),
            game: $('#screen-game'),
        },
        menu: {
            bestScore: $('#menu-best-score'),
            bestStreak: $('#menu-best-streak'),
            gamesPlayed: $('#menu-games-played'),
            accuracy: $('#menu-accuracy'),
            startBtn: $('#btn-start'),
            diffBtns: $$('.diff-btn'),
        },
        game: {
            hudDifficulty: $('#hud-difficulty'),
            hudScore: $('#hud-score'),
            hudStreak: $('#hud-streak'),
            hudAccuracy: $('#hud-accuracy'),
            botArea: $('#bot-area'),
            botCore: $('#bot-core'),
            botRing: $('#bot-ring'),
            botLabel: $('#bot-label'),
            statusText: $('#game-status'),
            btnLess: $('#btn-less'),
            btnMore: $('#btn-more'),
            answers: $('#game-answers'),
        },
        result: {
            overlay: $('#result-overlay'),
            verdict: $('#result-verdict'),
            time: $('#result-time'),
            choice: $('#result-choice'),
            yourChoice: $('#result-your-choice'),
            correctChoice: $('#result-correct-choice'),
            scoreChange: $('#result-score-change'),
            streak: $('#result-streak'),
            nextBtn: $('#btn-next'),
        },
        gameover: {
            overlay: $('#gameover-overlay'),
            score: $('#gameover-score'),
            accuracy: $('#go-accuracy'),
            rounds: $('#go-rounds'),
            correct: $('#go-correct'),
            wrong: $('#go-wrong'),
            bestStreak: $('#go-best-streak'),
            bestScore: $('#go-best-score'),
            playAgain: $('#btn-play-again'),
            changeDiff: $('#btn-change-diff'),
            mainMenu: $('#btn-main-menu'),
        },
        soundToggle: $('#sound-toggle'),
        soundOnIcon: $('#sound-on-icon'),
        soundOffIcon: $('#sound-off-icon'),
        endRunBtn: $('#btn-end-run'),
    };

    /* ================================================================
       AUDIO (Web Audio API - lightweight synth sounds)
       ================================================================ */

    let audioCtx = null;
    let soundEnabled = true;

    function getAudioCtx() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return audioCtx;
    }

    function playTone(freq, duration, type, volume) {
        if (!soundEnabled) return;
        try {
            const ctx = getAudioCtx();
            if (ctx.state === 'suspended') ctx.resume();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type || 'sine';
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            gain.gain.setValueAtTime(volume || 0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + duration);
        } catch (e) {
            /* audio not available */
        }
    }

    function soundBotEvent() {
        playTone(880, 0.15, 'sine', 0.18);
        setTimeout(() => playTone(1100, 0.1, 'sine', 0.12), 50);
    }

    function soundCorrect() {
        playTone(523, 0.12, 'sine', 0.15);
        setTimeout(() => playTone(659, 0.12, 'sine', 0.15), 100);
        setTimeout(() => playTone(784, 0.15, 'sine', 0.12), 200);
    }

    function soundWrong() {
        playTone(300, 0.2, 'square', 0.08);
        setTimeout(() => playTone(250, 0.25, 'square', 0.06), 120);
    }

    function soundClick() {
        playTone(600, 0.06, 'sine', 0.08);
    }

    /* ================================================================
       LOCAL STORAGE
       ================================================================ */

    const STORAGE_KEY = 'one00_data';

    function loadStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const data = JSON.parse(raw);
                game.bestScore = data.bestScore || 0;
                game.bestStreak = data.bestStreak || 0;
                game.gamesPlayed = data.gamesPlayed || 0;
                game.overallCorrect = data.overallCorrect || 0;
                game.overallTotal = data.overallTotal || 0;
                game.difficulty = data.difficulty || 'normal';
                soundEnabled = data.soundEnabled !== undefined ? data.soundEnabled : true;
            }
        } catch (e) {
            /* ignore */
        }
    }

    function saveStorage() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                bestScore: game.bestScore,
                bestStreak: game.bestStreak,
                gamesPlayed: game.gamesPlayed,
                overallCorrect: game.overallCorrect,
                overallTotal: game.overallTotal,
                difficulty: game.difficulty,
                soundEnabled: soundEnabled,
            }));
        } catch (e) {
            /* ignore */
        }
    }

    /* ================================================================
       UI HELPERS
       ================================================================ */

    function showScreen(name) {
        Object.values(dom.screens).forEach((s) => s.classList.remove('active'));
        if (dom.screens[name]) dom.screens[name].classList.add('active');
    }

    function formatAccuracy(correct, total) {
        if (total === 0) return '--%';
        return Math.round((correct / total) * 100) + '%';
    }

    function setBotState(stateClass) {
        const area = dom.game.botArea;
        area.classList.remove('idle', 'waiting', 'event', 'stopped', 'result-correct', 'result-wrong');
        if (stateClass) area.classList.add(stateClass);
    }

    function updateHud() {
        const prevScore = parseInt(dom.game.hudScore.textContent) || 0;
        const prevStreak = parseInt(dom.game.hudStreak.textContent) || 0;

        dom.game.hudScore.textContent = game.score;
        dom.game.hudStreak.textContent = game.streak;
        dom.game.hudAccuracy.textContent = formatAccuracy(game.correctAnswers, game.totalRounds);
        dom.game.hudDifficulty.textContent = DIFFICULTIES[game.difficulty].label;

        /* Score bump animation */
        if (game.score > prevScore) {
            dom.game.hudScore.classList.remove('bump');
            void dom.game.hudScore.offsetWidth;
            dom.game.hudScore.classList.add('bump');
        }

        /* Streak fire animation */
        if (game.streak > prevStreak && game.streak > 1) {
            dom.game.hudStreak.classList.remove('streak-fire');
            void dom.game.hudStreak.offsetWidth;
            dom.game.hudStreak.classList.add('streak-fire');
        }
    }

    function updateMenuStats() {
        dom.menu.bestScore.textContent = game.bestScore;
        dom.menu.bestStreak.textContent = game.bestStreak;
        dom.menu.gamesPlayed.textContent = game.gamesPlayed;
        dom.menu.accuracy.textContent = formatAccuracy(game.overallCorrect, game.overallTotal);
    }

    function updateSoundIcon() {
        dom.soundOnIcon.classList.toggle('hidden', !soundEnabled);
        dom.soundOffIcon.classList.toggle('hidden', soundEnabled);
    }

    function setAnswersEnabled(enabled) {
        dom.game.btnLess.classList.toggle('disabled', !enabled);
        dom.game.btnMore.classList.toggle('disabled', !enabled);
    }

    /* ================================================================
       GAME LOGIC
       ================================================================ */

    function startGame() {
        game.score = 0;
        game.streak = 0;
        game.runBestStreak = 0;
        game.totalRounds = 0;
        game.correctAnswers = 0;
        game.wrongAnswers = 0;
        game.roundActive = false;
        game.answeredThisRound = false;

        showScreen('game');
        dom.endRunBtn.classList.remove('hidden');
        updateHud();
        beginRound();
    }

    function beginRound() {
        game.state = State.WAITING;
        game.roundActive = true;
        game.answeredThisRound = false;
        game.botStartTime = 0;
        game.botStopTime = 0;

        setBotState('waiting');
        dom.game.botLabel.textContent = '';
        dom.game.statusText.textContent = 'Be ready — bot can start anytime.';
        setAnswersEnabled(false);

        dom.result.overlay.classList.remove('active');
        dom.gameover.overlay.classList.remove('active');

        /* Schedule the bot to start counting at a random future time */
        const cfg = DIFFICULTIES[game.difficulty];
        const delay = randomInRange(cfg.minDelay, cfg.maxDelay);

        game.pendingTimeout = setTimeout(() => {
            botStartCounting();
        }, delay);
    }

    function botStartCounting() {
        if (game.state !== State.WAITING) return;

        /* Record the exact start timestamp */
        game.botStartTime = performance.now();
        game.state = State.COUNTING;

        /* Visual feedback - green flash */
        const flashOverlay = document.getElementById('flash-overlay');
        flashOverlay.classList.remove('red');
        flashOverlay.classList.add('active');
        setTimeout(() => flashOverlay.classList.remove('active'), 100);

        /* Bot area shows counting state */
        setBotState('event');
        dom.game.botLabel.textContent = '';

        /* Audio feedback */
        soundBotEvent();

        /* Screen pulse */
        document.body.classList.add('screen-pulse');
        setTimeout(() => document.body.classList.remove('screen-pulse'), 200);

        /* Schedule the bot to stop counting after a random duration */
        const cfg = DIFFICULTIES[game.difficulty];
        const countDuration = randomInRange(cfg.minDelay, cfg.maxDelay);

        game.stopTimeout = setTimeout(() => {
            botStopCounting();
        }, countDuration);
    }

    function botStopCounting() {
        if (game.state !== State.COUNTING) return;

        /* Record the exact stop timestamp */
        game.botStopTime = performance.now();
        game.state = State.STOPPED;

        /* Visual feedback - red flash */
        const flashOverlay = document.getElementById('flash-overlay');
        flashOverlay.classList.add('red');
        flashOverlay.classList.add('active');
        setTimeout(() => {
            flashOverlay.classList.remove('active');
            flashOverlay.classList.remove('red');
        }, 100);

        /* Bot area shows stopped state */
        setBotState('stopped');
        dom.game.botLabel.textContent = '';

        /* Screen pulse */
        document.body.classList.add('screen-pulse');
        setTimeout(() => document.body.classList.remove('screen-pulse'), 200);

        /* Enable answers */
        setAnswersEnabled(true);
    }

    function handleAnswer(chosenMore) {
        if (game.state !== State.STOPPED) return;
        if (game.answeredThisRound) return;
        if (game.botStartTime === 0 || game.botStopTime === 0) return;

        game.answeredThisRound = true;
        game.roundActive = false;
        game.state = State.RESULT;

        if (game.pendingTimeout) {
            clearTimeout(game.pendingTimeout);
            game.pendingTimeout = null;
        }
        if (game.stopTimeout) {
            clearTimeout(game.stopTimeout);
            game.stopTimeout = null;
        }

        setAnswersEnabled(false);

        /* Calculate elapsed time between bot start and bot stop */
        const elapsedMs = game.botStopTime - game.botStartTime;
        const elapsedSec = elapsedMs / 1000;

        /* Determine correct answer: < 1000ms = LESS, >= 1000ms = MORE */
        const correctIsMore = elapsedMs >= 1000;
        const playerChoseMore = chosenMore;
        const isCorrect = playerChoseMore === correctIsMore;

        /* Update stats */
        game.totalRounds++;
        if (isCorrect) {
            game.correctAnswers++;
            game.streak++;
            if (game.streak > game.runBestStreak) game.runBestStreak = game.streak;
            if (game.streak > game.bestStreak) game.bestStreak = game.streak;
        } else {
            game.wrongAnswers++;
            game.streak = 0;
        }

        /* Calculate score */
        const cfg = DIFFICULTIES[game.difficulty];
        let scoreGain = 0;
        if (isCorrect) {
            scoreGain = cfg.baseScore;
            /* Streak bonus */
            scoreGain += Math.min(game.streak - 1, 10) * cfg.streakBonus;
            /* Speed bonus: faster correct answers get a small bonus */
            if (elapsedMs < cfg.speedThreshold) {
                const speedRatio = 1 - (elapsedMs / cfg.speedThreshold);
                scoreGain += Math.round(speedRatio * cfg.speedBonusMax);
            }
        }
        game.score += scoreGain;
        if (game.score > game.bestScore) game.bestScore = game.score;

        /* Visual feedback */
        if (isCorrect) {
            setBotState('result-correct');
            dom.game.botLabel.textContent = '✓';
            soundCorrect();
        } else {
            setBotState('result-wrong');
            dom.game.botLabel.textContent = '✗';
            soundWrong();
            /* Shake the answer area */
            dom.game.answers.classList.add('shake');
            setTimeout(() => dom.game.answers.classList.remove('shake'), 400);
        }

        updateHud();
        showResult(isCorrect, elapsedSec, playerChoseMore, correctIsMore, scoreGain);
    }

    function showResult(isCorrect, elapsedSec, playerChoseMore, correctIsMore, scoreGain) {
        dom.result.verdict.textContent = isCorrect ? 'CORRECT' : 'WRONG';
        dom.result.verdict.className = 'result-verdict ' + (isCorrect ? 'correct' : 'wrong');
        dom.result.time.textContent = elapsedSec.toFixed(2) + 's';
        dom.result.choice.textContent = correctIsMore ? 'MORE THAN 1 SECOND' : 'LESS THAN 1 SECOND';
        dom.result.yourChoice.textContent = playerChoseMore ? 'More' : 'Less';
        dom.result.correctChoice.textContent = correctIsMore ? 'More' : 'Less';
        dom.result.scoreChange.textContent = isCorrect ? '+' + scoreGain : '0';
        dom.result.scoreChange.style.color = isCorrect ? 'var(--success)' : 'var(--danger)';
        dom.result.streak.textContent = game.streak;

        dom.result.overlay.classList.add('active');
    }

    function nextRound() {
        dom.result.overlay.classList.remove('active');
        setBotState('idle');
        dom.game.botLabel.textContent = '';
        beginRound();
    }

    function endRun() {
        if (game.pendingTimeout) {
            clearTimeout(game.pendingTimeout);
            game.pendingTimeout = null;
        }
        if (game.stopTimeout) {
            clearTimeout(game.stopTimeout);
            game.stopTimeout = null;
        }
        game.state = State.GAME_OVER;
        game.roundActive = false;
        game.gamesPlayed++;
        game.overallCorrect += game.correctAnswers;
        game.overallTotal += game.totalRounds;
        saveStorage();
        showGameOver();
    }

    function showGameOver() {
        dom.gameover.score.textContent = game.score;
        dom.gameover.accuracy.textContent = formatAccuracy(game.correctAnswers, game.totalRounds);
        dom.gameover.rounds.textContent = game.totalRounds;
        dom.gameover.correct.textContent = game.correctAnswers;
        dom.gameover.wrong.textContent = game.wrongAnswers;
        dom.gameover.bestStreak.textContent = game.runBestStreak;
        dom.gameover.bestScore.textContent = game.bestScore;
        dom.gameover.overlay.classList.add('active');
        dom.endRunBtn.classList.add('hidden');
    }

    function goToMenu() {
        if (game.pendingTimeout) {
            clearTimeout(game.pendingTimeout);
            game.pendingTimeout = null;
        }
        if (game.stopTimeout) {
            clearTimeout(game.stopTimeout);
            game.stopTimeout = null;
        }
        game.state = State.MENU;
        game.roundActive = false;
        dom.result.overlay.classList.remove('active');
        dom.gameover.overlay.classList.remove('active');
        dom.endRunBtn.classList.add('hidden');
        setBotState('idle');
        updateMenuStats();
        showScreen('menu');
    }

    /* ================================================================
       RANDOMIZATION
       ================================================================ */

    function randomInRange(min, max) {
        /* Use crypto.getRandomValues for better randomness when available */
        const array = new Uint32Array(1);
        window.crypto.getRandomValues(array);
        const random = array[0] / (0xFFFFFFFF + 1);
        return Math.floor(random * (max - min + 1)) + min;
    }

    /* ================================================================
       EVENT HANDLERS
       ================================================================ */

    /* Difficulty selection */
    dom.menu.diffBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            dom.menu.diffBtns.forEach((b) => b.classList.remove('selected'));
            btn.classList.add('selected');
            game.difficulty = btn.dataset.diff;
            saveStorage();
            soundClick();
        });
    });

    /* Start game */
    dom.menu.startBtn.addEventListener('click', () => {
        soundClick();
        startGame();
    });

    /* Answer buttons */
    dom.game.btnLess.addEventListener('click', () => handleAnswer(false));
    dom.game.btnMore.addEventListener('click', () => handleAnswer(true));

    /* Next round */
    dom.result.nextBtn.addEventListener('click', () => {
        soundClick();
        nextRound();
    });

    /* Game over actions */
    dom.gameover.playAgain.addEventListener('click', () => {
        soundClick();
        startGame();
    });
    dom.gameover.changeDiff.addEventListener('click', () => {
        soundClick();
        goToMenu();
    });
    dom.gameover.mainMenu.addEventListener('click', () => {
        soundClick();
        goToMenu();
    });

    /* End run */
    dom.endRunBtn.addEventListener('click', () => {
        soundClick();
        endRun();
    });

    /* Sound toggle */
    dom.soundToggle.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        updateSoundIcon();
        saveStorage();
        if (soundEnabled) soundClick();
    });

    /* Keyboard controls */
    document.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();

        /* Prevent defaults for game keys */
        if (['arrowleft', 'arrowright', 'a', 'd', ' '].includes(key)) {
            /* Only prevent default for space to avoid page scroll */
            if (key === ' ') e.preventDefault();
        }

        switch (game.state) {
            case State.MENU:
                if (key === ' ' || key === 'enter') {
                    soundClick();
                    startGame();
                }
                break;

            case State.STOPPED:
                if (key === 'arrowleft' || key === 'a') {
                    handleAnswer(false);
                } else if (key === 'arrowright' || key === 'd') {
                    handleAnswer(true);
                }
                break;

            case State.RESULT:
                if (key === ' ') {
                    soundClick();
                    nextRound();
                }
                break;

            case State.GAME_OVER:
                if (key === ' ') {
                    soundClick();
                    startGame();
                }
                break;
        }
    });

    /* ================================================================
       CONTROLLER (Gamepad API)
       ================================================================ */

    const gamepadState = {
        prevButtons: {},
        connected: false,
    };

    function gamepadAction(action) {
        switch (game.state) {
            case State.MENU:
                if (action === 'confirm') {
                    soundClick();
                    startGame();
                }
                break;

            case State.STOPPED:
                if (action === 'left') {
                    handleAnswer(false);
                } else if (action === 'right') {
                    handleAnswer(true);
                }
                break;

            case State.RESULT:
                if (action === 'confirm') {
                    soundClick();
                    nextRound();
                }
                break;

            case State.GAME_OVER:
                if (action === 'confirm') {
                    soundClick();
                    startGame();
                }
                break;
        }
    }

    function pollGamepad() {
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        for (let i = 0; i < gamepads.length; i++) {
            const gp = gamepads[i];
            if (!gp) continue;

            /* Button mapping (standard gamepad):
               0 = A / X (confirm)
               14 = D-pad Left
               15 = D-pad Right
               Axes: 0 = left stick X (-1 left, 1 right) */
            const btnA = gp.buttons[0] && gp.buttons[0].pressed;
            const btnLeft = gp.buttons[14] && gp.buttons[14].pressed;
            const btnRight = gp.buttons[15] && gp.buttons[15].pressed;
            const stickLeft = gp.axes[0] < -0.5;
            const stickRight = gp.axes[0] > 0.5;

            /* Only trigger on press (not hold) */
            const prevA = gamepadState.prevButtons['a'] || false;
            const prevLeft = gamepadState.prevButtons['left'] || false;
            const prevRight = gamepadState.prevButtons['right'] || false;

            if (btnA && !prevA) gamepadAction('confirm');
            if ((btnLeft || stickLeft) && !prevLeft) gamepadAction('left');
            if ((btnRight || stickRight) && !prevRight) gamepadAction('right');

            gamepadState.prevButtons['a'] = btnA;
            gamepadState.prevButtons['left'] = btnLeft || stickLeft;
            gamepadState.prevButtons['right'] = btnRight || stickRight;
        }

        requestAnimationFrame(pollGamepad);
    }

    window.addEventListener('gamepadconnected', () => {
        gamepadState.connected = true;
    });
    window.addEventListener('gamepaddisconnected', () => {
        gamepadState.connected = false;
    });

    requestAnimationFrame(pollGamepad);

    /* ================================================================
       INIT
       ================================================================ */

    loadStorage();
    updateMenuStats();
    updateSoundIcon();

    /* Set the correct difficulty button as selected */
    dom.menu.diffBtns.forEach((btn) => {
        btn.classList.toggle('selected', btn.dataset.diff === game.difficulty);
    });

    showScreen('menu');

})();
