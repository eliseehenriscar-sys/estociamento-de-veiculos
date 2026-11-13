const API = 'http://127.0.0.1:5000/api';
let veiculoSaidaId = null;

function toast(msg, tipo = 'success') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = `toast ${tipo} show`;
    setTimeout(() => el.classList.remove('show'), 3000);
}

function formatarData(str) {
    if (!str) return '—';
    const [data, hora] = str.split(' ');
    const [y, m, d] = data.split('-');
    return `${d}/${m}/${y} ${hora}`;
}

function formatarValor(v) {
    return `R$ ${Number(v).toFixed(2).replace('.', ',')}`;
}

async function carregarEstatisticas() {
    try {
        const res = await fetch(`${API}/estatisticas`);
        const d = await res.json();
        document.getElementById('stat-estacionados').textContent = d.estacionados;
        document.getElementById('stat-livres').textContent = d.vagas_livres;
        document.getElementById('stat-clientes').textContent = d.total_clientes;
        document.getElementById('stat-receita').textContent = formatarValor(d.receita);
    } catch (e) {
        console.error(e);
    }
}

async function carregarClientes() {
    try {
        const res = await fetch(`${API}/clientes`);
        const clientes = await res.json();

        const select = document.getElementById('cliente_id');
        select.innerHTML = '<option value="">— Sem cliente —</option>';
        clientes.forEach(c => {
            select.innerHTML += `<option value="${c.id}">${c.nome}</option>`;
        });

        const tbody = document.getElementById('lista-clientes');
        if (clientes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty">Nenhum cliente cadastrado</td></tr>';
            return;
        }
        tbody.innerHTML = clientes.map(c => `
            <tr>
                <td>${c.nome}</td>
                <td>${c.telefone || '—'}</td>
                <td>${c.cpf || '—'}</td>
                <td>${formatarData(c.data_cadastro)}</td>
            </tr>
        `).join('');
    } catch (e) {
        console.error(e);
    }
}

document.getElementById('form-cliente').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('cli-nome').value.trim();
    const telefone = document.getElementById('cli-telefone').value.trim();
    const cpf = document.getElementById('cli-cpf').value.trim();

    try {
        const res = await fetch(`${API}/clientes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, telefone, cpf })
        });
        const data = await res.json();
        if (!res.ok) {
            toast(data.erro || 'Erro ao cadastrar', 'error');
            return;
        }
        toast('Cliente cadastrado!');
        document.getElementById('form-cliente').reset();
        atualizarTudo();
    } catch (e) {
        toast('Erro de conexão', 'error');
    }
});

async function carregarVagas() {
    try {
        const res = await fetch(`${API}/vagas`);
        const vagas = await res.json();

        const select = document.getElementById('vaga_id');
        const livres = vagas.filter(v => v.status === 'livre');
        select.innerHTML = '<option value="">Selecione uma vaga livre</option>';
        livres.forEach(v => {
            select.innerHTML += `<option value="${v.id}">${v.numero}</option>`;
        });

        const grade = document.getElementById('grade-vagas');
        grade.innerHTML = vagas.map(v => `
            <div class="vaga-card ${v.status}">
                <span class="vaga-num">${v.numero}</span>
                <span class="vaga-info">${v.status === 'livre' ? 'Livre' : (v.placa || 'Ocupada')}</span>
            </div>
        `).join('');
    } catch (e) {
        console.error(e);
    }
}

async function carregarEstacionados() {
    try {
        const res = await fetch(`${API}/veiculos?status=estacionado`);
        const veiculos = await res.json();
        const tbody = document.getElementById('lista-estacionados');

        if (veiculos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty">Nenhum veículo estacionado</td></tr>';
            return;
        }

        tbody.innerHTML = veiculos.map(v => `
            <tr>
                <td><span class="placa-badge">${v.placa}</span></td>
                <td>${v.modelo || '—'}</td>
                <td>${v.cliente_nome || '—'}</td>
                <td>${v.vaga_numero || '—'}</td>
                <td>${formatarData(v.data_entrada)}</td>
                <td>
                    <button class="btn btn-danger" onclick="abrirModalSaida(${v.id}, '${v.placa}', '${v.data_entrada}')">
                        <i class="fas fa-sign-out-alt"></i> Saída
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        console.error(e);
        toast('Erro ao conectar com o servidor', 'error');
    }
}

async function carregarHistorico() {
    try {
        const res = await fetch(`${API}/veiculos?status=finalizado`);
        const veiculos = await res.json();
        const tbody = document.getElementById('lista-historico');

        if (veiculos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty">Nenhum registro</td></tr>';
            return;
        }

        tbody.innerHTML = veiculos.map(v => `
            <tr>
                <td><span class="placa-badge">${v.placa}</span></td>
                <td>${v.modelo || '—'}</td>
                <td>${v.cliente_nome || '—'}</td>
                <td>${formatarData(v.data_entrada)}</td>
                <td>${formatarData(v.data_saida)}</td>
                <td class="valor-pago">${formatarValor(v.valor_pago)}</td>
            </tr>
        `).join('');
    } catch (e) {
        console.error(e);
    }
}

document.getElementById('form-entrada').addEventListener('submit', async (e) => {
    e.preventDefault();
    const placa = document.getElementById('placa').value.trim().toUpperCase();
    const modelo = document.getElementById('modelo').value.trim();
    const cor = document.getElementById('cor').value.trim();
    const cliente_id = document.getElementById('cliente_id').value || null;
    const vaga_id = document.getElementById('vaga_id').value;

    if (!placa || !vaga_id) {
        toast('Preencha placa e vaga', 'error');
        return;
    }

    try {
        const res = await fetch(`${API}/entrada`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ placa, modelo, cor, cliente_id, vaga_id })
        });
        const data = await res.json();
        if (!res.ok) {
            toast(data.erro || 'Erro ao registrar entrada', 'error');
            return;
        }
        toast(`Entrada de ${placa} registrada!`);
        document.getElementById('form-entrada').reset();
        atualizarTudo();
    } catch (e) {
        toast('Erro de conexão', 'error');
    }
});

function abrirModalSaida(id, placa, dataEntrada) {
    veiculoSaidaId = id;
    document.getElementById('modal-info').innerHTML = `
        <strong>Placa:</strong> ${placa}<br>
        <strong>Entrada:</strong> ${formatarData(dataEntrada)}<br>
        <strong>Saída:</strong> será registrada agora
    `;
    document.getElementById('modal-saida').classList.add('active');
}

document.getElementById('btn-cancelar').addEventListener('click', () => {
    document.getElementById('modal-saida').classList.remove('active');
    veiculoSaidaId = null;
});

document.getElementById('btn-confirmar-saida').addEventListener('click', async () => {
    if (!veiculoSaidaId) return;
    try {
        const res = await fetch(`${API}/saida/${veiculoSaidaId}`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) {
            toast(data.erro || 'Erro ao registrar saída', 'error');
            return;
        }
        toast(`Saída de ${data.placa} — ${data.tempo} — ${formatarValor(data.valor)}`);
        document.getElementById('modal-saida').classList.remove('active');
        veiculoSaidaId = null;
        atualizarTudo();
    } catch (e) {
        toast('Erro de conexão', 'error');
    }
});

document.getElementById('modal-saida').addEventListener('click', (e) => {
    if (e.target.id === 'modal-saida') {
        document.getElementById('modal-saida').classList.remove('active');
        veiculoSaidaId = null;
    }
});

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
});

function atualizarTudo() {
    carregarEstatisticas();
    carregarClientes();
    carregarVagas();
    carregarEstacionados();
    carregarHistorico();
}

document.getElementById('placa').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

atualizarTudo();
setInterval(atualizarTudo, 30000);