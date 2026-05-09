const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ===== CONEXIÓN A POSTGRESQL =====
// Render proporciona esta variable automáticamente
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }  // Necesario para Render
});

// ===== CREAR TABLAS SI NO EXISTEN =====
async function initDB() {
    const client = await pool.connect();
    try {
        // Tabla de usuarios
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                username VARCHAR(50) PRIMARY KEY,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Tabla de partidas
        await client.query(`
            CREATE TABLE IF NOT EXISTS games (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) REFERENCES users(username) ON DELETE CASCADE,
                score INTEGER NOT NULL,
                song VARCHAR(100) NOT NULL,
                combo INTEGER DEFAULT 0,
                player INTEGER DEFAULT 1,
                played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Índices para búsquedas rápidas
        await client.query(`CREATE INDEX IF NOT EXISTS idx_games_username ON games(username)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_games_score ON games(score)`);
        
        console.log("✅ Base de datos inicializada correctamente");
    } catch (err) {
        console.error("❌ Error al inicializar DB:", err);
    } finally {
        client.release();
    }
}

// ===== 1. REGISTRO DE USUARIO =====
app.post('/api/register', async (req, res) => {
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
    
    try {
        const simpleHash = Buffer.from(password).toString('base64');
        
        await pool.query(
            'INSERT INTO users (username, password_hash) VALUES ($1, $2)',
            [username, simpleHash]
        );
        
        console.log("✅ Usuario registrado:", username);
        res.json({ success: true, message: 'Usuario creado exitosamente' });
    } catch (err) {
        if (err.code === '23505') {  // Violación de clave única
            res.status(400).json({ error: 'El usuario ya existe' });
        } else {
            console.error("Error en registro:", err);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    }
});

// ===== 2. LOGIN DE USUARIO =====
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    console.log("🔐 Intento de login:", username);
    
    try {
        const result = await pool.query(
            'SELECT password_hash FROM users WHERE username = $1',
            [username]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Usuario no existe' });
        }
        
        const hash = Buffer.from(password).toString('base64');
        
        if (result.rows[0].password_hash !== hash) {
            return res.status(401).json({ error: 'Contraseña incorrecta' });
        }
        
        console.log("✅ Login exitoso:", username);
        res.json({ success: true, username: username });
    } catch (err) {
        console.error("Error en login:", err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ===== 3. GUARDAR PARTIDA =====
app.post('/api/save_game', async (req, res) => {
    const { username, score, song, combo, player, date } = req.body;
    
    console.log("💾 Guardando partida de:", username, "- Puntaje:", score);
    
    try {
        // Verificar que el usuario existe
        const userCheck = await pool.query('SELECT username FROM users WHERE username = $1', [username]);
        
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        // Insertar partida
        await pool.query(
            'INSERT INTO games (username, score, song, combo, player, played_at) VALUES ($1, $2, $3, $4, $5, COALESCE($6, CURRENT_TIMESTAMP))',
            [username, parseInt(score), song, combo || 0, player || 1, date || null]
        );
        
        console.log("✅ Partida guardada correctamente");
        res.json({ success: true });
    } catch (err) {
        console.error("Error al guardar partida:", err);
        res.status(500).json({ error: 'Error al guardar partida' });
    }
});

// ===== 4. OBTENER HISTORIAL DEL USUARIO =====
app.get('/api/user_games/:username', async (req, res) => {
    const { username } = req.params;
    console.log("📋 Solicitando historial de:", username);
    
    try {
        const result = await pool.query(
            'SELECT score, song, combo, player, played_at FROM games WHERE username = $1 ORDER BY score DESC',
            [username]
        );
        
        res.json(result.rows);
    } catch (err) {
        console.error("Error al obtener historial:", err);
        res.status(500).json({ error: 'Error al obtener historial' });
    }
});

// ===== 5. OBTENER LEADERBOARD GLOBAL =====
app.get('/api/global_leaderboard', async (req, res) => {
    console.log("🏆 Solicitando leaderboard global");
    
    try {
        const result = await pool.query(
            `SELECT username as name, score, song, combo, played_at as date 
             FROM games 
             ORDER BY score DESC 
             LIMIT 50`
        );
        
        res.json(result.rows);
    } catch (err) {
        console.error("Error al obtener leaderboard:", err);
        res.status(500).json({ error: 'Error al obtener leaderboard' });
    }
});

// ===== 6. OBTENER TOP JUGADORES (por sumatoria de puntos) =====
app.get('/api/top_players', async (req, res) => {
    console.log("👑 Solicitando top jugadores");
    
    try {
        const result = await pool.query(
            `SELECT 
                username as name,
                SUM(score) as total_score,
                MAX(score) as best_score,
                COUNT(*) as games_played
             FROM games 
             GROUP BY username 
             ORDER BY total_score DESC 
             LIMIT 20`
        );
        
        res.json(result.rows);
    } catch (err) {
        console.error("Error al obtener top jugadores:", err);
        res.status(500).json({ error: 'Error al obtener top jugadores' });
    }
});

// ===== 7. VER TODOS LOS USUARIOS =====
app.get('/api/users', async (req, res) => {
    console.log("📋 Solicitando lista de usuarios");
    
    try {
        const result = await pool.query(
            `SELECT u.username, 
                    COUNT(g.id) as games_played,
                    u.created_at
             FROM users u
             LEFT JOIN games g ON u.username = g.username
             GROUP BY u.username
             ORDER BY u.created_at DESC`
        );
        
        res.json(result.rows);
    } catch (err) {
        console.error("Error al obtener usuarios:", err);
        res.status(500).json({ error: 'Error al obtener usuarios' });
    }
});

// ===== 8. ELIMINAR UN USUARIO =====
app.delete('/api/user/:username', async (req, res) => {
    const { username } = req.params;
    console.log("🗑️ Eliminando usuario:", username);
    
    try {
        const result = await pool.query('DELETE FROM users WHERE username = $1 RETURNING username', [username]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        console.log("✅ Usuario", username, "eliminado");
        res.json({ success: true, message: `Usuario ${username} eliminado` });
    } catch (err) {
        console.error("Error al eliminar usuario:", err);
        res.status(500).json({ error: 'Error al eliminar usuario' });
    }
});

// ===== 9. ELIMINAR TODOS LOS DATOS =====
app.delete('/api/clear-all', async (req, res) => {
    console.log("🗑️ ELIMINANDO TODOS LOS DATOS");
    
    try {
        await pool.query('DELETE FROM games');
        await pool.query('DELETE FROM users');
        
        console.log("✅ Base de datos completamente limpiada");
        res.json({ success: true, message: "Todos los datos eliminados" });
    } catch (err) {
        console.error("Error al limpiar DB:", err);
        res.status(500).json({ error: 'Error al limpiar datos' });
    }
});

// ===== 10. ENDPOINT ANTIGUO PARA COMPATIBILIDAD =====
app.get('/api/global', async (req, res) => {
    console.log("⚠️ Endpoint antiguo /global usado");
    
    try {
        const result = await pool.query(
            'SELECT username as name, score, song, combo FROM games ORDER BY score DESC LIMIT 20'
        );
        res.json(result.rows);
    } catch (err) {
        res.json([]);
    }
});

// ===== 11. ELIMINAR PARTIDA ESPECÍFICA (opcional) =====
app.delete('/api/game/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        await pool.query('DELETE FROM games WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Error al eliminar partida' });
    }
});

// ===== INICIAR SERVIDOR =====
initDB().then(() => {
    app.listen(PORT, () => {
        console.log(`🎵 API de Rhythm Game corriendo en http://localhost:${PORT}`);
        console.log(`📋 Base de datos: PostgreSQL en Render`);
        console.log(`📋 Endpoints disponibles:`);
        console.log(`   POST /api/register - Registro de usuario`);
        console.log(`   POST /api/login - Inicio de sesión`);
        console.log(`   POST /api/save_game - Guardar partida`);
        console.log(`   GET /api/user_games/:username - Historial del usuario`);
        console.log(`   GET /api/global_leaderboard - Leaderboard global`);
        console.log(`   GET /api/users - Ver todos los usuarios`);
        console.log(`   DELETE /api/user/:username - Eliminar usuario`);
        console.log(`   DELETE /api/clear-all - Eliminar todos los datos`);
    });
});
