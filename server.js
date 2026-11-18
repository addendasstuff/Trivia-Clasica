const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const app = express();
const PORT = 8000;

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// Rutas de archivos
const DATA_DIR = path.join(__dirname, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const SAVES_FILE = path.join(DATA_DIR, 'saves.json');
const QUESTIONS_FILE = path.join(DATA_DIR, 'questions.json');

// Configuración por defecto
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

// ✅ CREAR CARPETA /data SI NO EXISTE
(async () => {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    console.log(`✅ Carpeta /data verificada en: ${DATA_DIR}`);
  } catch (err) {
    console.error('❌ Error creando carpeta /data:', err);
  }
})();

// ✅ LEER CONFIG.JSON
async function readConfig() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.warn('⚠️ No se encontró config.json, usando valores por defecto');
    return { ...DEFAULT_CONFIG };
  }
}

// ✅ ESCRIBIR CONFIG.JSON
async function writeConfig(data) {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf-8');
    console.log('✅ config.json guardado correctamente');
    return true;
  } catch (err) {
    console.error('❌ Error escribiendo config.json:', err);
    return false;
  }
}

// ✅ LEER SAVES.JSON
async function readSaves() {
  try {
    const data = await fs.readFile(SAVES_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return null; // No hay partidas guardadas
  }
}

// ✅ ESCRIBIR SAVES.JSON
async function writeSaves(data) {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(SAVES_FILE, JSON.stringify(data, null, 2), 'utf-8');
    console.log('✅ saves.json guardado correctamente');
    return true;
  } catch (err) {
    console.error('❌ Error escribiendo saves.json:', err);
    return false;
  }
}

// ===================================
// 📡 ENDPOINTS DE API
// ===================================

// ✅ GET /api/config - Leer configuración
app.get('/api/config', async (req, res) => {
  try {
    const config = await readConfig();
    res.json({
      success: true,
      data: config
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Error leyendo configuración',
      message: err.message
    });
  }
});

// ✅ POST /api/config - Guardar configuración
app.post('/api/config', async (req, res) => {
  try {
    const newConfig = req.body;

    if (!newConfig || typeof newConfig !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Datos inválidos'
      });
    }

    const currentConfig = await readConfig();

    const mergedConfig = {
      ...currentConfig,
      ...newConfig
    };

    // Validaciones
    if (mergedConfig.duration < 10 || mergedConfig.duration > 180) {
      return res.status(400).json({
        success: false,
        error: 'Duración debe estar entre 10 y 180 segundos'
      });
    }

    if (mergedConfig.lives < 1 || mergedConfig.lives > 20) {
      return res.status(400).json({
        success: false,
        error: 'Vidas debe estar entre 1 y 20'
      });
    }

    if (mergedConfig.pointsPerCorrect < 0 || mergedConfig.pointsPerCorrect > 1000) {
      return res.status(400).json({
        success: false,
        error: 'Puntos debe estar entre 0 y 1000'
      });
    }

    // Proteger récord (nunca baja)
    if (mergedConfig.record < currentConfig.record) {
      mergedConfig.record = currentConfig.record;
    }

    const saved = await writeConfig(mergedConfig);

    if (saved) {
      res.json({
        success: true,
        message: 'Configuración guardada correctamente',
        data: mergedConfig
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Error guardando configuración'
      });
    }
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Error procesando solicitud',
      message: err.message
    });
  }
});

// ✅ POST /api/config/record - Actualizar récord
app.post('/api/config/record', async (req, res) => {
  try {
    const { score } = req.body;

    if (typeof score !== 'number' || score < 0) {
      return res.status(400).json({
        success: false,
        error: 'Score debe ser un número positivo'
      });
    }

    const currentConfig = await readConfig();

    if (score > currentConfig.record) {
      currentConfig.record = score;
      const saved = await writeConfig(currentConfig);

      if (saved) {
        res.json({
          success: true,
          isNewRecord: true,
          newRecord: score,
          message: '🏆 ¡Nuevo récord!'
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Error actualizando récord'
        });
      }
    } else {
      res.json({
        success: true,
        isNewRecord: false,
        record: currentConfig.record
      });
    }
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Error procesando solicitud',
      message: err.message
    });
  }
});

// ✅ POST /api/saves - Guardar progreso de partida
app.post('/api/saves', async (req, res) => {
  try {
    const saveData = req.body;

    if (!saveData || typeof saveData !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Datos de partida inválidos'
      });
    }

    if (!saveData.topic) {
      return res.status(400).json({
        success: false,
        error: 'Falta el tema de la partida'
      });
    }

    // Agregar timestamp
    const save = {
      ...saveData,
      savedAt: new Date().toISOString()
    };

    const saved = await writeSaves(save);

    if (saved) {
      res.json({
        success: true,
        message: 'Partida guardada correctamente',
        data: save
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Error guardando partida'
      });
    }
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Error procesando solicitud',
      message: err.message
    });
  }
});

// ✅ GET /api/saves - Leer partida guardada
app.get('/api/saves', async (req, res) => {
  try {
    const save = await readSaves();

    if (save) {
      res.json({
        success: true,
        hasSave: true,
        data: save
      });
    } else {
      res.json({
        success: true,
        hasSave: false,
        data: null
      });
    }
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Error leyendo partida guardada',
      message: err.message
    });
  }
});

// ✅ POST /api/config/reset-record - Reiniciar récord a 0
app.post('/api/config/reset-record', async (req, res) => {
  try {
    const currentConfig = await readConfig();
    currentConfig.record = 0;
    const saved = await writeConfig(currentConfig);
    res.json({ success: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error reiniciando récord' });
  }
});


// ===================================
// ❓ BANCO DE PREGUNTAS
// ===================================
function isValidQuestion(q) {
  return Array.isArray(q) &&
    typeof q[0] === 'string' && q[0].trim() !== '' &&
    Array.isArray(q[1]) && q[1].length === 4 &&
    q[1].every(a => typeof a === 'string' && a.trim() !== '') &&
    Number.isInteger(q[2]) && q[2] >= 0 && q[2] <= 3;
}

function isValidBank(bank) {
  if (!bank || typeof bank !== 'object' || Array.isArray(bank)) return false;
  return Object.keys(bank).every(cat => Array.isArray(bank[cat]) && bank[cat].every(isValidQuestion));
}

// ✅ GET /api/questions - Leer banco de preguntas
app.get('/api/questions', async (req, res) => {
  try {
    const data = await fs.readFile(QUESTIONS_FILE, 'utf-8')
      .then(JSON.parse)
      .catch(() => null);
    res.json({ success: true, hasData: data !== null, data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error leyendo preguntas' });
  }
});

// ✅ POST /api/questions - Guardar banco de preguntas
app.post('/api/questions', async (req, res) => {
  try {
    const bank = req.body;
    if (!isValidBank(bank)) {
      return res.status(400).json({ success: false, error: 'Formato de preguntas inválido' });
    }
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(QUESTIONS_FILE, JSON.stringify(bank, null, 2), 'utf-8');
    res.json({ success: true, message: 'Preguntas guardadas' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error guardando preguntas' });
  }
});

// ✅ DELETE /api/saves - Eliminar partida guardada
app.delete('/api/saves', async (req, res) => {
  try {
    await fs.unlink(SAVES_FILE).catch(() => null);
    res.json({
      success: true,
      message: 'Partida eliminada'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Error eliminando partida',
      message: err.message
    });
  }
});

// ✅ Inicializar config.json si no existe
(async () => {
  try {
    const configExists = await fs.stat(CONFIG_FILE).catch(() => null);
    if (!configExists) {
      console.log('📝 Creando config.json con valores por defecto...');
      await writeConfig(DEFAULT_CONFIG);
      console.log('✅ config.json creado exitosamente');
    }
  } catch (err) {
    console.error('❌ Error inicializando config.json:', err);
  }
})();

// ===================================
// 🚀 INICIAR SERVIDOR
// ===================================
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   🎮 SERVIDOR TRIVIA CLÁSICA ACTIVO   ║
╠════════════════════════════════════════╣
║ 🌐 Puerto: http://localhost:${PORT}        ║
║ 📁 Archivos: ${__dirname}     ║
║ 📄 Config: ${CONFIG_FILE}    ║
║ 💾 Saves: ${SAVES_FILE}     ║
╚════════════════════════════════════════╝
  `);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Error no capturado:', err);
  process.exit(1);
});