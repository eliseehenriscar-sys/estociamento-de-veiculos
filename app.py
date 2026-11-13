from flask import Flask, request, jsonify, send_from_directory
import sqlite3
from datetime import datetime

app = Flask(__name__, static_folder='.', static_url_path='')

DB_NAME = 'estacionamento.db'
TAXA_HORA = 5.00
TAXA_MINIMA = 5.00
TOTAL_VAGAS = 20

def get_db():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()

    c.execute('''
        CREATE TABLE IF NOT EXISTS clientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            telefone TEXT,
            cpf TEXT,
            data_cadastro TEXT NOT NULL
        )
    ''')

    c.execute('''
        CREATE TABLE IF NOT EXISTS vagas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero TEXT NOT NULL UNIQUE,
            status TEXT DEFAULT 'livre'
        )
    ''')

    c.execute('''
        CREATE TABLE IF NOT EXISTS veiculos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            placa TEXT NOT NULL,
            modelo TEXT,
            cor TEXT,
            cliente_id INTEGER,
            vaga_id INTEGER,
            data_cadastro TEXT NOT NULL,
            data_entrada TEXT NOT NULL,
            data_saida TEXT,
            status TEXT DEFAULT 'estacionado',
            valor_pago REAL DEFAULT 0,
            FOREIGN KEY (cliente_id) REFERENCES clientes(id),
            FOREIGN KEY (vaga_id) REFERENCES vagas(id)
        )
    ''')

    c.execute('SELECT COUNT(*) as total FROM vagas')
    if c.fetchone()['total'] == 0:
        for i in range(1, TOTAL_VAGAS + 1):
            numero = f'A{i:02d}' if i <= 10 else f'B{i-10:02d}'
            c.execute('INSERT INTO vagas (numero, status) VALUES (?, ?)', (numero, 'livre'))

    conn.commit()
    conn.close()

def calcular_valor(data_entrada_str, data_saida_str=None):
    entrada = datetime.strptime(data_entrada_str, '%Y-%m-%d %H:%M:%S')
    saida = datetime.strptime(data_saida_str, '%Y-%m-%d %H:%M:%S') if data_saida_str else datetime.now()
    delta = saida - entrada
    horas = delta.total_seconds() / 3600
    horas_cobradas = max(1, int(horas) + (1 if horas % 1 > 0 else 0))
    valor = max(TAXA_MINIMA, horas_cobradas * TAXA_HORA)
    return round(valor, 2), delta

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/api/clientes', methods=['GET'])
def listar_clientes():
    conn = get_db()
    rows = conn.execute('SELECT * FROM clientes ORDER BY nome').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/clientes', methods=['POST'])
def cadastrar_cliente():
    data = request.json
    nome = data.get('nome', '').strip()
    telefone = data.get('telefone', '').strip()
    cpf = data.get('cpf', '').strip()
    if not nome:
        return jsonify({'erro': 'Nome é obrigatório'}), 400
    data_cadastro = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    conn = get_db()
    c = conn.cursor()
    c.execute(
        'INSERT INTO clientes (nome, telefone, cpf, data_cadastro) VALUES (?, ?, ?, ?)',
        (nome, telefone, cpf, data_cadastro)
    )
    conn.commit()
    cliente_id = c.lastrowid
    conn.close()
    return jsonify({'mensagem': 'Cliente cadastrado', 'id': cliente_id}), 201

@app.route('/api/vagas', methods=['GET'])
def listar_vagas():
    conn = get_db()
    rows = conn.execute('''
        SELECT v.*, ve.placa, ve.modelo
        FROM vagas v
        LEFT JOIN veiculos ve ON ve.vaga_id = v.id AND ve.status = 'estacionado'
        ORDER BY v.numero
    ''').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/veiculos', methods=['GET'])
def listar_veiculos():
    status = request.args.get('status', 'estacionado')
    conn = get_db()
    if status == 'todos':
        rows = conn.execute('''
            SELECT ve.*, c.nome as cliente_nome, vg.numero as vaga_numero
            FROM veiculos ve
            LEFT JOIN clientes c ON c.id = ve.cliente_id
            LEFT JOIN vagas vg ON vg.id = ve.vaga_id
            ORDER BY ve.data_entrada DESC
        ''').fetchall()
    else:
        rows = conn.execute('''
            SELECT ve.*, c.nome as cliente_nome, vg.numero as vaga_numero
            FROM veiculos ve
            LEFT JOIN clientes c ON c.id = ve.cliente_id
            LEFT JOIN vagas vg ON vg.id = ve.vaga_id
            WHERE ve.status = ?
            ORDER BY ve.data_entrada DESC
        ''', (status,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/entrada', methods=['POST'])
def registrar_entrada():
    data = request.json
    placa = data.get('placa', '').strip().upper()
    modelo = data.get('modelo', '').strip()
    cor = data.get('cor', '').strip()
    cliente_id = data.get('cliente_id') or None
    vaga_id = data.get('vaga_id')

    if not placa:
        return jsonify({'erro': 'Placa é obrigatória'}), 400
    if not vaga_id:
        return jsonify({'erro': 'Selecione uma vaga'}), 400

    conn = get_db()
    c = conn.cursor()

    c.execute("SELECT id FROM veiculos WHERE placa = ? AND status = 'estacionado'", (placa,))
    if c.fetchone():
        conn.close()
        return jsonify({'erro': 'Veículo já está estacionado'}), 400

    c.execute("SELECT status FROM vagas WHERE id = ?", (vaga_id,))
    vaga = c.fetchone()
    if not vaga or vaga['status'] != 'livre':
        conn.close()
        return jsonify({'erro': 'Vaga não está livre'}), 400

    data_cadastro = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    data_entrada = data_cadastro

    c.execute('''
        INSERT INTO veiculos (placa, modelo, cor, cliente_id, vaga_id, data_cadastro, data_entrada, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'estacionado')
    ''', (placa, modelo, cor, cliente_id, vaga_id, data_cadastro, data_entrada))
    c.execute("UPDATE vagas SET status = 'ocupada' WHERE id = ?", (vaga_id,))
    conn.commit()
    veiculo_id = c.lastrowid
    conn.close()

    return jsonify({
        'mensagem': 'Entrada registrada com sucesso',
        'id': veiculo_id,
        'data_cadastro': data_cadastro,
        'data_entrada': data_entrada
    }), 201

@app.route('/api/saida/<int:veiculo_id>', methods=['POST'])
def registrar_saida(veiculo_id):
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM veiculos WHERE id = ?', (veiculo_id,))
    veiculo = c.fetchone()

    if not veiculo:
        conn.close()
        return jsonify({'erro': 'Veículo não encontrado'}), 404
    if veiculo['status'] == 'finalizado':
        conn.close()
        return jsonify({'erro': 'Veículo já saiu'}), 400

    data_saida = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    valor, delta = calcular_valor(veiculo['data_entrada'], data_saida)

    c.execute('''
        UPDATE veiculos SET data_saida = ?, status = 'finalizado', valor_pago = ?
        WHERE id = ?
    ''', (data_saida, valor, veiculo_id))

    if veiculo['vaga_id']:
        c.execute("UPDATE vagas SET status = 'livre' WHERE id = ?", (veiculo['vaga_id'],))

    conn.commit()
    conn.close()

    horas = int(delta.total_seconds() // 3600)
    minutos = int((delta.total_seconds() % 3600) // 60)

    return jsonify({
        'mensagem': 'Saída registrada com sucesso',
        'placa': veiculo['placa'],
        'data_entrada': veiculo['data_entrada'],
        'data_saida': data_saida,
        'tempo': f'{horas}h {minutos}min',
        'valor': valor
    })

@app.route('/api/estatisticas', methods=['GET'])
def estatisticas():
    conn = get_db()
    c = conn.cursor()
    estacionados = c.execute("SELECT COUNT(*) as t FROM veiculos WHERE status = 'estacionado'").fetchone()['t']
    finalizados = c.execute("SELECT COUNT(*) as t FROM veiculos WHERE status = 'finalizado'").fetchone()['t']
    receita = c.execute("SELECT COALESCE(SUM(valor_pago), 0) as t FROM veiculos WHERE status = 'finalizado'").fetchone()['t']
    vagas_livres = c.execute("SELECT COUNT(*) as t FROM vagas WHERE status = 'livre'").fetchone()['t']
    vagas_ocupadas = c.execute("SELECT COUNT(*) as t FROM vagas WHERE status = 'ocupada'").fetchone()['t']
    total_clientes = c.execute("SELECT COUNT(*) as t FROM clientes").fetchone()['t']
    conn.close()
    return jsonify({
        'estacionados': estacionados,
        'finalizados': finalizados,
        'receita': round(receita, 2),
        'vagas_livres': vagas_livres,
        'vagas_ocupadas': vagas_ocupadas,
        'total_clientes': total_clientes
    })

if __name__ == '__main__':
    init_db()
    print('=' * 50)
    print('  Sistema de Estacionamento COMPLETO')
    print('  Acesse: http://127.0.0.1:5000')
    print('  Banco: estacionamento.db (DB Browser)')
    print('=' * 50)
    app.run(debug=True, host='0.0.0.0', port=5000)