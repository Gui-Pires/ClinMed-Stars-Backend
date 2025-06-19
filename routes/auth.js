const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db/database');

const router = express.Router();
const SALT_ROUNDS = 10;

const validarCPF = (cpf) => {
    cpf = cpf.replace(/[^\d]/g, '');
    if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;

    const calc = (t) => {
        let sum = 0;
        for (let i = 0; i < t; i++) {
            sum += parseInt(cpf[i]) * (t + 1 - i);
        }
        let d = (sum * 10) % 11;
        return d === 10 ? 0 : d;
    };

    return calc(9) === parseInt(cpf[9]) && calc(10) === parseInt(cpf[10]);
};

// Cadastro de novo usuário
router.post('/register', async (req, res) => {
    let { cpf, nome, idade, senha, tipo = 'cliente' } = req.body;
    cpf = cpf.replace(/\D/g, '');

    if (!cpf || !nome || !idade || !senha) {
        return res.status(400).json({ erro: 'Todos os campos são obrigatórios.' });
    }

    const isValidCPF = validarCPF(cpf);
    if (cpf.length !== 11 || !isValidCPF) {
        return res.status(400).json({ erro: 'CPF inválido.' });
    }

    if (!senha || senha.length < 6) {
        return res.status(400).json({ erro: 'A senha deve ter pelo menos 6 caracteres.' });
    }

    try {
        const hash = await bcrypt.hash(senha, SALT_ROUNDS);

        db.run(
            `INSERT INTO clientes (cpf, nome, idade, senha, tipo) VALUES (?, ?, ?, ?, ?)`,
            [cpf, nome, idade, hash, tipo],
            function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint')) {
                        return res.status(409).json({ erro: 'CPF já cadastrado.' });
                    }
                    return res.status(500).json({ erro: 'Erro ao cadastrar o usuário.' });
                }

                res.status(201).json({ mensagem: 'Cadastro realizado com sucesso!' });
            }
        );
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao processar a senha.' });
    }
});

// Login
router.post('/login', (req, res) => {
    let { cpf, senha } = req.body;
    cpf = cpf.replace(/\D/g, '');

    if (!cpf || !senha) {
        return res.status(400).json({ erro: 'CPF e senha são obrigatórios.' });
    }

    const isValidCPF = validarCPF(cpf);
    if (cpf.length !== 11 || !isValidCPF) {
        return res.status(400).json({ erro: 'CPF inválido.' });
    }

    if (!senha || senha.length < 6) {
        return res.status(400).json({ erro: 'A senha deve ter pelo menos 6 caracteres.' });
    }

    db.get(`SELECT * FROM clientes WHERE cpf = ?`, [cpf], async (err, usuario) => {
        if (err) {
            return res.status(500).json({ erro: 'Erro ao consultar o banco de dados.' });
        }

        if (!usuario) {
            return res.status(401).json({ erro: 'Usuário não encontrado.' });
        }

        const senhaCorreta = await bcrypt.compare(senha, usuario.senha);

        if (!senhaCorreta) {
            return res.status(401).json({ erro: 'Senha incorreta.' });
        }

        // Aqui você pode futuramente gerar um token (JWT) para autenticação
        res.json({
            mensagem: 'Login realizado com sucesso.', usuario: {
                id: usuario.id,
                nome: usuario.nome,
                cpf: usuario.cpf,
                tipo: usuario.tipo
            }
        });
    });
});

module.exports = router;