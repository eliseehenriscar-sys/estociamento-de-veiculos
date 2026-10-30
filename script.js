const API = '/api';

function toast(msg, tipo = 'success') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show' + (tipo === 'error' ? ' error' : '');
    setTimeout(() => t.classList.remove('show'), 3500);
}

function formatarData(d) {
    if (!d) return '-';
    return new Date(d.replace(' ', 'T')).toLocaleString('pt-BR');
}

function formatarMoeda(v) {
    return 'R$ ' + Number(v).toFixed(2).replace('.', ',');
}

// Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).style.display = 'block';
        if (btn.dataset.tab === 'historico') carregarHistorico();
        if (btn.dataset.tab === 'vagas') carregarVagas();
        if (btn.dataset.tab === 'veiculos') carregarVeiculos();
        if (btn.dataset.tab === 'clientes') carregarClientes();
    });
});

// Estatísticas
async function carregarRelatorios() {
    try {
        const res = await fetch(`${API}/relatorios`);
        const d = await res.json();
        document.getElementById('stat-estacionados').textContent = d.estacionados;
        document.getElementById('stat-saidos').textContent = d.saidos;
        document.getElementById('stat-arrecadado').textContent = formatarMoeda(d.arrecadado);
        document.getElementById('stat-vagas').textContent = `${d.vagas_livres} livres / ${d.vagas_ocupadas} ocupadas`;
    } catch (e) {
        toast('Erro ao carregar relatórios. Servidor rodando?', 'error');
    }
}

// Estacionados
async function carregarEstacionados() {
    try {
        const res = await fetch(`${API}/estacionamentos?status=estacionado`);
        const lista = await res.json();
        const tbody = document.getElementById('lista-estacionados');
        const empty = document.getElementById('empty-estacionados');

        if (lista.length === 0) {
            tbody.innerHTML = '';
            empty.style.display = 'block';
            return;
        }
        empty.style.display = 'none';
        tbody.innerHTML = lista.map(e => `
            <tr>
                <td class="placa">${e.placa}</td>
                <td>${e.modelo || '-'}</td>
                <td>${e.cor || '-'}</td>
                <td>${e.vaga_numero} (${e.vaga_tipo})</td>
                <td>${formatarData(e.data_entrada)}</td>
                <td>
                    <button class="btn btn-success" onclick="saida(${e.id})">
                        <i class="fas fa-sign-out-alt"></i> Saída
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        toast('Erro de conexão', 'error');
    }
}

async function carregarHistorico() {
    const res = await fetch(`${API}/estacionamentos?status=saido`);
    const lista = await res.json();
    const tbody = document.getElementById('lista-historico');
    const empty = document.getElementById('empty-historico');

    if (lista.length === 0) {
        tbody.innerHTML = '';
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';
    tbody.innerHTML = lista.map(e => `
        <tr>
            <td class="placa">${e.placa}</td>
            <td>${e.modelo || '-'}</td>
            <td>${formatarData(e.data_entrada)}</td>
            <td>${formatarData(e.data_saida)}</td>
            <td class="valor">${formatarMoeda(e.valor)}</td>
        </tr>
    `).join('');
}

async function carregarVagas() {
    const res = await fetch(`${API}/vagas`);
    const lista = await res.json();
    document.getElementById('lista-vagas').innerHTML = lista.map(v => `
        <div class="vaga-card ${v.status}">
            <strong>${v.numero}</strong>
            <span>${v.tipo}</span>
            <span class="status">${v.status}</span>
        </div>
    `).join('');
}

async function carregarVeiculos() {
    const res = await fetch(`${API}/veiculos`);
    const lista = await res.json();
    const tbody = document.getElementById('lista-veiculos');
    tbody.innerHTML = lista.map(v => `
        <tr>
            <td class="placa">${v.placa}</td>
            <td>${v.marca || '-'} ${v.modelo || ''}</td>
            <td>${v.cor || '-'}</td>
            <td>${v.tipo || '-'}</td>
            <td>${v.ano || '-'}</td>
            <td>${v.cliente_nome || '-'}</td>
        </tr>
    `).join('');
}

async function carregarClientes() {
    const res = await fetch(`${API}/clientes`);
    const lista = await res.json();
    const tbody = document.getElementById('lista-clientes');
    tbody.innerHTML = lista.map(c => `
        <tr>
            <td>${c.nome}</td>
            <td>${c.telefone || '-'}</td>
            <td>${c.email || '-'}</td>
            <td>${formatarData(c.data_cadastro)}</td>
        </tr>
    `).join('');
}

// Formulários
document.getElementById('form-entrada').addEventListener('submit', async e => {
    e.preventDefault();
    const placa = document.getElementById('placa-entrada').value.trim().toUpperCase();
    const tipo_vaga = document.getElementById('tipo-vaga').value;
    const tipo_cobranca = document.getElementById('tipo-cobranca').value;

    try {
        const res = await fetch(`${API}/estacionamentos/entrada`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({placa, tipo_vaga, tipo_cobranca})
        });
        const data = await res.json();
        if (!res.ok) return toast(data.erro, 'error');
        toast(data.mensagem);
        document.getElementById('form-entrada').reset();
        carregarEstacionados();
        carregarRelatorios();
        carregarVagas();
    } catch (err) {
        toast('Erro de conexão', 'error');
    }
});

document.getElementById('form-veiculo').addEventListener('submit', async e => {
    e.preventDefault();
    const body = {
        placa: document.getElementById('placa-veiculo').value.trim().toUpperCase(),
        marca: document.getElementById('marca').value.trim(),
        modelo: document.getElementById('modelo').value.trim(),
        cor: document.getElementById('cor').value.trim(),
        tipo: document.getElementById('tipo-veiculo').value,
        ano: document.getElementById('ano').value || null,
        tamanho: document.getElementById('tamanho').value
    };
    try {
        const res = await fetch(`${API}/veiculos`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok) return toast(data.erro, 'error');
        toast(data.mensagem);
        document.getElementById('form-veiculo').reset();
        carregarVeiculos();
        carregarRelatorios();
    } catch (err) {
        toast('Erro de conexão', 'error');
    }
});

document.getElementById('form-cliente').addEventListener('submit', async e => {
    e.preventDefault();
    const body = {
        nome: document.getElementById('nome-cliente').value.trim(),
        telefone: document.getElementById('telefone').value.trim(),
        email: document.getElementById('email').value.trim()
    };
    try {
        const res = await fetch(`${API}/clientes`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok) return toast(data.erro, 'error');
        toast(data.mensagem);
        document.getElementById('form-cliente').reset();
        carregarClientes();
        carregarRelatorios();
    } catch (err) {
        toast('Erro de conexão', 'error');
    }
});

async function saida(id) {
    if (!confirm('Confirmar saída deste veículo?')) return;
    try {
        const res = await fetch(`${API}/estacionamentos/${id}/saida`, {method: 'PUT'});
        const data = await res.json();
        if (!res.ok) return toast(data.erro, 'error');
        toast(data.mensagem);
        carregarEstacionados();
        carregarRelatorios();
        carregarVagas();
    } catch (err) {
        toast('Erro de conexão', 'error');
    }
}

// Formatar placa
document.getElementById('placa-entrada').addEventListener('input', e => {
    let v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (v.length > 3) v = v.slice(0,3) + '-' + v.slice(3,7);
    e.target.value = v;
});
document.getElementById('placa-veiculo').addEventListener('input', e => {
    let v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (v.length > 3) v = v.slice(0,3) + '-' + v.slice(3,7);
    e.target.value = v;
});

document.addEventListener('DOMContentLoaded', () => {
    carregarEstacionados();
    carregarRelatorios();
});
