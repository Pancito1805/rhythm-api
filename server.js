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
        game_history: []  // NUEVO: historial completo de partidas
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialDB, null, 2));
}

function readDB() {
    return JSON.parse(fs.readFileSync(DB_FILE));
}

function saveDB(db) {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ===== 1. REGISTRO =====
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Missing data' });
    }
    
    if (username.length < 3) {
        return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    
    if (password.length < 3) {
        return res.status(400).json({ error: 'Password must be at least 3 characters' });
    }
    
    const db = readDB();
    
    if (db.users[username]) {
        return res.status(400).json({ error: 'User already exists' });
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
    console.log("User registered:", username);
    res.json({ success: true, message: 'User created successfully' });
});

// ===== 2. LOGIN =====
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    const db = readDB();
    const user = db.users[username];
    
    if (!user) {
        return res.status(401).json({ error: 'User not found' });
    }
    
    const hash = Buffer.from(password).toString('base64');
    
    if (user.password !== hash) {
        return res.status(401).json({ error: 'Incorrect password' });
    }
    
    console.log("Login successful:", username);
    res.json({ success: true, username: username });
});

// ===== 3. NUEVO: Guardar partida COMPLETA =====
app.post('/api/save_game_complete', (req, res) => {
    const { username, song, combo, victory, time, difficulty, perfect, great, good, ok, miss, boss_hp_remaining, player_hp_remaining, date } = req.body;
    
    console.log("Saving complete game for:", username);
    
    const db = readDB();
    
    if (!db.users[username]) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    const gameEntry = {
        song: song,
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
    
    // Actualizar leaderboard global (solo victorias con combo)
    const leaderboardEntry = {
        name: username,
        combo: combo,
        song: song,
        difficulty: difficulty,
        date: date || new Date().toISOString()
    };
    db.global_leaderboard.push(leaderboardEntry);
    db.global_leaderboard.sort((a, b) => b.combo - a.combo);
    db.global_leaderboard = db.global_leaderboard.slice(0, 100);
    
    saveDB(db);
    console.log("Game saved successfully for:", username);
    res.json({ success: true });
});

// ===== 4. Obtener historial del usuario =====
app.get('/api/user_games/:username', (req, res) => {
    const { username } = req.params;
    console.log("Getting games for:", username);
    
    const db = readDB();
    
    if (!db.users[username]) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    const games = db.users[username].games;
    games.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    res.json(games);
});

// ===== 5. NUEVO: Obtener estadisticas del usuario =====
app.get('/api/user_stats/:username', (req, res) => {
    const { username } = req.params;
    console.log("Getting stats for:", username);
    
    const db = readDB();
    
    if (!db.users[username]) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    const stats = db.users[username].stats;
    res.json(stats);
});

// ===== 6. Obtener leaderboard por combo =====
app.get('/api/global_leaderboard', (req, res) => {
    console.log("Getting global leaderboard");
    const db = readDB();
    res.json(db.global_leaderboard.slice(0, 50));
});

// ===== 7. Obtener leaderboard por cancion =====
app.get('/api/song_leaderboard/:song', (req, res) => {
    const { song } = req.params;
    console.log("Getting leaderboard for song:", song);
    
    const db = readDB();
    const songLeaderboard = db.game_history
        .filter(game => game.song === song && game.victory === true)
        .sort((a, b) => b.combo - a.combo)
        .slice(0, 50);
    
    res.json(songLeaderboard);
});

// ===== 8. Obtener ranking de jugadores =====
app.get('/api/top_players', (req, res) => {
    console.log("Getting top players");
    const db = readDB();
    
    const playersStats = [];
    for (const [name, user] of Object.entries(db.users)) {
        playersStats.push({
            name: name,
            total_games: user.stats.total_games,
            victories: user.stats.victories,
            best_combo: user.stats.best_combo,
            best_time: user.stats.best_time
        });
    }
    
    playersStats.sort((a, b) => b.victories - a.victories);
    res.json(playersStats.slice(0, 20));
});

// ===== 9. Endpoint antiguo para compatibilidad =====
app.post('/api/save_game', (req, res) => {
    const { username, score, song, combo, player, date } = req.body;
    console.log("Legacy save for:", username);
    
    const db = readDB();
    
    if (!db.users[username]) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    const gameEntry = {
        score: parseInt(score),
        song: song,
        combo: combo || 0,
        player: player || 1,
        date: date || new Date().toISOString()
    };
    db.users[username].games.push(gameEntry);
    
    saveDB(db);
    res.json({ success: true });
});

app.get('/api/global', (req, res) => {
    const db = readDB();
    res.json(db.global_leaderboard.slice(0, 20));
});

app.post('/api/scores', (req, res) => {
    const { name, score, song, combo, player } = req.body;
    console.log("Legacy scores endpoint for:", name);
    
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
        score: parseInt(score),
        song: song,
        combo: combo || 0,
        player: player || 1,
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

// ===== INICIAR SERVIDOR =====
app.listen(PORT, () => {
    console.log(`API running on http://localhost:${PORT}`);
    console.log(`Endpoints:`);
    console.log(`   POST /api/register`);
    console.log(`   POST /api/login`);
    console.log(`   POST /api/save_game_complete - NUEVO`);
    console.log(`   GET /api/user_games/:username`);
    console.log(`   GET /api/user_stats/:username - NUEVO`);
    console.log(`   GET /api/global_leaderboard`);
    console.log(`   GET /api/song_leaderboard/:song - NUEVO`);
    console.log(`   GET /api/top_players`);
});
