const TAXA_HORA = 5.00;
const TAXA_MINIMA = 5.00;
const TOTAL_VAGAS = 20;

function agora() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function load(key, def) {
    try {
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : def;
    } catch { return def; }
}

function save(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
}

function initDB() {
    if (!localStorage.getItem('vagas')) {
        const vagas = [];
        for (let i = 1; i <= TOTAL_VAGAS; i++) {
            const numero = i <= 10 ? `A${String(i).padStart(2,'0')}` : `B${String(i-10).padStart(2,'0')}`;
            vagas.push({ id: i, numero, status: 'livre', placa: null });
        }
        save('vagas', vagas);
    }
    if (!localStorage.getItem('clientes')) save('clientes', []);
    if (!localStorage.getItem('veiculos')) save('veiculos', []);
    if (!localStorage.getItem('nextId')) save('nextId', { cliente: 1, veiculo: 1 });
}

function getNextId(tipo) {
    const ids = load('nextId', { cliente: 1, veiculo: 1 });
    const id = ids[tipo];
    ids[tipo] = id + 1;
    save('nextId', ids);
    return id;
}

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

function calcularValor(dataEntrada, dataSaida) {
    const e = new Date(dataEntrada.replace(' ', 'T'));
    const s = new Date(dataSaida.replace(' ', 'T'));
    const horas = (s - e) / 3600000;
    const horasCobradas = Math.max(1, Math.ceil(horas));
    return Math.max(TAXA_MINIMA, horasCobradas * TAXA_HORA);
}

function carregarEstatisticas() {
    const veiculos = load('veiculos', []);
    const vagas = load('vagas', []);
    const clientes = load('clientes', []);
    const estacionados = veiculos.filter(v => v.status === 'estacionado').length;
    const livres = vagas.filter(v => v.status === 'livre').length;
    const receita = veiculos
        .filter(v => v.status === 'finalizado')
        .reduce((s, v) => s + (v.valor_pago || 0), 0);

    document.getElementById('stat-estacionados').textContent = estacionados;
    document.getElementById('stat-livres').textContent = livres;
    document.getElementById('stat-clientes').textContent = clientes.length;
    document.getElementById('stat-receita').textContent = formatarValor(receita);
}

function carregarClientes() {
    const clientes = load('clientes', []);
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
}

document.getElementById('form-cliente').addEventListener('submit', (e) => {
    e.preventDefault();
    const nome = document.getElementById('cli-nome').value.trim();
    const telefone = document.getElementById('cli-telefone').value.trim();
    const cpf = document.getElementById('cli-cpf').value.trim();
    if (!nome) { toast('Nome é obrigatório', 'error'); return; }

    const clientes = load('clientes', []);
    clientes.push({
        id: getNextId('cliente'),
        nome, telefone, cpf,
        data_cadastro: agora()
    });
    save('clientes', clientes);
    toast('Cliente cadastrado!');
    document.getElementById('form-cliente').reset();
    atualizarTudo();
});

function carregarVagas() {
    const vagas = load('vagas', []);
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
}

function carregarEstacionados() {
    const veiculos = load('veiculos', []).filter(v => v.status === 'estacionado');
    const clientes = load('clientes', []);
    const vagas = load('vagas', []);
    const tbody = document.getElementById('lista-estacionados');

    if (veiculos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty">Nenhum veículo estacionado</td></tr>';
        return;
    }

    tbody.innerHTML = veiculos.map(v => {
        const cli = clientes.find(c => c.id === v.cliente_id);
        const vaga = vagas.find(g => g.id === v.vaga_id);
        return `
            <tr>
                <td><span class="placa-badge">${v.placa}</span></td>
                <td>${v.modelo || '—'}</td>
                <td>${cli ? cli.nome : '—'}</td>
                <td>${vaga ? vaga.numero : '—'}</td>
                <td>${formatarData(v.data_entrada)}</td>
                <td>
                    <button class="btn btn-danger" onclick="abrirModalSaida(${v.id}, '${v.placa}', '${v.data_entrada}')">
                        <i class="fas fa-sign-out-alt"></i> Saída
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function carregarHistorico() {
    const veiculos = load('veiculos', []).filter(v => v.status === 'finalizado');
    const clientes = load('clientes', []);
    const tbody = document.getElementById('lista-historico');

    if (veiculos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty">Nenhum registro</td></tr>';
        return;
    }

    tbody.innerHTML = veiculos.map(v => {
        const cli = clientes.find(c => c.id === v.cliente_id);
        return `
            <tr>
                <td><span class="placa-badge">${v.placa}</span></td>
                <td>${v.modelo || '—'}</td>
                <td>${cli ? cli.nome : '—'}</td>
                <td>${formatarData(v.data_entrada)}</td>
                <td>${formatarData(v.data_saida)}</td>
                <td class="valor-pago">${formatarValor(v.valor_pago)}</td>
            </tr>
        `;
    }).join('');
}

document.getElementById('form-entrada').addEventListener('submit', (e) => {
    e.preventDefault();
    const placa = document.getElementById('placa').value.trim().toUpperCase();
    const modelo = document.getElementById('modelo').value.trim();
    const cor = document.getElementById('cor').value.trim();
    const cliente_id = document.getElementById('cliente_id').value ? Number(document.getElementById('cliente_id').value) : null;
    const vaga_id = Number(document.getElementById('vaga_id').value);

    if (!placa || !vaga_id) {
        toast('Preencha placa e vaga', 'error');
        return;
    }

    const veiculos = load('veiculos', []);
    if (veiculos.some(v => v.placa === placa && v.status === 'estacionado')) {
        toast('Veículo já está estacionado', 'error');
        return;
    }

    const vagas = load('vagas', []);
    const vaga = vagas.find(v => v.id === vaga_id);
    if (!vaga || vaga.status !== 'livre') {
        toast('Vaga não está livre', 'error');
        return;
    }

    const data_entrada = agora();
    veiculos.push({
        id: getNextId('veiculo'),
        placa, modelo, cor,
        cliente_id, vaga_id,
        data_entrada,
        data_saida: null,
        status: 'estacionado',
        valor_pago: 0
    });
    save('veiculos', veiculos);

    vaga.status = 'ocupada';
    vaga.placa = placa;
    save('vagas', vagas);

    toast(`Entrada de ${placa} registrada!`);
    document.getElementById('form-entrada').reset();
    atualizarTudo();
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

document.getElementById('btn-confirmar-saida').addEventListener('click', () => {
    if (!veiculoSaidaId) return;

    const veiculos = load('veiculos', []);
    const vagas = load('vagas', []);
    const veiculo = veiculos.find(v => v.id === veiculoSaidaId);
    if (!veiculo || veiculo.status === 'finalizado') {
        toast('Veículo não encontrado', 'error');
        return;
    }

    const data_saida = agora();
    const valor = calcularValor(veiculo.data_entrada, data_saida);
    veiculo.data_saida = data_saida;
    veiculo.status = 'finalizado';
    veiculo.valor_pago = valor;
    save('veiculos', veiculos);

    const vaga = vagas.find(v => v.id === veiculo.vaga_id);
    if (vaga) {
        vaga.status = 'livre';
        vaga.placa = null;
        save('vagas', vagas);
    }

    const e = new Date(veiculo.data_entrada.replace(' ', 'T'));
    const s = new Date(data_saida.replace(' ', 'T'));
    const min = Math.floor((s - e) / 60000);
    const h = Math.floor(min / 60);
    const m = min % 60;

    toast(`Saída de ${veiculo.placa} — ${h}h ${m}min — ${formatarValor(valor)}`);
    document.getElementById('modal-saida').classList.remove('active');
    veiculoSaidaId = null;
    atualizarTudo();
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

initDB();
atualizarTudo();
