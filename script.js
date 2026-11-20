/* ==========================================================================
   1. CONFIGURACIÓN INICIAL Y ESTRUCTURA DE PREGUNTAS
   ========================================================================== */
const DEFAULT_CONFIG = {
  title: "Trivia Clásica",
  subtitle: "Pon a prueba tus conocimientos",
  duration: 10,
  lives: 3,
  pointsPerCorrect: 10,
  penaltyLives: 1,
  interQuestionSeconds: 0,
  successMessage: "¡Correcto!",
  failMessage: "¡Fallaste!",
  timeOutMessage: "¡Tiempo agotado!",
  noLivesMessage: "¡Sin vidas!",
  finalMessage: "¡Juego terminado!",
  primaryColor: "#8b4513",
  secondaryColor: "#d9a05b",
  musicVolume: 0.45,
  effectsVolume: 0.7,
  muted: false,
  record: 0
};

/* Banco de preguntas organizadas por categorías (Historia, Ciencia, Literatura, Geografía) */
let QUESTIONS = {}; // Se llena desde data/questions.json (servidor) o localStorage

/* ==========================================================================
   2. REFERENCIAS A ELEMENTOS DEL DOM Y VARIABLES DE ESTADO
   ========================================================================== */

const app = document.getElementById("app");
const music = document.getElementById("backgroundMusic");
const muteButton = document.getElementById("muteButton");
const muteIcon = document.getElementById("muteIcon");
const muteFallback = document.getElementById("muteFallback");
const toast = document.getElementById("toast");

/* Referencias a audios de efectos especiales */
const audioWin = document.getElementById("audioWin");
const audioFail = document.getElementById("audioFail");
const audioGameWin = document.getElementById("audioGameWin");
const audioGameLose = document.getElementById("audioGameLose");

let config = { ...DEFAULT_CONFIG };
let serverAvailable = false;
let muteReminderTimer = null;

let state = {
  screen: "splash",
  topic: null,
  questionIndex: 0,
  score: 0,
  correct: 0,
  lives: config.lives,
  timer: null,
  timeLeft: config.duration,
  startedAt: null,
  totalAnswerTime: 0,
  paused: false,
  answerLocked: false
};

/* ==========================================================================
   3. FUNCIONES AUXILIARES Y DE ESCAPE
   ========================================================================== */
function escapeHTML(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(str) {
  return escapeHTML(str);
}

function goBack() {
  renderSplash();
}

function goToMenu() {
  pauseToMenu();
}

/* ==========================================================================
   4. GESTIÓN DE CONFIGURACIÓN (SERVIDOR Y LOCALSTORAGE)
   ========================================================================== */
async function loadConfig() {
  try {
    const response = await fetch('/api/config');
    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        config = data.data;
        serverAvailable = true;
        return;
      }
    }
  } catch (err) {
    console.warn('⚠️ Servidor no disponible, usando fallback localStorage');
  }

  try {
    const saved = JSON.parse(localStorage.getItem("triviaConfig"));
    config = { ...DEFAULT_CONFIG, ...(saved || {}) };
  } catch {
    config = { ...DEFAULT_CONFIG };
  }

  serverAvailable = false;
}

async function saveConfigToServer(newConfig) {
  if (!serverAvailable) {
    showToast("⚠️ Servidor no disponible. Guardando localmente.");
    saveConfigLocally(newConfig);
    return true;
  }

  try {
    const response = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newConfig)
    });

    const data = await response.json();

    if (data.success) {
      config = data.data;
      state.lives = config.lives;
      applyTheme();
      showToast("✅ Configuración guardada");
      return true;
    } else {
      showToast("❌ " + (data.error || "Error guardando configuración"));
      return false;
    }
  } catch (err) {
    console.error('Error guardando configuración:', err);
    showToast("❌ Error de conexión al guardar");
    return false;
  }
}

function saveConfigLocally(newConfig) {
  try {
    config = newConfig;
    localStorage.setItem("triviaConfig", JSON.stringify(newConfig));
    applyTheme();
  } catch (err) {
    console.error('Error guardando localmente:', err);
  }
}

async function updateRecordOnServer(score) {
  if (!serverAvailable) {
    return false;
  }

  try {
    const response = await fetch('/api/config/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score: score })
    });

    const data = await response.json();

    if (data.success && data.isNewRecord) {
      config.record = data.newRecord;
      return true;
    }
    return false;
  } catch (err) {
    console.error('Error actualizando récord:', err);
    return false;
  }
}

/* ==========================================================================
   5. GESTIÓN Y PERSISTENCIA DE PARTIDAS
   ========================================================================== */
async function saveGameToServer(gameData) {
  if (!serverAvailable) {
    console.warn('⚠️ Servidor no disponible, guardando localmente');
    saveGameLocally(gameData);
    return true;
  }

  try {
    const response = await fetch('/api/saves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gameData)
    });

    const data = await response.json();

    if (data.success) {
      showToast("💾 Partida guardada correctamente");
      return true;
    } else {
      showToast("❌ Error guardando partida");
      return false;
    }
  } catch (err) {
    console.error('Error guardando partida:', err);
    showToast("❌ Error de conexión");
    return false;
  }
}

function saveGameLocally(gameData) {
  try {
    localStorage.setItem("triviaSavedGame", JSON.stringify(gameData));
    showToast("💾 Partida guardada (localmente)");
  } catch (err) {
    console.error('Error guardando localmente:', err);
  }
}

async function loadSavedGame() {
  if (serverAvailable) {
    try {
      const response = await fetch('/api/saves');
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.hasSave) {
          return data.data;
        }
      }
    } catch (err) {
      console.warn('Error leyendo partida del servidor');
    }
  }

  try {
    const saved = JSON.parse(localStorage.getItem("triviaSavedGame"));
    return saved;
  } catch {
    return null;
  }
}

async function resumeGame() {
  const saved = await loadSavedGame();
  if (saved) {
    state.topic = saved.topic;
    state.questionIndex = saved.questionIndex;
    state.score = saved.score;
    state.correct = saved.correct;
    state.lives = saved.lives;
    state.totalAnswerTime = saved.totalAnswerTime || 0;
    showQuestion();
  } else {
    showToast("⚠️ No hay ninguna partida guardada.");
  }
}

async function hasSavedGame() {
  const localSave = localStorage.getItem("triviaSavedGame");
  if (localSave) return true;

  if (serverAvailable) {
    try {
      const response = await fetch('/api/saves');
      if (response.ok) {
        const data = await response.json();
        return data.success && data.hasSave;
      }
    } catch (err) {
      console.warn('Error verificando partida guardada');
    }
  }

  return false;
}

async function deleteSavedGame() {
  if (serverAvailable) {
    try {
      await fetch('/api/saves', { method: 'DELETE' });
    } catch (err) {
      console.warn('Error eliminando partida del servidor');
    }
  }
  localStorage.removeItem("triviaSavedGame");
}

/* ==========================================================================
   6. INTERFAZ, TEMAS, AUDIO Y FEEDBACK VISUAL
   ========================================================================== */
function applyTheme() {
  document.documentElement.style.setProperty("--primary", config.primaryColor);
  document.documentElement.style.setProperty("--secondary", config.secondaryColor);
  music.volume = Number(config.musicVolume);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => toast.classList.remove("show"), 2200);
}

function showFeedback(isCorrect) {
  const feedbackContainer = document.getElementById("feedbackContainer");

  feedbackContainer.innerHTML = "";

  const img = document.createElement("img");
  img.className = "feedback-image";
  img.src = isCorrect
    ? "assets/respuestaCorrecta.png"
    : "assets/respuestaIncorrecta.png";

  img.alt = isCorrect ? "Respuesta Correcta" : "Respuesta Incorrecta";
  img.onerror = () => {
    console.warn(`No se encontró imagen: ${img.src}`);
  };

  feedbackContainer.appendChild(img);

  setTimeout(() => {
    img.classList.add("fade-out");
    setTimeout(() => {
      feedbackContainer.innerHTML = "";
    }, 400);
  }, 1100);
}

function playSound(soundType) {
  if (config.muted) return;

  let audio;
  switch(soundType) {
    case 'win':
      audio = audioWin;
      break;
    case 'fail':
      audio = audioFail;
      break;
    case 'gameWin':
      audio = audioGameWin;
      break;
    case 'gameLose':
      audio = audioGameLose;
      break;
    default:
      return;
  }

  audio.currentTime = 0;
  audio.volume = Number(config.effectsVolume || 0.7);
  audio.play().catch(err => console.log("Error reproduciendo sonido:", err));
}

function setMute(muted) {
  config.muted = muted;
  if (serverAvailable) {
    saveConfigToServer({ ...config, muted });
  } else {
    saveConfigLocally({ ...config, muted });
  }
  music.muted = muted;
  updateMuteIcon();

  if (muteReminderTimer) {
    clearTimeout(muteReminderTimer);
    muteReminderTimer = null;
  }

  if (!muted) {
    music.play().catch(() => {});
  } else {
    music.pause();
    muteReminderTimer = setTimeout(() => {
      if (config.muted) {
        showToast("🔇 Recordatorio: El audio está silenciado");
      }
    }, 60000);
  }
}

function updateMuteIcon() {
  muteIcon.style.display = "";
  muteFallback.style.display = "none";
  const src = config.muted ? "assets/musicOff-icon.png" : "assets/musicOn-icon.png";
  muteIcon.src = src;
  muteIcon.onerror = () => {
    muteIcon.style.display = "none";
    muteFallback.style.display = "inline";
  };
  muteButton.title = config.muted ? "Activar música" : "Silenciar música";
}

muteButton.addEventListener("click", () => setMute(!config.muted));

function startMusic() {
  music.volume = Number(config.musicVolume);
  music.muted = config.muted;
  updateMuteIcon();
  if (!config.muted) music.play().catch(() => {});
}

/* ==========================================================================
   7. RENDERIZADO DE PANTALLAS (SPLASH, CONFIGURACIÓN Y CATEGORÍAS)
   ========================================================================== */
async function renderSplash() {
  state.screen = "splash";

  const hasSave = await hasSavedGame();

  app.innerHTML = `
    <section class="menu-card">
      <h1 class="game-title">${escapeHTML(config.title)}</h1>
      <p class="subtitle">${escapeHTML(config.subtitle)}</p>

      <div style="text-align: center; margin-bottom: 20px; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 10px;">
        <p style="color: #e2b062; margin: 0; font-size: 14px;">🏆 Puntaje más alto</p>
        <p style="color: #fff; margin: 5px 0 0 0; font-size: 28px; font-weight: bold;">${config.record}</p>
      </div>

      <div class="menu-buttons">
        <button class="btn" onclick="newGame()">▶ NUEVA PARTIDA</button>
        <button class="btn secondary" onclick="resumeGame()" id="btnContinuar" ${hasSave ? "" : "disabled"}>↻ CONTINUAR PARTIDA</button>
        <button class="btn secondary" onclick="renderSettings()">⚙ CONFIGURACIONES</button>
        <button class="btn secondary" onclick="exitGame()">✖ SALIR DEL JUEGO</button>
      </div>
    </section>
  `;

  startMusic();
}

function renderSettings() {
  state.screen = "settings";
  clearTimer();
  app.innerHTML = `
    <section class="settings-card">
      <h2>CONFIGURACIONES</h2>

      <div class="setting-row">
        <label>Título</label>
        <input id="cfgTitle" value="${escapeAttr(config.title)}">
      </div>

      <div class="setting-row">
        <label>Subtítulo</label>
        <input id="cfgSubtitle" value="${escapeAttr(config.subtitle)}">
      </div>

      <div class="setting-row">
        <label>Duración por pregunta (10–180 segundos)</label>
        <input id="cfgDuration" type="number" min="10" max="180" value="${config.duration}">
      </div>

      <div class="setting-row">
        <label>Número de vidas</label>
        <input id="cfgLives" type="number" min="1" max="20" value="${config.lives}">
      </div>

      <div class="setting-row">
        <label>Puntos por acierto</label>
        <input id="cfgPoints" type="number" min="0" max="1000" value="${config.pointsPerCorrect}">
      </div>

      <div class="setting-row">
        <label>Penalización: vidas por fallo</label>
        <input id="cfgPenalty" type="number" min="1" max="20" value="${config.penaltyLives}">
      </div>

      <div class="setting-row">
        <label>Tiempo entre preguntas (segundos)</label>
        <input id="cfgInter" type="number" min="0" max="30" value="${config.interQuestionSeconds}">
      </div>

      <div class="setting-row">
        <label>Mensaje de acierto</label>
        <input id="cfgSuccess" value="${escapeAttr(config.successMessage)}">
      </div>

      <div class="setting-row">
        <label>Mensaje de fallo</label>
        <input id="cfgFail" value="${escapeAttr(config.failMessage)}">
      </div>

      <div class="setting-row">
        <label>Mensaje de tiempo agotado</label>
        <input id="cfgTimeout" value="${escapeAttr(config.timeOutMessage)}">
      </div>

      <div class="setting-row">
        <label>Mensaje final</label>
        <input id="cfgFinal" value="${escapeAttr(config.finalMessage)}">
      </div>

      <div class="setting-row">
        <label>Volumen música (0.0 - 1.0)</label>
        <input id="cfgMusicVol" type="number" min="0" max="1" step="0.1" value="${config.musicVolume}">
        <span class="range-value" id="musicVolDisplay">${(config.musicVolume * 100).toFixed(0)}%</span>
      </div>

      <div class="setting-row">
        <label>Volumen efectos (0.0 - 1.0)</label>
        <input id="cfgEffectsVol" type="number" min="0" max="1" step="0.1" value="${config.effectsVolume}">
        <span class="range-value" id="effectsVolDisplay">${(config.effectsVolume * 100).toFixed(0)}%</span>
      </div>

      <div class="setting-row">
        <label>Color primario</label>
        <input id="cfgPrimary" type="color" value="${config.primaryColor}">
      </div>

      <div class="setting-row">
        <label>Color secundario</label>
        <input id="cfgSecondary" type="color" value="${config.secondaryColor}">
      </div>

      <!-- 🔄 SECCIÓN DE RÉCORD CON BOTÓN PARA REINICIAR -->
      <div class="setting-row" style="text-align: center; margin-top: 15px; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 10px;">
        <label style="display: block; margin-bottom: 8px;">🏆 Puntaje más alto actual: <strong id="recordDisplay">${config.record}</strong></label>
        <button type="button" class="btn secondary" style="background: #8f2525; border-color: #e06b6b; font-size: 14px; padding: 8px 14px;" onclick="resetRecord()">🔄 REINICIAR RÉCORD</button>
      </div>

      <div class="setting-row" style="margin-top: 15px;">
        <button type="button" class="btn secondary" onclick="renderQuestionEditor()">✏ EDITAR PREGUNTAS</button>
      </div>

      <div class="settings-actions">
        <button class="btn" onclick="saveSettings()">💾 GUARDAR</button>
        <button class="btn secondary" onclick="goBack()">❌ CANCELAR</button>
      </div>
    </section>
  `;

  document.getElementById("cfgMusicVol").addEventListener("input", (e) => {
    document.getElementById("musicVolDisplay").textContent = (e.target.value * 100).toFixed(0) + "%";
  });

  document.getElementById("cfgEffectsVol").addEventListener("input", (e) => {
    document.getElementById("effectsVolDisplay").textContent = (e.target.value * 100).toFixed(0) + "%";
  });
}


// ✅ SALIR DEL JUEGO
async function exitGame() {
  const ok = await showConfirm("¿Seguro que quieres salir del juego?", "✔ SÍ, SALIR");
  if (!ok) return;

  clearTimer();
  stopTimerSound();
  window.close();

  // Si el navegador no permite cerrar la pestaña, mostramos pantalla de despedida
  setTimeout(renderExitScreen, 300);
}

function renderExitScreen() {
  state.screen = "exit";
  app.innerHTML = `
    <section class="menu-card">
      <h1 class="game-title">¡Hasta pronto!</h1>
      <p class="subtitle">Gracias por jugar. Ya puedes cerrar esta pestaña.</p>
    </section>
  `;
}

// ✅ CUADRO DE CONFIRMACIÓN CON EL ESTILO DEL JUEGO
function showConfirm(message, yesText = "✔ SÍ, REINICIAR") {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "overlay-panel";
    overlay.innerHTML = `
      <section class="pause-card">
        <h2>CONFIRMAR</h2>
        <p>${escapeHTML(message)}</p>
        <div class="menu-buttons">
          <button class="btn" id="confirmYes">${escapeHTML(yesText)}</button>
          <button class="btn secondary" id="confirmNo">✖ CANCELAR</button>
        </div>
      </section>
    `;
    document.body.appendChild(overlay);

    const close = (value) => {
      overlay.remove();
      resolve(value);
    };

    overlay.querySelector("#confirmYes").onclick = () => close(true);
    overlay.querySelector("#confirmNo").onclick = () => close(false);
  });
}

async function resetRecord() {
  const ok = await showConfirm("¿Estás seguro de que deseas reiniciar el puntaje más alto a 0?");
  if (!ok) {
    return;
  }

  if (serverAvailable) {
    try {
      const response = await fetch('/api/config/reset-record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();
      if (data.success) {
        config.record = 0;
        document.getElementById("recordDisplay").textContent = "0";
        showToast("🔄 Récord reiniciado a 0");
      } else {
        showToast("❌ Error al reiniciar récord");
      }
    } catch (err) {
      console.error('Error al reiniciar récord:', err);
      showToast("❌ Error de conexión al reiniciar récord");
    }
  } else {
    config.record = 0;
    saveConfigLocally(config);
    document.getElementById("recordDisplay").textContent = "0";
    showToast("🔄 Récord reiniciado a 0 (local)");
  }
}

async function saveSettings() {
  const title = document.getElementById("cfgTitle").value.trim();
  const subtitle = document.getElementById("cfgSubtitle").value.trim();
  const duration = parseInt(document.getElementById("cfgDuration").value);
  const lives = parseInt(document.getElementById("cfgLives").value);
  const points = parseInt(document.getElementById("cfgPoints").value);
  const penalty = parseInt(document.getElementById("cfgPenalty").value);
  const inter = parseInt(document.getElementById("cfgInter").value);

  if (!title) {
    showToast("❌ El título no puede estar vacío");
    return;
  }

  if (duration < 10 || duration > 180) {
    showToast("❌ Duración debe estar entre 10 y 180 segundos");
    return;
  }

  if (lives < 1 || lives > 20) {
    showToast("❌ Vidas debe estar entre 1 y 20");
    return;
  }

  if (points < 0 || points > 1000) {
    showToast("❌ Puntos debe estar entre 0 y 1000");
    return;
  }

  if (penalty < 1 || penalty > 20) {
    showToast("❌ Penalización debe estar entre 1 y 20");
    return;
  }

  if (inter < 0 || inter > 30) {
    showToast("❌ Tiempo entre preguntas debe estar entre 0 y 30");
    return;
  }

  const newConfig = {
    title: title || "Trivia Clásica",
    subtitle: subtitle || config.subtitle,
    duration: duration,
    lives: lives,
    pointsPerCorrect: points,
    penaltyLives: penalty,
    interQuestionSeconds: inter,
    successMessage: document.getElementById("cfgSuccess").value.trim() || "¡Correcto!",
    failMessage: document.getElementById("cfgFail").value.trim() || "¡Fallaste!",
    timeOutMessage: document.getElementById("cfgTimeout").value.trim() || "¡Tiempo agotado!",
    noLivesMessage: config.noLivesMessage,
    finalMessage: document.getElementById("cfgFinal").value.trim() || "¡Juego terminado!",
    primaryColor: document.getElementById("cfgPrimary").value,
    secondaryColor: document.getElementById("cfgSecondary").value,
    musicVolume: parseFloat(document.getElementById("cfgMusicVol").value),
    effectsVolume: parseFloat(document.getElementById("cfgEffectsVol").value),
    muted: config.muted,
    record: config.record
  };

  const saved = await saveConfigToServer(newConfig);

  if (saved) {
    await renderSplash();
  }
}

function renderCategories() {
  state.screen = "categories";
  clearTimer();
  app.innerHTML = `
    <section class="category-card">
      <h2>ELIGE UNA CATEGORÍA</h2>
      <p>Selecciona el tema de las preguntas</p>
      <div class="category-buttons">
        ${Object.keys(QUESTIONS).some(c => QUESTIONS[c].length > 0) ? "" : '<p>No hay preguntas todavía. Agrégalas en CONFIGURACIONES → EDITAR PREGUNTAS.</p>'}
        ${Object.keys(QUESTIONS).filter(cat => QUESTIONS[cat].length > 0).map(cat => `
          <button class="btn" onclick="newGame('${cat}')">${cat}</button>
        `).join("")}
        <button class="btn secondary" onclick="goBack()">← VOLVER</button>
      </div>
    </section>
  `;
}

/* ==========================================================================
   8. MECÁNICAS PRINCIPALES DEL JUEGO (PREGUNTAS, TEMPORIZADOR Y RESPUESTAS)
   ========================================================================== */
function newGame(topic) {
  if (!topic) {
    renderCategories();
    return;
  }
  if (!QUESTIONS[topic] || QUESTIONS[topic].length === 0) {
    showToast("⚠️ Esa categoría no tiene preguntas.");
    return;
  }
  state.topic = topic;
  state.questionIndex = 0;
  state.score = 0;
  state.correct = 0;
  state.lives = config.lives;
  state.totalAnswerTime = 0;
  state.startedAt = Date.now();
  state.answerLocked = false;
  showQuestion();
}

// ✅ FUNCIÓN ÚNICA PARA DETENER EL SONIDO DE ALERTA
function stopTimerSound() {
  const timerAudio = document.getElementById("audioTimer");
  if (timerAudio) {
    timerAudio.pause();
    timerAudio.currentTime = 0;
  }
}

function clearTimer() {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  stopTimerSound();
}

function startTimer(keepTime = false) {
  clearTimer();
  if (!keepTime) state.timeLeft = config.duration;
  state.timer = setInterval(() => {
    if (state.paused) return;

    state.timeLeft--;

    const timerEl = document.getElementById("timer");
    if (timerEl) {
      timerEl.textContent = state.timeLeft;
      if (state.timeLeft <= 3) {
        timerEl.classList.add("timer-urgent");
      } else {
        timerEl.classList.remove("timer-urgent");
      }
    }

    if (state.timeLeft <= 0) {
      state.answerLocked = true;
      showToast(config.timeOutMessage);
      playSound('fail');
      showFeedback(false);
      loseLives(config.penaltyLives);
      clearTimer();
      setTimeout(() => nextQuestion(), 1500);
    }

    if (state.timeLeft === 4) {
      const timerAudio = document.getElementById("audioTimer");
      if (timerAudio) {
        timerAudio.currentTime = 0;
        timerAudio.play().catch(() => {});
      }
    }
  }, 1000);
}

function showQuestion() {
  stopTimerSound();
  state.screen = "game";
  state.answerLocked = false;
  state.paused = false;

  if (!state.topic || !QUESTIONS[state.topic] || state.questionIndex >= QUESTIONS[state.topic].length) {
    finishGame();
    return;
  }

  const q = QUESTIONS[state.topic][state.questionIndex];

  app.innerHTML = `
    <div class="game-container">
      <div class="game-header">
        <span class="stat">❤️ ${state.lives}</span>
        <span class="stat">Q ${state.questionIndex + 1}/${QUESTIONS[state.topic].length}</span>
        <span class="stat">⏱️ <span id="timer">${config.duration}</span>s</span>
        <span class="stat" style="color: #e2b062; font-weight: bold;">💰 ${state.score}</span>
        <span class="stat" style="color: gold; font-weight: bold;">🏆 ${config.record}</span>
        <button class="pause-button" onclick="pauseGame()">⏸ PAUSA</button>
      </div>

      <div class="question-title">${escapeHTML(q[0])}</div>

      <div class="answers">
        ${q[1].map((ans, i) => `
          <button class="btn answer" onclick="submitAnswer(${i})">
            ${escapeHTML(ans)}
          </button>
        `).join("")}
      </div>
    </div>
  `;

  startTimer();
}

function submitAnswer(index) {
  if (state.answerLocked || state.paused) return;

  state.answerLocked = true;
  stopTimerSound();
  clearTimer();

  const q = QUESTIONS[state.topic][state.questionIndex];
  const correct = index === q[2];
  const timeSpent = config.duration - state.timeLeft;

  if (correct) {
    state.score += config.pointsPerCorrect;
    state.correct++;
    state.totalAnswerTime += timeSpent;
    showToast(config.successMessage);
    playSound('win');
    showFeedback(true);
    highlightAnswer(index, "correct");
  } else {
    loseLives(config.penaltyLives);
    showToast(config.failMessage);
    playSound('fail');
    showFeedback(false);
    highlightAnswer(index, "wrong");
    highlightAnswer(q[2], "correct");
  }

  setTimeout(() => nextQuestion(), 1500);
}

function highlightAnswer(index, result) {
  const buttons = document.querySelectorAll(".answer");
  if (buttons[index]) {
    buttons[index].classList.add(`answer-${result}`);
  }
  buttons.forEach((btn, i) => {
    if (i !== index) btn.classList.add("answer-locked");
  });
}

/* ==========================================================================
   9. MENÚ DE PAUSA Y CONTROL DE FLUJO DE PARTIDA
   ========================================================================== */
function pauseGame() {
  if (state.screen !== "game" || state.paused) return;

  state.paused = true;
  clearTimer();

  app.insertAdjacentHTML("beforeend", `
    <div class="overlay-panel pause-overlay" id="pauseOverlay">
      <section class="pause-card">
        <h2>JUEGO EN PAUSA</h2>
        <p>La partida está pausada.</p>

        <div class="menu-buttons">
          <button class="btn" onclick="resumeGameFromPause()">▶ REANUDAR</button>
          <button class="btn" onclick="saveGameProgressAndShow()">💾 GUARDAR PROGRESO</button>
          <button class="btn" onclick="restartCurrentGame()">↻ REINICIAR</button>
          <button class="btn secondary" onclick="pauseToCategories()">☰ CATEGORÍAS</button>
          <button class="btn secondary" onclick="goToMenu()">⌂ MENÚ</button>
          <button class="btn secondary" onclick="exitGame()">✖ SALIR DEL JUEGO</button>
        </div>
      </section>
    </div>
  `);
}

async function saveGameProgressAndShow() {
  if (!state.topic) return;

  const gameData = {
    topic: state.topic,
    questionIndex: state.questionIndex,
    score: state.score,
    correct: state.correct,
    lives: state.lives,
    totalAnswerTime: state.totalAnswerTime
  };

  const saved = await saveGameToServer(gameData);

  if (saved) {
    showToast("💾 Partida guardada. Puedes cerrar el juego.");
  }
}

function resumeGameFromPause() {
  const overlay = document.getElementById("pauseOverlay");
  if (overlay) overlay.remove();

  state.paused = false;
  state.answerLocked = false;
  state.screen = "game";
  startTimer(true);
}

function restartCurrentGame() {
  clearTimer();
  state.paused = false;
  state.answerLocked = false;
  state.questionIndex = 0;
  state.score = 0;
  state.correct = 0;
  state.lives = config.lives;
  state.totalAnswerTime = 0;
  state.startedAt = Date.now();
  const overlay = document.getElementById("pauseOverlay");
  if (overlay) overlay.remove();
  showQuestion();
}

function pauseToCategories() {
  clearTimer();
  state.paused = false;
  state.answerLocked = false;
  renderCategories();
}

async function pauseToMenu() {
  clearTimer();
  state.paused = false;
  state.answerLocked = false;
  await renderSplash();
}

function loseLives(amount) {
  state.lives = Math.max(0, state.lives - amount);
}

function nextQuestion() {
  state.questionIndex++;
  if (!QUESTIONS[state.topic] || state.questionIndex >= QUESTIONS[state.topic].length || state.lives <= 0) {
    finishGame();
  } else {
    showQuestion();
  }
}

/* ==========================================================================
   10. PANTALLA DE RESULTADOS
   ========================================================================== */
async function finishGame() {
  clearTimer();
  const total = QUESTIONS[state.topic]?.length || 0;
  const wrong = total - state.correct;
  const accuracy = total ? Math.round((state.correct / total) * 100) : 0;
  const averageTime = state.correct ? (state.totalAnswerTime / state.correct).toFixed(1) : "0.0";

  if (state.lives > 0) {
    playSound('gameWin');
  } else {
    playSound('gameLose');
  }

  let isNewRecord = false;
  if (state.score > Number(config.record || 0)) {
    isNewRecord = await updateRecordOnServer(state.score);
    if (!isNewRecord && serverAvailable) {
      config.record = state.score;
      saveConfigLocally(config);
    } else if (!serverAvailable) {
      config.record = state.score;
      saveConfigLocally(config);
      isNewRecord = true;
    }
  }

  deleteSavedGame();

  app.innerHTML = `
    <div class="overlay-panel">
      <section class="result-card">
        <h2>${escapeHTML(config.finalMessage)}</h2>
        <p><strong>Temática:</strong> ${escapeHTML(state.topic || "")}</p>
        <p><strong>Puntuación:</strong> ${state.score}</p>
        <p><strong>Aciertos:</strong> ${state.correct}</p>
        <p><strong>Fallos:</strong> ${wrong}</p>
        <p><strong>Precisión:</strong> ${accuracy}%</p>
        <p><strong>Tiempo promedio por acierto:</strong> ${averageTime}s</p>
        ${isNewRecord ? '<p style="color: #27ae60; font-weight: bold; font-size: 1.1em; margin-top: 10px;">🎉 ¡NUEVO RÉCORD! 🎉</p>' : ''}

        <div class="menu-buttons" style="margin-top: 20px;">
          <button class="btn" onclick="newGame('${escapeAttr(state.topic)}')">🔄 JUGAR OTRA VEZ</button>
          <button class="btn secondary" onclick="renderCategories()">☰ CATEGORÍAS</button>
          <button class="btn secondary" onclick="renderSplash()">⌂ MENÚ PRINCIPAL</button>
        </div>
      </section>
    </div>
  `;
}

/* ==========================================================================
   11. INICIALIZACIÓN DE LA APLICACIÓN AL CARGAR LA PÁGINA
   ========================================================================== */

/* ==========================================================================
   12. EDITOR DE PREGUNTAS (AGREGAR, EDITAR Y QUITAR)
   ========================================================================== */
let editDraft = null;
let editCategory = null;
let editQuestionIndex = -1;

function isValidQuestion(q) {
  return Array.isArray(q) &&
    typeof q[0] === "string" && q[0].trim() !== "" &&
    Array.isArray(q[1]) && q[1].length === 4 &&
    q[1].every(a => typeof a === "string" && a.trim() !== "") &&
    Number.isInteger(q[2]) && q[2] >= 0 && q[2] <= 3;
}

function isValidQuestionBank(bank) {
  if (!bank || typeof bank !== "object" || Array.isArray(bank)) return false;
  return Object.keys(bank).every(cat => Array.isArray(bank[cat]) && bank[cat].every(isValidQuestion));
}

async function loadQuestions() {
  if (serverAvailable) {
    try {
      const response = await fetch('/api/questions');
      const data = await response.json();
      if (data.success && data.data && isValidQuestionBank(data.data)) {
        QUESTIONS = data.data;
        return;
      }
    } catch (err) {
      console.warn('No se pudieron cargar las preguntas del servidor');
    }
  }

  try {
    const saved = JSON.parse(localStorage.getItem("triviaQuestions"));
    if (saved && isValidQuestionBank(saved)) {
      QUESTIONS = saved;
    }
  } catch {
    // Se usan las preguntas por defecto
  }
}

async function saveQuestions(bank) {
  localStorage.setItem("triviaQuestions", JSON.stringify(bank));

  if (!serverAvailable) {
    QUESTIONS = bank;
    return true;
  }

  try {
    const response = await fetch('/api/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bank)
    });
    const data = await response.json();
    if (data.success) {
      QUESTIONS = bank;
      return true;
    }
    showToast("❌ " + (data.error || "Error guardando preguntas"));
    return false;
  } catch (err) {
    showToast("❌ Error de conexión al guardar preguntas");
    return false;
  }
}

function renderQuestionEditor() {
  editDraft = JSON.parse(JSON.stringify(QUESTIONS));
  renderQuestionEditorHome();
}

function renderQuestionEditorHome() {
  state.screen = "editor";
  clearTimer();
  const cats = Object.keys(editDraft);

  app.innerHTML = `
    <section class="settings-card">
      <h2>EDITOR DE PREGUNTAS</h2>

      <div class="menu-buttons">
        ${cats.map((cat, i) => `
          <button class="btn" onclick="openCategoryEditor(${i})">${escapeHTML(cat)} (${editDraft[cat].length})</button>
        `).join("")}
      </div>

      <div class="setting-row" style="margin-top: 20px;">
        <label>Nueva categoría</label>
        <input id="newCatName" placeholder="Nombre de la categoría">
        <button type="button" class="btn" onclick="addCategory()">+ AGREGAR CATEGORÍA</button>
      </div>

      <div class="settings-actions">
        <button class="btn" onclick="commitQuestionEditor()">💾 GUARDAR TODO</button>
        <button class="btn secondary" onclick="renderSettings()">❌ CANCELAR</button>
      </div>
    </section>
  `;
}

function addCategory() {
  const name = document.getElementById("newCatName").value.trim();
  if (!name) {
    showToast("❌ Escribe un nombre para la categoría");
    return;
  }
  if (editDraft[name]) {
    showToast("❌ Ya existe una categoría con ese nombre");
    return;
  }
  editDraft[name] = [];
  renderQuestionEditorHome();
}

function openCategoryEditor(index) {
  editCategory = Object.keys(editDraft)[index];
  renderCategoryEditor();
}

function renderCategoryEditor() {
  state.screen = "editor";
  const list = editDraft[editCategory];

  app.innerHTML = `
    <section class="settings-card">
      <h2>${escapeHTML(editCategory)}</h2>
      <p style="text-align:center; margin-bottom: 15px;">${list.length} pregunta(s)</p>

      <div class="menu-buttons">
        ${list.map((q, i) => `
          <div style="display:grid; grid-template-columns: 1fr auto auto; gap: 8px; align-items:center;">
            <span style="text-align:left; font-size:14px;">${i + 1}. ${escapeHTML(q[0])}</span>
            <button class="btn secondary" style="padding: 8px 12px;" onclick="openQuestionForm(${i})">✏</button>
            <button class="btn secondary" style="padding: 8px 12px; background:#8f2525;" onclick="deleteQuestion(${i})">🗑</button>
          </div>
        `).join("")}
      </div>

      <div class="settings-actions" style="margin-top: 20px;">
        <button class="btn" onclick="openQuestionForm(-1)">+ AGREGAR PREGUNTA</button>
        <button class="btn secondary" onclick="renderQuestionEditorHome()">← VOLVER</button>
      </div>

      <div style="margin-top: 15px;">
        <button class="btn secondary" style="background:#8f2525;" onclick="deleteCategory()">🗑 ELIMINAR CATEGORÍA</button>
      </div>
    </section>
  `;
}

async function deleteQuestion(index) {
  const ok = await showConfirm("¿Quitar esta pregunta?", "✔ SÍ, QUITAR");
  if (!ok) return;
  editDraft[editCategory].splice(index, 1);
  renderCategoryEditor();
}

async function deleteCategory() {
  const ok = await showConfirm("¿Eliminar la categoría \"" + editCategory + "\" y todas sus preguntas?", "✔ SÍ, ELIMINAR");
  if (!ok) return;
  delete editDraft[editCategory];
  editCategory = null;
  renderQuestionEditorHome();
}

function openQuestionForm(index) {
  editQuestionIndex = index;
  const q = index >= 0 ? editDraft[editCategory][index] : ["", ["", "", "", ""], 0];

  app.innerHTML = `
    <section class="settings-card">
      <h2>${index >= 0 ? "EDITAR PREGUNTA" : "NUEVA PREGUNTA"}</h2>

      <div class="setting-row">
        <label>Pregunta</label>
        <textarea id="qText" rows="3">${escapeHTML(q[0])}</textarea>
      </div>

      ${[0, 1, 2, 3].map(i => `
        <div class="setting-row">
          <label>Respuesta ${i + 1}</label>
          <input id="qAns${i}" value="${escapeAttr(q[1][i])}">
        </div>
      `).join("")}

      <div class="setting-row">
        <label>Respuesta correcta</label>
        <select id="qCorrect">
          ${[0, 1, 2, 3].map(i => `<option value="${i}" ${q[2] === i ? "selected" : ""}>Respuesta ${i + 1}</option>`).join("")}
        </select>
      </div>

      <div class="settings-actions">
        <button class="btn" onclick="saveQuestionForm()">💾 GUARDAR PREGUNTA</button>
        <button class="btn secondary" onclick="renderCategoryEditor()">❌ CANCELAR</button>
      </div>
    </section>
  `;
}

function saveQuestionForm() {
  const text = document.getElementById("qText").value.trim();
  const answers = [0, 1, 2, 3].map(i => document.getElementById(`qAns${i}`).value.trim());
  const correct = parseInt(document.getElementById("qCorrect").value);

  if (!text) {
    showToast("❌ Escribe el texto de la pregunta");
    return;
  }
  if (answers.some(a => !a)) {
    showToast("❌ Completa las 4 respuestas");
    return;
  }

  const q = [text, answers, correct];
  if (editQuestionIndex >= 0) {
    editDraft[editCategory][editQuestionIndex] = q;
  } else {
    editDraft[editCategory].push(q);
  }
  renderCategoryEditor();
}

async function commitQuestionEditor() {
  const total = Object.values(editDraft).reduce((n, list) => n + list.length, 0);
  if (total === 0) {
    showToast("❌ Debe haber al menos una pregunta");
    return;
  }

  const ok = await saveQuestions(editDraft);
  if (ok) {
    showToast("✅ Preguntas guardadas");
    renderSettings();
  }
}


// ✅ CRÉDITO FIJO EN LA ESQUINA INFERIOR IZQUIERDA (EN TODAS LAS PANTALLAS)
const creditEl = document.createElement("div");
creditEl.textContent = "Hecho por: Laura Georgina Ruiz Campos";
creditEl.style.cssText = "position: fixed; left: 12px; bottom: 10px; z-index: 60; color: #fff; font-size: 13px; font-weight: bold; text-shadow: 0 2px 6px #000; pointer-events: none;";
document.body.appendChild(creditEl);

window.addEventListener("DOMContentLoaded", async () => {
  await loadConfig();
  await loadQuestions();
  await renderSplash();
});
// ✅ TECLA H: OCULTAR / MOSTRAR TODA LA INTERFAZ (SOLO FONDO)
document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea, select")) return;
  if (e.key.toLowerCase() === "h") {
    document.body.classList.toggle("ui-hidden");
  }
});