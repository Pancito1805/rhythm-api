const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const SCORES_FILE = path.join(__dirname, 'scores.json');

if (!fs.existsSync(SCORES_FILE)) {
    fs.writeFileSync(SCORES_FILE, JSON.stringify([]));
}

// ===== GUARDAR PUNTAJE =====
app.post('/api/scores', (req, res) => {
    const { name, score, song, combo, player } = req.body;
    
    console.log("Recibido:", { name, score, song, combo, player });
    
    if (!name || !score || !song) {
        return res.status(400).json({ error: 'Faltan datos' });
    }
    
    const scores = JSON.parse(fs.readFileSync(SCORES_FILE));
    
    const newEntry = {
        id: Date.now(),
        name: name.substring(0, 5).toUpperCase(),
        score: parseInt(score),
        song: song,
        combo: combo || 0,
        player: player || 1,
        date: new Date().toISOString()
    };
    
    scores.push(newEntry);
    scores.sort((a, b) => b.score - a.score);
    
    const topScores = scores.slice(0, 100);
    fs.writeFileSync(SCORES_FILE, JSON.stringify(topScores, null, 2));
    
    console.log("✅ Puntaje guardado:", newEntry.name, newEntry.score);
    res.json({ success: true, id: newEntry.id });
});

// ===== OBTENER LEADERBOARD POR CANCIÓN =====
app.get('/api/leaderboard/:song', (req, res) => {
    const song = req.params.song;
    const scores = JSON.parse(fs.readFileSync(SCORES_FILE));
    const filtered = scores.filter(s => s.song === song);
    res.json(filtered.slice(0, 20));
});

// ===== OBTENER TOP GLOBAL =====
app.get('/api/global', (req, res) => {
    const scores = JSON.parse(fs.readFileSync(SCORES_FILE));
    res.json(scores.slice(0, 20));
});

// ===== OBTENER TODOS LOS PUNTAJES (para debug) =====
app.get('/api/all', (req, res) => {
    const scores = JSON.parse(fs.readFileSync(SCORES_FILE));
    res.json(scores);
});

// ===== LIMPIAR TODOS LOS PUNTAJES (para debug) =====
app.delete('/api/clear', (req, res) => {
    fs.writeFileSync(SCORES_FILE, JSON.stringify([]));
    console.log("🗑️ Todos los puntajes eliminados");
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`🎵 API corriendo en http://localhost:${PORT}`);
});
