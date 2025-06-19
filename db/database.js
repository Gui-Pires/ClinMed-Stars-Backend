const sqlite3 = require("sqlite3").verbose();
const bcrypt = require('bcrypt');
const db = new sqlite3.Database("./database.sqlite");

db.serialize(() => {
    // Tabela de clientes com senha e tipo de usuário
    db.run(`CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cpf TEXT UNIQUE,
        nome TEXT,
        idade INTEGER,
        senha TEXT,
        tipo TEXT DEFAULT 'cliente'  -- 'cliente' ou 'admin'
    )`);

    (async () => {
        try {
            const hash = await bcrypt.hash("123456@", 10);
            db.run(
                `INSERT OR IGNORE INTO clientes (cpf, nome, idade, senha, tipo) VALUES (?, ?, ?, ?, ?)`,
                ['23289707024', 'Administrador', 1, hash, 'admin'],
                (err) => {
                    if (err) {
                        console.error("Erro ao inserir admin:", err.message);
                    } else {
                        console.log("Admin inserido com sucesso!");
                    }
                }
            );
        } catch (err) {
            console.error("Erro ao gerar hash:", err);
        }
    })();

    // Tabela de consultas com ligação ao CPF do cliente
    db.run(`CREATE TABLE IF NOT EXISTS consultas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cpf TEXT,
        doutor_id INTEGER,
        data TEXT,
        hora TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS doutores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        especialidade TEXT,
        horario_inicio TEXT,
        horario_fim TEXT
    )`);

    const inserts = [
        ['Dr. Dudu', 'Clínico Geral', '07:00', '16:00'],
        ['Dr. Guilherme Arana', 'Clínico Geral', '10:00', '19:00'],
        ['Dr. Alan Franco', 'Nutrologo', '07:00', '16:00'],
        ['Dr. Jonathan Calleri', 'Nutrologo', '10:00', '19:00'],
        ['Dra. Martha', 'Dermatologista', '07:00', '16:00'],
        ['Dra. Cristiane', 'Dermatologista', '10:00', '19:00'],
        ['Dr. Ronaldinho Gaúcho', 'Pediatra', '07:00', '16:00'],
        ['Dr. Ricardo Kaka', 'Pediatra', '10:00', '19:00'],
        ['Dr. Denervoso', 'Otorrino', '07:00', '16:00'],
        ['Dr. Dida', 'Otorrino', '10:00', '19:00'],
        ['Dr. Rogério Ceni', 'Cardiologista', '07:00', '16:00'],
        ['Dra. Ana Júlia', 'Cardiologista', '10:00', '19:00'],
        ['Dra. Soraia', 'Psiquiatra', '07:00', '16:00'],
        ['Dra. Judite', 'Psiquiatra', '10:00', '19:00'],
        ['Dr. Carlito', 'Oftalmologista', '07:00', '16:00'],
        ['Dra. Joaquina', 'Oftalmologista', '10:00', '19:00'],
        ['Dr. Kendrick LaMar', 'Endocrinologista', '07:00', '16:00'],
        ['Dra. Eva Rios', 'Endocrinologista', '10:00', '19:00'],
        ['Dr. Doidão', 'Neurologista', '07:00', '16:00'],
        ['Dr. Mickey', 'Neurologista', '10:00', '19:00']
    ];

    inserts.forEach(([nome, esp, ini, fim]) => {
        db.run(`INSERT INTO doutores (nome, especialidade, horario_inicio, horario_fim) VALUES (?, ?, ?, ?)`,
            [nome, esp, ini, fim]);
    });
});

module.exports = db;
