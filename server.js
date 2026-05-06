const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const DB_FILE = path.join(__dirname, 'scores.json');

// ===== INICIALIZAR BASE DE DATOS =====
if (!fs.existsSync(DB_FILE)) {
    const initialDB = {
        users: {},
        global_leaderboard: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialDB, null, 2));
}

// ===== FUNCIÓN PARA LEER BASE DE DATOS =====
function readDB() {
    return JSON.parse(fs.readFileSync(DB_FILE));
}

// ===== FUNCIÓN PARA GUARDAR BASE DE DATOS =====
function saveDB(db) {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ===== 1. REGISTRO DE USUARIO =====
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    
    console.log("📝 Intento de registro:", username);
    
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
        created_at: new Date().toISOString()
    };
    
    saveDB(db);
    console.log("✅ Usuario registrado:", username);
    res.json({ success: true, message: 'Usuario creado exitosamente' });
});

// ===== 2. LOGIN DE USUARIO =====
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    console.log("🔐 Intento de login:", username);
    
    const db = readDB();
    const user = db.users[username];
    
    if (!user) {
        return res.status(401).json({ error: 'Usuario no existe' });
    }
    
    const hash = Buffer.from(password).toString('base64');
    
    if (user.password !== hash) {
        return res.status(401).json({ error: 'Contraseña incorrecta' });
    }
    
    console.log("✅ Login exitoso:", username);
    res.json({ success: true, username: username });
});

// ===== 3. GUARDAR PARTIDA =====
app.post('/api/save_game', (req, res) => {
    const { username, score, song, combo, player, date } = req.body;
    
    console.log("💾 Guardando partida de:", username, "- Puntaje:", score);
    
    const db = readDB();
    
    if (!db.users[username]) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    const gameEntry = { 
        score: parseInt(score), 
        song: song, 
        combo: combo || 0, 
        player: player || 1, 
        date: date || new Date().toISOString() 
    };
    db.users[username].games.push(gameEntry);
    
    const leaderboardEntry = { 
        name: username, 
        score: parseInt(score), 
        song: song, 
        combo: combo || 0, 
        date: date || new Date().toISOString() 
    };
    db.global_leaderboard.push(leaderboardEntry);
    
    db.global_leaderboard.sort((a, b) => b.score - a.score);
    db.global_leaderboard = db.global_leaderboard.slice(0, 100);
    
    saveDB(db);
    console.log("✅ Partida guardada correctamente");
    res.json({ success: true });
});

// ===== 4. OBTENER HISTORIAL DEL USUARIO =====
app.get('/api/user_games/:username', (req, res) => {
    const { username } = req.params;
    console.log("📋 Solicitando historial de:", username);
    
    const db = readDB();
    
    if (!db.users[username]) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    const games = db.users[username].games;
    games.sort((a, b) => b.score - a.score);
    
    res.json(games);
});

// ===== 5. OBTENER LEADERBOARD GLOBAL =====
app.get('/api/global_leaderboard', (req, res) => {
    console.log("🏆 Solicitando leaderboard global");
    const db = readDB();
    res.json(db.global_leaderboard.slice(0, 50));
});

// ===== 6. OBTENER TOP JUGADORES =====
app.get('/api/top_players', (req, res) => {
    console.log("👑 Solicitando top jugadores");
    const db = readDB();
    
    const playersStats = [];
    for (const [name, user] of Object.entries(db.users)) {
        let totalScore = 0;
        let gamesCount = user.games.length;
        let bestScore = 0;
        
        for (const game of user.games) {
            totalScore += game.score;
            if (game.score > bestScore) bestScore = game.score;
        }
        
        playersStats.push({
            name: name,
            total_score: totalScore,
            best_score: bestScore,
            games_played: gamesCount
        });
    }
    
    playersStats.sort((a, b) => b.total_score - a.total_score);
    res.json(playersStats.slice(0, 20));
});

// ===== 7. ENDPOINT PARA VER TODOS LOS USUARIOS =====
app.get('/api/users', (req, res) => {
    console.log("📋 Solicitando lista de usuarios");
    const db = readDB();
    
    const usersList = Object.keys(db.users).map(username => ({
        username: username,
        games_played: db.users[username].games.length,
        created_at: db.users[username].created_at
    }));
    
    res.json(usersList);
});

// ===== 8. ENDPOINT PARA VER DETALLES DE UN USUARIO =====
app.get('/api/user/:username', (req, res) => {
    const { username } = req.params;
    console.log("🔍 Solicitando detalles de usuario:", username);
    
    const db = readDB();
    
    if (!db.users[username]) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    res.json({
        username: username,
        games: db.users[username].games,
        total_games: db.users[username].games.length,
        created_at: db.users[username].created_at
    });
});

// ===== 9. ENDPOINT PARA ELIMINAR UN USUARIO =====
app.delete('/api/user/:username', (req, res) => {
    const { username } = req.params;
    console.log("🗑️ Eliminando usuario:", username);
    
    const db = readDB();
    
    if (!db.users[username]) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    // Eliminar sus partidas del leaderboard global
    db.global_leaderboard = db.global_leaderboard.filter(entry => entry.name !== username);
    
    // Eliminar usuario
    delete db.users[username];
    
    saveDB(db);
    console.log("✅ Usuario", username, "eliminado");
    res.json({ success: true, message: `Usuario ${username} eliminado` });
});

// ===== 10. ENDPOINT PARA ELIMINAR TODOS LOS DATOS =====
app.delete('/api/clear-all', (req, res) => {
    console.log("🗑️ ELIMINANDO TODOS LOS DATOS");
    
    const emptyDB = {
        users: {},
        global_leaderboard: []
    };
    saveDB(emptyDB);
    
    console.log("✅ Base de datos completamente limpiada");
    res.json({ success: true, message: "Todos los datos eliminados" });
});

// ===== 11. ENDPOINT ANTIGUO PARA COMPATIBILIDAD =====
app.post('/api/scores', (req, res) => {
    const { name, score, song, combo, player } = req.body;
    console.log("⚠️ Endpoint antiguo usado - redirigiendo a save_game");
    
    const username = name;
    const date = new Date().toISOString();
    
    const db = readDB();
    
    if (!db.users[username]) {
        db.users[username] = {
            password: Buffer.from("temporal").toString('base64'),
            games: [],
            created_at: date
        };
    }
    
    const gameEntry = { score: parseInt(score), song, combo: combo || 0, player: player || 1, date };
    db.users[username].games.push(gameEntry);
    
    const leaderboardEntry = { name: username, score: parseInt(score), song, combo: combo || 0, date };
    db.global_leaderboard.push(leaderboardEntry);
    db.global_leaderboard.sort((a, b) => b.score - a.score);
    db.global_leaderboard = db.global_leaderboard.slice(0, 100);
    
    saveDB(db);
    res.json({ success: true });
});

// ===== 12. ENDPOINT ANTIGUO /global =====
app.get('/api/global', (req, res) => {
    console.log("⚠️ Endpoint antiguo /global usado");
    const db = readDB();
    res.json(db.global_leaderboard.slice(0, 20));
});

// ===== 13. LIMPIAR BASE DE DATOS (endpoint original) =====
app.delete('/api/clear', (req, res) => {
    const emptyDB = {
        users: {},
        global_leaderboard: []
    };
    saveDB(emptyDB);
    console.log("🗑️ Base de datos limpiada");
    res.json({ success: true, message: "Datos eliminados" });
});

// ===== INICIAR SERVIDOR =====
app.listen(PORT, () => {
    console.log(`🎵 API de Rhythm Game corriendo en http://localhost:${PORT}`);
    console.log(`📋 Endpoints disponibles:`);
    console.log(`   POST /api/register - Registro de usuario`);
    console.log(`   POST /api/login - Inicio de sesión`);
    console.log(`   POST /api/save_game - Guardar partida`);
    console.log(`   GET /api/user_games/:username - Historial del usuario`);
    console.log(`   GET /api/global_leaderboard - Leaderboard global`);
    console.log(`   GET /api/users - VER TODOS los usuarios`);
    console.log(`   GET /api/user/:username - Ver detalles de usuario`);
    console.log(`   DELETE /api/user/:username - Eliminar usuario`);
    console.log(`   DELETE /api/clear-all - ELIMINAR TODOS los datos`);
});
