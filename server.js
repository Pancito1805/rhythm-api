const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const DB_FILE = path.join(__dirname, 'scores.json');

// Inicializar base de datos
if (!fs.existsSync(DB_FILE)) {
    const initialDB = {
        users: {},
        global_leaderboard: [],
        game_history: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialDB, null, 2));
    console.log("Base de datos inicializada");
}

function readDB() {
    try {
        return JSON.parse(fs.readFileSync(DB_FILE));
    } catch (e) {
        console.error("Error leyendo DB:", e);
        return { users: {}, global_leaderboard: [], game_history: [] };
    }
}

function saveDB(db) {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ==================== PING PARA CRON JOB ====================
app.get('/api/ping', (req, res) => {
    const now = new Date();
    console.log(`[PING] ${now.toISOString()} - Servidor activo`);
    res.json({ 
        status: 'ok', 
        message: 'Server is running',
        timestamp: now.toISOString(),
        uptime: process.uptime()
    });
});

// ==================== HEALTH CHECK ====================
app.get('/api/health', (req, res) => {
    const db = readDB();
    const stats = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        users_count: Object.keys(db.users).length,
        leaderboard_count: db.global_leaderboard.length,
        game_history_count: db.game_history.length
    };
    res.json(stats);
});

// ==================== 1. REGISTRO DE USUARIO ====================
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    
    console.log("Registro - Usuario:", username);
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Faltan datos' });
    }
    
    if (username.length < 3) {
        return res.status(400).json({ error: 'El usuario debe tener al menos 3 caracteres' });
    }
    
    if (password.length < 3) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 3 caracteres' });
    }
    
    const db = readDB();
    
    if (db.users[username]) {
        return res.status(400).json({ error: 'El usuario ya existe' });
    }
    
    const simpleHash = Buffer.from(password).toString('base64');
    
    db.users[username] = {
        password: simpleHash,
        games: [],
        stats: {
            total_games: 0,
            victories: 0,
            defeats: 0,
            total_perfect: 0,
            total_great: 0,
            total_good: 0,
            total_ok: 0,
            total_miss: 0,
            best_combo: 0,
            best_time: 0
        },
        created_at: new Date().toISOString()
    };
    
    saveDB(db);
    console.log("Usuario registrado:", username);
    res.json({ success: true, message: 'Usuario creado exitosamente' });
});

// ==================== 2. LOGIN DE USUARIO ====================
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    console.log("Login - Usuario:", username);
    
    const db = readDB();
    const user = db.users[username];
    
    if (!user) {
        return res.status(401).json({ error: 'Usuario no existe' });
    }
    
    const hash = Buffer.from(password).toString('base64');
    
    if (user.password !== hash) {
        return res.status(401).json({ error: 'Contraseña incorrecta' });
    }
    
    console.log("Login exitoso:", username);
    res.json({ success: true, username: username });
});

// ==================== 3. GUARDAR PARTIDA COMPLETA (MODIFICADO) ====================
app.post('/api/save_game_complete', (req, res) => {
    const { username, song, combo, victory, time, difficulty, perfect, great, good, ok, miss, boss_hp_remaining, player_hp_remaining, date } = req.body;
    
    console.log("Guardando partida completa para:", username);
    console.log("  Datos:", { combo, victory, time, difficulty, perfect, great, good, ok, miss });
    
    const db = readDB();
    
    if (!db.users[username]) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    const gameEntry = {
        song: song || "RHYTHM_HELL",
        combo: combo || 0,
        victory: victory || false,
        time: time || 0,
        difficulty: difficulty || "MEDIO",
        perfect: perfect || 0,
        great: great || 0,
        good: good || 0,
        ok: ok || 0,
        miss: miss || 0,
        boss_hp_remaining: boss_hp_remaining || 0,
        player_hp_remaining: player_hp_remaining || 0,
        date: date || new Date().toISOString()
    };
    
    // Guardar en historial del usuario
    db.users[username].games.push(gameEntry);
    
    // Actualizar estadisticas
    const stats = db.users[username].stats;
    stats.total_games += 1;
    if (victory) {
        stats.victories += 1;
    } else {
        stats.defeats += 1;
    }
    stats.total_perfect += perfect;
    stats.total_great += great;
    stats.total_good += good;
    stats.total_ok += ok;
    stats.total_miss += miss;
    if (combo > stats.best_combo) {
        stats.best_combo = combo;
    }
    if (victory && (stats.best_time === 0 || time < stats.best_time)) {
        stats.best_time = time;
    }
    
    // Guardar en historial global
    db.game_history.push({
        username: username,
        song: song,
        combo: combo,
        victory: victory,
        time: time,
        difficulty: difficulty,
        perfect: perfect,
        great: great,
        good: good,
        ok: ok,
        miss: miss,
        date: date || new Date().toISOString()
    });
    
    // Ordenar y limitar historial
    db.game_history.sort((a, b) => new Date(b.date) - new Date(a.date));
    db.game_history = db.game_history.slice(0, 200);
    
    // Actualizar leaderboard global con TODOS los campos (solo victorias)
    if (victory) {
        const leaderboardEntry = {
            name: username,
            combo: combo || 0,
            time: time || 0,
            difficulty: difficulty || "MEDIO",
            perfect: perfect || 0,
            great: great || 0,
            good: good || 0,
            ok: ok || 0,
            miss: miss || 0,
            victory: true,
            date: date || new Date().toISOString()
        };
        db.global_leaderboard.push(leaderboardEntry);
        
        // Ordenar por tiempo (menor es mejor)
        db.global_leaderboard.sort((a, b) => {
            if (a.time !== b.time) return a.time - b.time;
            return b.combo - a.combo;
        });
        db.global_leaderboard = db.global_leaderboard.slice(0, 100);
    }
    
    saveDB(db);
    console.log("Partida guardada para:", username);
    res.json({ success: true });
});

// ==================== 4. GUARDAR PARTIDA (LEGACY) ====================
app.post('/api/save_game', (req, res) => {
    const { username, score, song, combo, player, date } = req.body;
    console.log("Guardado legacy para:", username);
    
    const db = readDB();
    
    if (!db.users[username]) {
        db.users[username] = {
            password: Buffer.from("temporal").toString('base64'),
            games: [],
            stats: { total_games: 0, victories: 0, defeats: 0, total_perfect: 0, total_great: 0, total_good: 0, total_ok: 0, total_miss: 0, best_combo: 0, best_time: 0 },
            created_at: new Date().toISOString()
        };
    }
    
    const gameEntry = {
        song: song || "RHYTHM_HELL",
        combo: combo || 0,
        victory: false,
        time: 0,
        difficulty: "MEDIO",
        perfect: 0,
        great: 0,
        good: 0,
        ok: 0,
        miss: 0,
        boss_hp_remaining: 0,
        player_hp_remaining: 0,
        date: date || new Date().toISOString()
    };
    
    db.users[username].games.push(gameEntry);
    db.users[username].stats.total_games += 1;
    
    if (combo > db.users[username].stats.best_combo) {
        db.users[username].stats.best_combo = combo;
    }
    
    saveDB(db);
    res.json({ success: true });
});

// ==================== 5. OBTENER HISTORIAL DEL USUARIO ====================
app.get('/api/user_games/:username', (req, res) => {
    const { username } = req.params;
    console.log("Obteniendo historial de:", username);
    
    const db = readDB();
    
    if (!db.users[username]) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    const games = db.users[username].games;
    games.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    res.json(games);
});

// ==================== 6. OBTENER ESTADISTICAS DEL USUARIO ====================
app.get('/api/user_stats/:username', (req, res) => {
    const { username } = req.params;
    console.log("Obteniendo estadisticas de:", username);
    
    const db = readDB();
    
    if (!db.users[username]) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    res.json(db.users[username].stats);
});

// ==================== 7. OBTENER TODOS LOS USUARIOS ====================
app.get('/api/users', (req, res) => {
    console.log("Obteniendo lista de usuarios");
    const db = readDB();
    
    const usersList = Object.keys(db.users).map(username => ({
        username: username,
        games_played: db.users[username].games.length,
        created_at: db.users[username].created_at,
        best_combo: db.users[username].stats.best_combo,
        victories: db.users[username].stats.victories
    }));
    
    res.json(usersList);
});

// ==================== 8. OBTENER DETALLES DE UN USUARIO ====================
app.get('/api/user/:username', (req, res) => {
    const { username } = req.params;
    console.log("Obteniendo detalles de usuario:", username);
    
    const db = readDB();
    
    if (!db.users[username]) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    res.json({
        username: username,
        stats: db.users[username].stats,
        total_games: db.users[username].games.length,
        created_at: db.users[username].created_at,
        games: db.users[username].games.slice(0, 10)
    });
});

// ==================== 9. LEADERBOARD GLOBAL (MODIFICADO) ====================
app.get('/api/global_leaderboard', (req, res) => {
    console.log("Obteniendo leaderboard global");
    const db = readDB();
    // Devolver todos los campos
    res.json(db.global_leaderboard);
});

// ==================== 10. LEADERBOARD POR CANCION ====================
app.get('/api/song_leaderboard/:song', (req, res) => {
    const { song } = req.params;
    console.log("Obteniendo leaderboard para cancion:", song);
    
    const db = readDB();
    const songLeaderboard = db.game_history
        .filter(game => game.song === song && game.victory === true)
        .sort((a, b) => {
            if (a.time !== b.time) return a.time - b.time;
            return b.combo - a.combo;
        })
        .slice(0, 50);
    
    res.json(songLeaderboard);
});

// ==================== 11. TOP JUGADORES ====================
app.get('/api/top_players', (req, res) => {
    console.log("Obteniendo top jugadores");
    const db = readDB();
    
    const playersStats = [];
    for (const [name, user] of Object.entries(db.users)) {
        playersStats.push({
            name: name,
            total_games: user.stats.total_games,
            victories: user.stats.victories,
            defeats: user.stats.defeats,
            best_combo: user.stats.best_combo,
            best_time: user.stats.best_time,
            total_perfect: user.stats.total_perfect,
            total_great: user.stats.total_great,
            total_good: user.stats.total_good,
            total_ok: user.stats.total_ok,
            total_miss: user.stats.total_miss
        });
    }
    
    playersStats.sort((a, b) => b.victories - a.victories);
    res.json(playersStats.slice(0, 20));
});

// ==================== 12. ENDPOINT GLOBAL (LEGACY) ====================
app.get('/api/global', (req, res) => {
    console.log("Endpoint global legacy usado");
    const db = readDB();
    res.json(db.global_leaderboard);
});

// ==================== 13. ENDPOINT SCORES (LEGACY) ====================
app.post('/api/scores', (req, res) => {
    const { name, score, song, combo, player } = req.body;
    console.log("Endpoint scores legacy usado para:", name);
    
    const db = readDB();
    
    if (!db.users[name]) {
        db.users[name] = {
            password: Buffer.from("temporal").toString('base64'),
            games: [],
            stats: { total_games: 0, victories: 0, defeats: 0, total_perfect: 0, total_great: 0, total_good: 0, total_ok: 0, total_miss: 0, best_combo: 0, best_time: 0 },
            created_at: new Date().toISOString()
        };
    }
    
    const gameEntry = {
        song: song || "RHYTHM_HELL",
        combo: combo || 0,
        victory: false,
        time: 0,
        difficulty: "MEDIO",
        perfect: 0,
        great: 0,
        good: 0,
        ok: 0,
        miss: 0,
        boss_hp_remaining: 0,
        player_hp_remaining: 0,
        date: new Date().toISOString()
    };
    
    db.users[name].games.push(gameEntry);
    db.users[name].stats.total_games += 1;
    
    if (combo > db.users[name].stats.best_combo) {
        db.users[name].stats.best_combo = combo;
    }
    
    saveDB(db);
    res.json({ success: true });
});

// ==================== 14. ELIMINAR USUARIO ====================
app.delete('/api/user/:username', (req, res) => {
    const { username } = req.params;
    console.log("Eliminando usuario:", username);
    
    const db = readDB();
    
    if (!db.users[username]) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    // Eliminar del leaderboard global
    db.global_leaderboard = db.global_leaderboard.filter(entry => entry.name !== username);
    
    // Eliminar del historial global
    db.game_history = db.game_history.filter(entry => entry.username !== username);
    
    // Eliminar usuario
    delete db.users[username];
    
    saveDB(db);
    console.log("Usuario eliminado:", username);
    res.json({ success: true, message: `Usuario ${username} eliminado` });
});

// ==================== 15. ELIMINAR TODOS LOS DATOS ====================
app.delete('/api/clear-all', (req, res) => {
    console.log("ELIMINANDO TODOS LOS DATOS");
    
    const emptyDB = {
        users: {},
        global_leaderboard: [],
        game_history: []
    };
    saveDB(emptyDB);
    
    console.log("Base de datos limpiada");
    res.json({ success: true, message: "Todos los datos eliminados" });
});

// ==================== 16. ELIMINAR DATOS (LEGACY) ====================
app.delete('/api/clear', (req, res) => {
    console.log("Endpoint clear legacy usado");
    const emptyDB = {
        users: {},
        global_leaderboard: [],
        game_history: []
    };
    saveDB(emptyDB);
    res.json({ success: true, message: "Datos eliminados" });
});

// ==================== INICIAR SERVIDOR ====================
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log("\n=== ENDPOINTS DISPONIBLES ===");
    console.log("USUARIOS:");
    console.log("  GET  /api/users - Ver todos los usuarios");
    console.log("  GET  /api/user/:username - Ver detalles de usuario");
    console.log("  GET  /api/user_stats/:username - Ver estadisticas");
    console.log("  GET  /api/user_games/:username - Ver historial");
    console.log("  POST /api/register - Registrar usuario");
    console.log("  POST /api/login - Iniciar sesion");
    console.log("  DELETE /api/user/:username - Eliminar usuario");
    console.log("\nPARTIDAS:");
    console.log("  POST /api/save_game_complete - Guardar partida completa");
    console.log("  POST /api/save_game - Guardar partida (legacy)");
    console.log("\nLEADERBOARDS:");
    console.log("  GET /api/global_leaderboard - Leaderboard global");
    console.log("  GET /api/song_leaderboard/:song - Leaderboard por cancion");
    console.log("  GET /api/top_players - Top jugadores");
    console.log("\nCRON / MONITOREO:");
    console.log("  GET /api/ping - Ping para cron job");
    console.log("  GET /api/health - Health check con estadisticas");
    console.log("\nADMIN:");
    console.log("  DELETE /api/clear-all - Eliminar todos los datos");
    console.log("  DELETE /api/clear - Eliminar datos (legacy)");
});
