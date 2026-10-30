from flask import Flask, request, jsonify, send_from_directory
import sqlite3
from datetime import datetime
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_NAME = os.path.join(BASE_DIR, 'estacionamento.db')

app = Flask(__name__, static_folder=BASE_DIR, static_url_path='')

def get_db():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # Tabela de clientes
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS clientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            telefone TEXT,
            email TEXT,
            data_cadastro TEXT
        )
    ''')

    # Tabela de veículos
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS veiculos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            placa TEXT NOT NULL UNIQUE,
            modelo TEXT,
            marca TEXT,
            cor TEXT,
            tipo TEXT,
            ano INTEGER,
            tamanho TEXT,
            cliente_id INTEGER,
            FOREIGN KEY (cliente_id) REFERENCES clientes(id)
        )
    ''')

    # Tabela de vagas
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS vagas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero TEXT NOT NULL UNIQUE,
            tipo TEXT NOT NULL,
            status TEXT DEFAULT 'livre'
        )
    ''')

    # Tabela de estacionamentos (entrada/saída)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS estacionamentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            veiculo_id INTEGER,
            vaga_id INTEGER,
            data_entrada TEXT NOT NULL,
            data_saida TEXT,
            valor REAL DEFAULT 0,
            tipo_cobranca TEXT DEFAULT 'hora',
            status TEXT DEFAULT 'estacionado',
            FOREIGN KEY (veiculo_id) REFERENCES veiculos(id),
            FOREIGN KEY (vaga_id) REFERENCES vagas(id)
        )
    ''')

    # Criar vagas padrão se não existirem
    cursor.execute('SELECT COUNT(*) as total FROM vagas')
    if cursor.fetchone()['total'] == 0:
        for i in range(1, 11):
            tipo = 'preferencial' if i <= 2 else 'normal'
            cursor.execute('INSERT INTO vagas (numero, tipo, status) VALUES (?, ?, ?)',
                           (f'V{i:02d}', tipo, 'livre'))

    conn.commit()
    conn.close()
    print(f"Banco criado: {DB_NAME}")

# ====================== ROTAS ======================

@app.route('/')
def index():
    return send_from_directory(BASE_DIR, 'index.html')

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory(BASE_DIR, filename)

# ---------- CLIENTES ----------
@app.route('/api/clientes', methods=['GET'])
def listar_clientes():
    conn = get_db()
    rows = conn.execute('SELECT * FROM clientes ORDER BY nome').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/clientes', methods=['POST'])
def criar_cliente():
    data = request.json or {}
    nome = data.get('nome', '').strip()
    if not nome:
        return jsonify({'erro': 'Nome é obrigatório'}), 400

    data_cadastro = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO clientes (nome, telefone, email, data_cadastro)
        VALUES (?, ?, ?, ?)
    ''', (nome, data.get('telefone'), data.get('email'), data_cadastro))
    conn.commit()
    novo_id = cursor.lastrowid
    conn.close()
    return jsonify({'id': novo_id, 'mensagem': 'Cliente cadastrado!'}), 201

# ---------- VEÍCULOS ----------
@app.route('/api/veiculos', methods=['GET'])
def listar_veiculos():
    conn = get_db()
    rows = conn.execute('''
        SELECT v.*, c.nome as cliente_nome
        FROM veiculos v
        LEFT JOIN clientes c ON v.cliente_id = c.id
        ORDER BY v.placa
    ''').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/veiculos', methods=['POST'])
def criar_veiculo():
    data = request.json or {}
    placa = data.get('placa', '').strip().upper()
    if not placa:
        return jsonify({'erro': 'Placa é obrigatória'}), 400

    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            INSERT INTO veiculos (placa, modelo, marca, cor, tipo, ano, tamanho, cliente_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            placa,
            data.get('modelo'),
            data.get('marca'),
            data.get('cor'),
            data.get('tipo'),
            data.get('ano'),
            data.get('tamanho'),
            data.get('cliente_id')
        ))
        conn.commit()
        novo_id = cursor.lastrowid
        conn.close()
        return jsonify({'id': novo_id, 'mensagem': 'Veículo cadastrado!'}), 201
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'erro': 'Placa já cadastrada'}), 400

# ---------- VAGAS ----------
@app.route('/api/vagas', methods=['GET'])
def listar_vagas():
    conn = get_db()
    rows = conn.execute('SELECT * FROM vagas ORDER BY numero').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

# ---------- ENTRADA / SAÍDA ----------
@app.route('/api/estacionamentos', methods=['GET'])
def listar_estacionamentos():
    status = request.args.get('status', 'estacionado')
    conn = get_db()
    rows = conn.execute('''
        SELECT e.*, v.placa, v.modelo, v.cor, vg.numero as vaga_numero, vg.tipo as vaga_tipo
        FROM estacionamentos e
        JOIN veiculos v ON e.veiculo_id = v.id
        JOIN vagas vg ON e.vaga_id = vg.id
        WHERE e.status = ?
        ORDER BY e.data_entrada DESC
    ''', (status,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/estacionamentos/entrada', methods=['POST'])
def registrar_entrada():
    data = request.json or {}
    placa = data.get('placa', '').strip().upper()
    tipo_vaga = data.get('tipo_vaga', 'normal')
    tipo_cobranca = data.get('tipo_cobranca', 'hora')

    if not placa:
        return jsonify({'erro': 'Placa é obrigatória'}), 400

    conn = get_db()
    cursor = conn.cursor()

    # Buscar veículo
    veiculo = cursor.execute('SELECT id FROM veiculos WHERE placa = ?', (placa,)).fetchone()
    if not veiculo:
        conn.close()
        return jsonify({'erro': 'Veículo não cadastrado. Cadastre o veículo primeiro.'}), 400

    # Verificar se já está estacionado
    ja_estacionado = cursor.execute('''
        SELECT id FROM estacionamentos 
        WHERE veiculo_id = ? AND status = 'estacionado'
    ''', (veiculo['id'],)).fetchone()
    if ja_estacionado:
        conn.close()
        return jsonify({'erro': 'Este veículo já está estacionado'}), 400

    # Buscar vaga livre do tipo desejado
    vaga = cursor.execute('''
        SELECT id FROM vagas 
        WHERE tipo = ? AND status = 'livre' 
        LIMIT 1
    ''', (tipo_vaga,)).fetchone()

    if not vaga:
        conn.close()
        return jsonify({'erro': f'Não há vagas {tipo_vaga} disponíveis'}), 400

    data_entrada = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    cursor.execute('''
        INSERT INTO estacionamentos (veiculo_id, vaga_id, data_entrada, tipo_cobranca, status)
        VALUES (?, ?, ?, ?, 'estacionado')
    ''', (veiculo['id'], vaga['id'], data_entrada, tipo_cobranca))

    cursor.execute('UPDATE vagas SET status = "ocupada" WHERE id = ?', (vaga['id'],))
    conn.commit()
    novo_id = cursor.lastrowid
    conn.close()

    return jsonify({
        'id': novo_id,
        'mensagem': f'Entrada registrada! Vaga {tipo_vaga}',
        'data_entrada': data_entrada
    }), 201

@app.route('/api/estacionamentos/<int:id>/saida', methods=['PUT'])
def registrar_saida(id):
    conn = get_db()
    cursor = conn.cursor()

    est = cursor.execute('''
        SELECT * FROM estacionamentos WHERE id = ? AND status = 'estacionado'
    ''', (id,)).fetchone()

    if not est:
        conn.close()
        return jsonify({'erro': 'Registro não encontrado'}), 404

    data_saida = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    # Cálculo do valor
    entrada = datetime.strptime(est['data_entrada'], '%Y-%m-%d %H:%M:%S')
    saida = datetime.strptime(data_saida, '%Y-%m-%d %H:%M:%S')
    horas = (saida - entrada).total_seconds() / 3600

    if est['tipo_cobranca'] == 'diaria':
        valor = 40.00
    else:
        valor = max(5.0, round(horas * 5, 2))

    cursor.execute('''
        UPDATE estacionamentos 
        SET data_saida = ?, valor = ?, status = 'saido'
        WHERE id = ?
    ''', (data_saida, valor, id))

    cursor.execute('UPDATE vagas SET status = "livre" WHERE id = ?', (est['vaga_id'],))
    conn.commit()
    conn.close()

    return jsonify({
        'mensagem': f'Saída registrada! Valor: R$ {valor:.2f}',
        'valor': valor,
        'data_saida': data_saida
    })

# ---------- RELATÓRIOS / ESTATÍSTICAS ----------
@app.route('/api/relatorios', methods=['GET'])
def relatorios():
    conn = get_db()
    cursor = conn.cursor()

    estacionados = cursor.execute('SELECT COUNT(*) as t FROM estacionamentos WHERE status="estacionado"').fetchone()['t']
    saidos = cursor.execute('SELECT COUNT(*) as t FROM estacionamentos WHERE status="saido"').fetchone()['t']
    arrecadado = cursor.execute('SELECT COALESCE(SUM(valor),0) as t FROM estacionamentos WHERE status="saido"').fetchone()['t']
    vagas_livres = cursor.execute('SELECT COUNT(*) as t FROM vagas WHERE status="livre"').fetchone()['t']
    vagas_ocupadas = cursor.execute('SELECT COUNT(*) as t FROM vagas WHERE status="ocupada"').fetchone()['t']
    total_clientes = cursor.execute('SELECT COUNT(*) as t FROM clientes').fetchone()['t']
    total_veiculos = cursor.execute('SELECT COUNT(*) as t FROM veiculos').fetchone()['t']

    conn.close()
    return jsonify({
        'estacionados': estacionados,
        'saidos': saidos,
        'arrecadado': round(arrecadado, 2),
        'vagas_livres': vagas_livres,
        'vagas_ocupadas': vagas_ocupadas,
        'total_clientes': total_clientes,
        'total_veiculos': total_veiculos
    })

if __name__ == '__main__':
    init_db()
    print('=' * 55)
    print('  Sistema de Estacionamento - Projeto Flash')
    print('  Acesse: http://127.0.0.1:8000')
    print('  Banco: estacionamento.db (DB Browser)')
    print('=' * 55)
    app.run(debug=True, port=8000, host='127.0.0.1')
