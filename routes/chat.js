const express = require('express');
const router = express.Router();
const db = require('../db/database');

// Estado em memória (por cpf)
const estadoUsuarios = {};

// Especialidades disponíveis
const especialistas = [
    'Clínico Geral', 'Nutrologo', 'Dermatologista', 'Pediatra', 'Otorrinolaringologista',
    'Cardiologista', 'Psiquiatra', 'Oftalmologista', 'Endocrinologista', 'Neurologista'
];

// --- Funções utilitárias ---
function validarData(dataStr) {
    const regex = /^\d{2}\/\d{2}\/\d{4}$/;
    if (!regex.test(dataStr)) return false;

    const [dia, mes, ano] = dataStr.split('/').map(Number);
    const data = new Date(ano, mes - 1, dia);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    if (isNaN(data)) return false;
    if (data < hoje) return false;

    const diaSemana = data.getDay();
    if (diaSemana === 0 || diaSemana === 6) return "Agendamentos só são permitidos de segunda a sexta. Escolha uma nova data.";

    return true;
}

function formatarDataParaISO(dataStr) {
    const [dia, mes, ano] = dataStr.split('/');
    return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
}

function formatarDataParaBR(dataISO) {
    const [ano, mes, dia] = dataISO.split('-');
    return `${dia}/${mes}/${ano}`;
}

function validarHora(horaStr) {
    const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    return regex.test(horaStr);
}

// --- Funções de DB para consultas ---
function buscarConsultasPorCpf(cpf, callback) {
    const sql = `
    SELECT consultas.id, doutores.especialidade, doutores.nome, consultas.data, consultas.hora
    FROM consultas
    LEFT JOIN doutores ON consultas.doutor_id = doutores.id
    WHERE consultas.cpf = ?
    ORDER BY consultas.data, consultas.hora
  `;
    db.all(sql, [cpf], callback);
}

function buscarConsultasFuturasPorCpf(cpf, callback) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const dataLimite = hoje.toISOString().split('T')[0];

    const sql = `
    SELECT consultas.id, doutores.especialidade, doutores.nome, consultas.data, consultas.hora
    FROM consultas
    LEFT JOIN doutores ON consultas.doutor_id = doutores.id
    WHERE consultas.cpf = ? AND consultas.data >= ?
    ORDER BY consultas.data, consultas.hora
  `;
    db.all(sql, [cpf, dataLimite], callback);
}

function buscarDoutoresDisponiveis(especialidade, hora, callback) {
    const sql = `
    SELECT * FROM doutores
    WHERE especialidade = ? AND horario_inicio <= ? AND horario_fim >= ?
  `;
    db.all(sql, [especialidade, hora, hora], callback);
}

function buscarHorariosDisponiveis(especialidade, data, callback) {
    const horariosPermitidos = ['07:00', '08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
    const horariosDuplos = ['10:00', '11:00', '13:00', '14:00', '15:00'];

    const sqlAgendados = `
    SELECT hora FROM consultas
    JOIN doutores ON consultas.doutor_id = doutores.id
    WHERE doutores.especialidade = ? AND data = ?
  `;

    db.all(sqlAgendados, [especialidade, data], (err, rows) => {
        if (err) return callback([]);

        const contagem = {};
        rows.forEach(row => {
            contagem[row.hora] = (contagem[row.hora] || 0) + 1;
        });

        const sqlTotal = `SELECT COUNT(*) AS total FROM doutores WHERE especialidade = ?`;
        db.get(sqlTotal, [especialidade], (err2, result) => {
            if (err2) return callback([]);
            const totalDoutores = result.total;

            const disponiveis = horariosPermitidos.filter(hora => {
                const agendados = contagem[hora] || 0;
                const limite = horariosDuplos.includes(hora) ? 2 : 1;
                return agendados < Math.min(totalDoutores, limite);
            });

            callback(disponiveis);
        });
    });
}

// --- Função para salvar consulta ---
function agendarConsulta(cpf, doutorId, data, hora, callback) {
    const sql = `INSERT INTO consultas (cpf, doutor_id, data, hora) VALUES (?, ?, ?, ?)`;
    db.run(sql, [cpf, doutorId, data, hora], callback);
}

// --- Função para editar consulta ---
function editarConsulta(id, doutorId, data, hora, callback) {
    const sql = `UPDATE consultas SET doutor_id = ?, data = ?, hora = ? WHERE id = ?`;
    db.run(sql, [doutorId, data, hora, id], callback);
}

// --- Função para deletar consulta ---
function cancelarConsulta(id, callback) {
    const sql = `DELETE FROM consultas WHERE id = ?`;
    db.run(sql, [id], callback);
}

// --- Helper para responder e salvar estado ---
function responder(res, cpf, reply, etapa = 'menu', extra = {}) {
    estadoUsuarios[cpf] = { ...estadoUsuarios[cpf], etapa, ...extra };
    res.json({ reply });
}

// --- Etapas do chat ---
const etapas = {
    menu: (req, res, texto, cpf) => {
        switch (texto) {
            case '1':
                buscarConsultasPorCpf(cpf, (err, rows) => {
                    if (err) return responder(res, cpf, "Erro ao buscar suas consultas.");

                    if (rows.length === 0) {
                        return responder(res, cpf, "Você não tem consultas agendadas.$MENU$");
                    }

                    const lista = rows.map(c =>
                        `📆 ${formatarDataParaBR(c.data)} às ${c.hora} com ${c.nome} (${c.especialidade})`
                    ).join('\n');

                    responder(res, cpf, "Aqui estão suas consultas:\n" + lista + "$MENU$");
                });
                break;

            case '2':
                responder(res, cpf,
                    `Qual especialidade deseja agendar?\n` + especialistas.map((e, i) => `${i + 1}. ${e}`).join('\n'),
                    'agendar_especialidade'
                );
                break;

            case '3':
                buscarConsultasFuturasPorCpf(cpf, (err, rows) => {
                    if (err) return responder(res, cpf, "Erro ao buscar consultas para edição.");
                    if (rows.length === 0) return responder(res, cpf, "Você não possui consultas futuras para editar.$MENU$");

                    estadoUsuarios[cpf].opcoesConsulta = rows;
                    responder(res, cpf,
                        "Escolha a consulta para editar:\n" + rows.map((c, i) => `${i + 1}. 📆 ${formatarDataParaBR(c.data)} às ${c.hora} com ${c.nome} (${c.especialidade})`).join('\n'),
                        'editar_consulta'
                    );
                });
                break;

            case '4':
                buscarConsultasFuturasPorCpf(cpf, (err, rows) => {
                    if (err) return responder(res, cpf, "Erro ao buscar consultas para cancelamento.");
                    if (rows.length === 0) return responder(res, cpf, "Você não possui consultas futuras para cancelar.$MENU$");

                    estadoUsuarios[cpf].opcoesCancelar = rows;
                    responder(res, cpf,
                        "Escolha a consulta para cancelar:\n" + rows.map((c, i) => `${i + 1}. 📆 ${formatarDataParaBR(c.data)} às ${c.hora} com ${c.nome} (${c.especialidade})`).join('\n'),
                        'cancelar_consulta'
                    );
                });
                break;

            default:
                responder(res, cpf, "Opção inválida. Digite 1, 2, 3 ou 4.");
        }
    },

    agendar_especialidade: (req, res, texto, cpf) => {
        const idx = parseInt(texto);
        if (isNaN(idx) || idx < 1 || idx > especialistas.length) {
            return responder(res, cpf, "Especialidade inválida, digite novamente.", 'agendar_especialidade');
        }
        const especialidade = especialistas[idx - 1];
        responder(res, cpf, "Qual data deseja? (DD/MM/AAAA)", 'agendar_data', { especialidade });
    },

    agendar_data: (req, res, texto, cpf) => {
        const valid = validarData(texto);
        if (valid !== true) {
            return responder(res, cpf, typeof valid === 'string' ? valid : "Data inválida, digite novamente (DD/MM/AAAA).", 'agendar_data');
        }
        const dataISO = formatarDataParaISO(texto);
        const especialidade = estadoUsuarios[cpf].especialidade;

        buscarHorariosDisponiveis(especialidade, dataISO, (horarios) => {
            if (horarios.length === 0) {
                return responder(res, cpf, `Nenhum horário disponível para ${especialidade} em ${texto}. Escolha outra data.`, 'agendar_data');
            }
            const lista = horarios.map(h => `🕒 ${h}`).join('\n');
            responder(res, cpf,
                `Horários disponíveis para ${especialidade} em ${texto}:\n${lista}\n\nDigite o horário desejado (HH:MM):`,
                'agendar_hora',
                { data: dataISO, horariosDisponiveis: horarios }
            );
        });
    },

    agendar_hora: (req, res, texto, cpf) => {
        if (!validarHora(texto)) {
            return responder(res, cpf, "Formato de horário inválido. Digite no formato HH:MM.", 'agendar_hora');
        }

        const { especialidade, data, horariosDisponiveis } = estadoUsuarios[cpf];
        if (!horariosDisponiveis.includes(texto)) {
            return responder(res, cpf, "Horário não disponível. Escolha um dos horários listados.", 'agendar_hora');
        }

        buscarDoutoresDisponiveis(especialidade, texto, (err, doutores) => {
            if (err) return responder(res, cpf, "Erro ao buscar doutores.");
            if (!doutores.length) return responder(res, cpf, `Nenhum doutor de ${especialidade} disponível nesse horário. Escolha outro.`, 'agendar_hora');

            const verificarDisponibilidade = (idx) => {
                if (idx >= doutores.length) {
                    return responder(res, cpf, `Todos os doutores de ${especialidade} estão ocupados nesse horário. Escolha outro.`, 'agendar_hora');
                }
                const doutor = doutores[idx];
                db.get(`SELECT * FROM consultas WHERE doutor_id = ? AND data = ? AND hora = ?`, [doutor.id, data, texto], (err, consulta) => {
                    if (consulta) {
                        verificarDisponibilidade(idx + 1);
                    } else {
                        agendarConsulta(cpf, doutor.id, data, texto, (err) => {
                            if (err) return responder(res, cpf, "Erro ao agendar consulta.");
                            responder(res, cpf, `✅ Consulta agendada com ${doutor.nome} (${especialidade}) em ${formatarDataParaBR(data)} às ${texto}.$MENU$`, 'menu');
                        });
                    }
                });
            };

            verificarDisponibilidade(0);
        });
    },

    editar_consulta: (req, res, texto, cpf) => {
        const idx = parseInt(texto);
        const opcoesConsulta = estadoUsuarios[cpf].opcoesConsulta || [];

        if (isNaN(idx) || idx < 1 || idx > opcoesConsulta.length) {
            return responder(res, cpf, "Escolha inválida. Digite o número da consulta que deseja editar.", 'editar_consulta');
        }

        const consulta = opcoesConsulta[idx - 1];
        estadoUsuarios[cpf].consultaEditando = consulta;

        responder(res, cpf,
            `Você escolheu editar a consulta com ${consulta.nome} (${consulta.especialidade}) em ${formatarDataParaBR(consulta.data)} às ${consulta.hora}.\n` +
            `Qual nova especialidade deseja?\n` + especialistas.map((e, i) => `${i + 1}. ${e}`).join('\n'),
            'editar_especialidade'
        );
    },

    editar_especialidade: (req, res, texto, cpf) => {
        const idx = parseInt(texto);
        if (isNaN(idx) || idx < 1 || idx > especialistas.length) {
            return responder(res, cpf, "Especialidade inválida. Digite um número válido.", 'editar_especialidade');
        }
        const especialidade = especialistas[idx - 1];
        responder(res, cpf, "Digite a nova data (DD/MM/AAAA):", 'editar_data_nova', { novaEspecialidade: especialidade });
    },

    editar_data_nova: (req, res, texto, cpf) => {
        const valid = validarData(texto);
        if (valid !== true) {
            return responder(res, cpf, typeof valid === 'string' ? valid : "Data inválida, digite novamente (DD/MM/AAAA).", 'editar_data_nova');
        }

        const [dia, mes, ano] = texto.split('/').map(Number);
        const dataDate = new Date(ano, mes - 1, dia);
        const diaSemana = dataDate.getDay();
        if (diaSemana === 0 || diaSemana === 6) {
            return responder(res, cpf, "Só é possível agendar de segunda a sexta. Escolha outra data.", 'editar_data_nova');
        }

        const dataISO = formatarDataParaISO(texto);
        const { novaEspecialidade } = estadoUsuarios[cpf];

        buscarHorariosDisponiveis(novaEspecialidade, dataISO, (horarios) => {
            if (horarios.length === 0) {
                return responder(res, cpf, `Nenhum horário disponível para ${novaEspecialidade} em ${texto}. Escolha outra data.`, 'editar_data_nova');
            }
            const lista = horarios.map(h => `🕒 ${h}`).join('\n');
            responder(res, cpf,
                `Horários disponíveis para ${novaEspecialidade} em ${texto}:\n${lista}\n\nDigite o horário desejado (HH:MM):`,
                'editar_hora',
                { novaData: dataISO, horariosDisponiveis: horarios }
            );
        });
    },

    editar_hora: (req, res, texto, cpf) => {
        if (!validarHora(texto)) {
            return responder(res, cpf, "Formato inválido. Digite novamente (HH:MM).", 'editar_hora');
        }

        const { novaData, novaEspecialidade, horariosDisponiveis, consultaEditando } = estadoUsuarios[cpf];
        if (!horariosDisponiveis.includes(texto)) {
            return responder(res, cpf, "Horário não disponível. Escolha um dos exibidos anteriormente.", 'editar_hora');
        }

        buscarDoutoresDisponiveis(novaEspecialidade, texto, (err, doutores) => {
            if (err || doutores.length === 0) {
                return responder(res, cpf, "Erro ao buscar doutores. Tente novamente.", 'editar_hora');
            }

            const verificarDisponibilidade = (idx) => {
                if (idx >= doutores.length) {
                    return responder(res, cpf, "Todos os doutores estão ocupados nesse horário. Escolha outro.", 'editar_hora');
                }
                const doutor = doutores[idx];
                db.get(`SELECT * FROM consultas WHERE doutor_id = ? AND data = ? AND hora = ?`, [doutor.id, novaData, texto], (err, existe) => {
                    if (existe) {
                        verificarDisponibilidade(idx + 1);
                    } else {
                        editarConsulta(consultaEditando.id, doutor.id, novaData, texto, (err) => {
                            if (err) return responder(res, cpf, "Erro ao editar a consulta.");
                            responder(res, cpf, `✅ Consulta atualizada com ${doutor.nome} (${novaEspecialidade}) para ${formatarDataParaBR(novaData)} às ${texto}.$MENU$`, 'menu');
                        });
                    }
                });
            };

            verificarDisponibilidade(0);
        });
    },

    cancelar_consulta: (req, res, texto, cpf) => {
        const idx = parseInt(texto);
        const opcoesCancelar = estadoUsuarios[cpf].opcoesCancelar || [];

        if (isNaN(idx) || idx < 1 || idx > opcoesCancelar.length) {
            return responder(res, cpf, "Escolha inválida. Digite o número da consulta que deseja cancelar.", 'cancelar_consulta');
        }

        const consulta = opcoesCancelar[idx - 1];
        estadoUsuarios[cpf].consultaCancelando = consulta;
        responder(res, cpf, `⚠️ Tem certeza que deseja cancelar a consulta com ${consulta.nome} (${consulta.especialidade}) em ${formatarDataParaBR(consulta.data)} às ${consulta.hora}?\n\n1. Sim\n2. Não`, 'cancelar_confirmar');
    },

    cancelar_confirmar: (req, res, texto, cpf) => {
        const { consultaCancelando } = estadoUsuarios[cpf];
        if (!consultaCancelando) {
            return responder(res, cpf, "Nenhuma consulta selecionada para cancelar.", 'menu');
        }

        if (texto === '1') {
            cancelarConsulta(consultaCancelando.id, (err) => {
                if (err) return responder(res, cpf, "Erro ao cancelar consulta.", 'menu');
                responder(res, cpf, `❌ Consulta com ${consultaCancelando.nome} em ${formatarDataParaBR(consultaCancelando.data)} às ${consultaCancelando.hora} foi cancelada com sucesso.$MENU$`, 'menu');
            });
        } else {
            responder(res, cpf, "Cancelamento abortado.$MENU$", 'menu');
        }
    }

};

// --- Rota principal do chat ---
router.post('/', (req, res) => {
    const { message, cpf } = req.body;
    const texto = (message || '').trim();
    if (!cpf) return res.json({ reply: 'CPF não informado.' });

    const estadoAtual = estadoUsuarios[cpf] || { etapa: 'menu' };
    const etapaFn = etapas[estadoAtual.etapa];

    if (!etapaFn) return responder(res, cpf, 'Algo deu errado. Voltando ao menu.$MENU$', 'menu');

    // Passa req e res para evitar escopos ocultos
    etapaFn(req, res, texto, cpf);
});

// Rota de consultas (exibe as datas também formatadas para DD/MM/AAAA)
router.post('/consultas', (req, res) => {
    const { cpf, tipo } = req.body;
    let sql = '';

    if (tipo != 'admin') {
        sql = `
            SELECT consultas.id, doutores.especialidade, doutores.nome, consultas.data, consultas.hora
            FROM consultas
            LEFT JOIN doutores ON consultas.doutor_id = doutores.id
            WHERE consultas.cpf = ?
            ORDER BY consultas.data, consultas.hora
        `;

        db.all(sql, [cpf], (err, rows) => {
            if (err) return res.status(500).json({ erro: "Erro ao buscar consultas." });
            const formatadas = rows.map(c => ({ ...c, data: formatarDataParaBR(c.data) }));
            res.json(formatadas);
        });
    } else {
        sql = `
            SELECT consultas.id, clientes.nome AS nome_cliente, doutores.especialidade, doutores.nome AS nome_doutor, consultas.data, consultas.hora
            FROM consultas
            LEFT JOIN clientes ON consultas.cpf = clientes.cpf
            LEFT JOIN doutores ON consultas.doutor_id = doutores.id
            ORDER BY consultas.data, consultas.hora
        `;

        db.all(sql, [], (err, rows) => {
            if (err) return res.status(500).json({ erro: "Erro ao buscar consultas." });
            const formatadas = rows.map(c => ({ ...c, data: formatarDataParaBR(c.data) }));
            res.json(formatadas);
        });
    }
});

module.exports = router;