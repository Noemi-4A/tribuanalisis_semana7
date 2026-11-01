import os, re, json, sqlite3, io, urllib.request, urllib.error
from html.parser import HTMLParser
from datetime import datetime
from functools import wraps
from flask import Flask, render_template, request, redirect, url_for, session, jsonify, flash
from werkzeug.security import generate_password_hash, check_password_hash

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INSTANCE_DIR = os.path.join(BASE_DIR, 'instance')
os.makedirs(INSTANCE_DIR, exist_ok=True)
DB_PATH = os.environ.get('DATABASE_PATH', os.path.join(INSTANCE_DIR, 'tribuanalisis.db'))
app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'cambia-esta-clave-secreta-antes-de-publicar-tribuanalisis')
app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE='Lax')


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with db() as conn:
        conn.execute('''CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL)''')
        conn.execute('''CREATE TABLE IF NOT EXISTS cases (
            id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
            case_name TEXT NOT NULL, year INTEGER NOT NULL, category TEXT NOT NULL,
            annual_tax REAL NOT NULL, balance REAL NOT NULL, payload TEXT NOT NULL,
            saved_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id))''')
        # Migrate older local databases without deleting existing user accounts or case history.
        existing = {row['name'] for row in conn.execute('PRAGMA table_info(cases)').fetchall()}
        migrations = {
            'user_id': 'INTEGER NOT NULL DEFAULT 0',
            'case_name': "TEXT NOT NULL DEFAULT 'Caso sin título'",
            'year': 'INTEGER NOT NULL DEFAULT 2026',
            'category': "TEXT NOT NULL DEFAULT 'Caso mixto'",
            'annual_tax': 'REAL NOT NULL DEFAULT 0',
            'balance': 'REAL NOT NULL DEFAULT 0',
            'payload': "TEXT NOT NULL DEFAULT '{}'",
            'saved_at': "TEXT NOT NULL DEFAULT ''"
        }
        for column, definition in migrations.items():
            if column not in existing:
                conn.execute(f'ALTER TABLE cases ADD COLUMN {column} {definition}')

init_db()


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get('user_id'):
            return redirect(url_for('auth'))
        return fn(*args, **kwargs)
    return wrapper

@app.route('/acceso', methods=['GET', 'POST'])
def auth():
    if session.get('user_id'):
        return redirect(url_for('index'))
    mode = request.args.get('mode', 'login')
    if request.method == 'POST':
        mode = request.form.get('mode', 'login')
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')
        if mode == 'register':
            full_name = re.sub(r'\s+', ' ', request.form.get('full_name', '').strip())
            if len(full_name) < 3:
                flash('Escribe tu nombre completo.', 'error')
            elif not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', email):
                flash('Ingresa un correo válido.', 'error')
            elif len(password) != 6:
                flash('La contraseña debe tener exactamente 6 caracteres. Puedes usar letras, números y símbolos.', 'error')
            else:
                try:
                    with db() as conn:
                        cur = conn.execute('INSERT INTO users(full_name,email,password_hash,created_at) VALUES(?,?,?,?)',
                            (full_name, email, generate_password_hash(password), datetime.now().isoformat(timespec='seconds')))
                        session.clear(); session['user_id'] = cur.lastrowid; session['full_name'] = full_name; session['email'] = email
                    return redirect(url_for('index'))
                except sqlite3.IntegrityError:
                    flash('Ese correo ya tiene una cuenta. Inicia sesión.', 'error')
                    mode = 'login'
        else:
            with db() as conn:
                user = conn.execute('SELECT * FROM users WHERE email=?', (email,)).fetchone()
            if user and check_password_hash(user['password_hash'], password):
                session.clear(); session['user_id'] = user['id']; session['full_name'] = user['full_name']; session['email'] = user['email']
                return redirect(url_for('index'))
            flash('Correo o contraseña incorrectos.', 'error')
            mode = 'login'
    return render_template('auth.html', mode=mode)

@app.route('/cerrar-sesion', methods=['POST'])
def logout():
    session.clear()
    return redirect(url_for('auth'))

@app.route('/cambiar-contrasena', methods=['POST'])
@login_required
def change_password():
    current = request.form.get('current_password', '')
    new = request.form.get('new_password', '')
    confirm = request.form.get('confirm_password', '')
    with db() as conn:
        user = conn.execute('SELECT * FROM users WHERE id=?', (session['user_id'],)).fetchone()
        if not user or not check_password_hash(user['password_hash'], current):
            flash('La contraseña actual no coincide.', 'error')
        elif len(new) != 6:
            flash('La nueva contraseña debe tener exactamente 6 caracteres.', 'error')
        elif new != confirm:
            flash('La confirmación no coincide con la nueva contraseña.', 'error')
        elif current == new:
            flash('La nueva contraseña debe ser distinta de la actual.', 'error')
        else:
            conn.execute('UPDATE users SET password_hash=? WHERE id=?',
                         (generate_password_hash(new), session['user_id']))
            flash('Contraseña actualizada correctamente.', 'success')
    return redirect(url_for('index') + '#inicio')

@app.route('/')
@login_required
def index():
    name = session.get('full_name', 'Estudiante')
    initials = ''.join(part[0] for part in name.split()[:2]).upper() or 'TA'
    return render_template('index.html', user_name=name, user_initials=initials, user_email=session.get('email',''))

@app.route('/api/cases', methods=['GET', 'POST', 'PUT', 'DELETE'])
@login_required
def cases_api():
    uid = session['user_id']
    if request.method == 'GET':
        with db() as conn:
            rows = conn.execute('SELECT id,case_name,year,category,annual_tax,balance,payload,saved_at FROM cases WHERE user_id=? ORDER BY id DESC LIMIT 100', (uid,)).fetchall()
            # Migración transparente de antiguos casos Excel guardados en cero por versiones anteriores.
            # Solo recalcula registros importados que conservan la fila fuente y todavía no tienen cálculo.
            for row in rows:
                try:
                    payload = json.loads(row['payload'])
                    source_row = payload.get('excelRow') if isinstance(payload, dict) else None
                    if not isinstance(source_row, dict):
                        continue
                    if payload.get('calculationAvailable') is True:
                        continue
                    if abs(float(row['annual_tax'] or 0)) > 0.005 or abs(float(row['balance'] or 0)) > 0.005:
                        continue
                    calculation = _calculate_excel_liquidation(source_row)
                    if not calculation.get('calculationAvailable', True):
                        continue
                    payload.update(calculation)
                    conn.execute('UPDATE cases SET year=?,annual_tax=?,balance=?,payload=? WHERE id=? AND user_id=?',
                        (int(calculation['year']), float(calculation['annualTax']), float(calculation['balance']),
                         json.dumps(payload, ensure_ascii=False, allow_nan=False), row['id'], uid))
                except (TypeError, ValueError, json.JSONDecodeError):
                    continue
            rows = conn.execute('SELECT id,case_name,year,category,annual_tax,balance,payload,saved_at FROM cases WHERE user_id=? ORDER BY id DESC LIMIT 100', (uid,)).fetchall()
        return jsonify([dict(row) | {'payload': json.loads(row['payload'])} for row in rows])
    if request.method == 'PUT':
        data = request.get_json(silent=True) or {}
        case_id = data.get('id')
        if not case_id:
            return jsonify({'error':'Falta el identificador del caso que se actualizará.'}), 400
        payload = data.get('payload') or {}
        case_name = str(data.get('case_name') or payload.get('caseName') or 'Caso sin título')[:180]
        category = str(data.get('category') or payload.get('category') or payload.get('kind') or 'Caso de renta')[:100]
        try:
            year = int(data.get('year') or payload.get('year') or 2026)
            tax = float(data.get('annual_tax') if data.get('annual_tax') is not None else payload.get('annualTax') or 0)
            balance = float(data.get('balance') if data.get('balance') is not None else payload.get('balance') or 0)
            serialized_payload = json.dumps(payload, ensure_ascii=False, allow_nan=False)
            if year < 2000 or year > 2100 or not all(map(lambda x: abs(x) < 1e15, (tax,balance))):
                raise ValueError()
        except (TypeError, ValueError, OverflowError):
            return jsonify({'error':'Los datos actualizados no son válidos.'}), 400
        stamp = datetime.now().strftime('%d/%m/%Y %H:%M')
        with db() as conn:
            cur = conn.execute('UPDATE cases SET case_name=?,year=?,category=?,annual_tax=?,balance=?,payload=?,saved_at=? WHERE id=? AND user_id=?',
                (case_name,year,category,tax,balance,serialized_payload,stamp,case_id,uid))
            if cur.rowcount == 0:
                return jsonify({'error':'No se encontró el caso en tu cuenta.'}), 404
        return jsonify({'ok':True,'id':case_id,'saved_at':stamp,'updated':True})
    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        payload = data.get('payload') or {}
        case_name = str(data.get('case_name') or payload.get('caseName') or 'Caso sin título')[:180]
        category = str(data.get('category') or payload.get('category') or 'Caso mixto')[:80]
        try:
            year = int(data.get('year') or payload.get('year') or 2026)
            tax = float(data.get('annual_tax') if data.get('annual_tax') is not None else payload.get('annualTax') or 0)
            balance = float(data.get('balance') if data.get('balance') is not None else payload.get('balance') or 0)
            if year < 2000 or year > 2100 or not all(map(lambda x: abs(x) < 1e15, (tax, balance))):
                raise ValueError('Valores fuera de rango.')
            serialized_payload = json.dumps(payload, ensure_ascii=False, allow_nan=False)
        except (TypeError, ValueError, OverflowError):
            return jsonify({'error': 'Los datos del caso no son válidos. Vuelve a calcularlo antes de guardar.'}), 400
        stamp = datetime.now().strftime('%d/%m/%Y %H:%M')
        with db() as conn:
            cur = conn.execute('INSERT INTO cases(user_id,case_name,year,category,annual_tax,balance,payload,saved_at) VALUES(?,?,?,?,?,?,?,?)',
                (uid, case_name, year, category, tax, balance, serialized_payload, stamp))
        return jsonify({'ok': True, 'id': cur.lastrowid, 'saved_at': stamp})
    case_id = request.args.get('id', type=int)
    batch_id = request.args.get('batch_id')
    with db() as conn:
        if batch_id:
            conn.execute("DELETE FROM cases WHERE user_id=? AND json_extract(payload, '$.excelBatchId')=?", (uid, str(batch_id)[:100]))
        elif case_id:
            conn.execute('DELETE FROM cases WHERE id=? AND user_id=?', (case_id, uid))
        else:
            conn.execute('DELETE FROM cases WHERE user_id=?', (uid,))
    return jsonify({'ok': True})






class _UITTableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_row = False
        self.in_cell = False
        self.cell = ''
        self.row = []
        self.rows = []
    def handle_starttag(self, tag, attrs):
        if tag.lower() == 'tr':
            self.in_row = True
            self.row = []
        elif self.in_row and tag.lower() in ('td', 'th'):
            self.in_cell = True
            self.cell = ''
    def handle_data(self, data):
        if self.in_cell:
            self.cell += data
    def handle_endtag(self, tag):
        if tag.lower() in ('td', 'th') and self.in_cell:
            self.row.append(' '.join(self.cell.split()))
            self.in_cell = False
        elif tag.lower() == 'tr' and self.in_row:
            if self.row:
                self.rows.append(self.row)
            self.in_row = False

OFFICIAL_UIT_VALUES = {2023: 4950.0, 2024: 5150.0, 2025: 5350.0, 2026: 5500.0}
SUNAT_UIT_URL = 'https://www.sunat.gob.pe/indicestasas/uit.html'

def _official_uit_for_year(year):
    if year in OFFICIAL_UIT_VALUES:
        return OFFICIAL_UIT_VALUES[year], SUNAT_UIT_URL
    req = urllib.request.Request(SUNAT_UIT_URL, headers={
        'User-Agent': 'Mozilla/5.0 (compatible; Tribuanalisis/1.0)',
        'Accept': 'text/html,application/xhtml+xml,*/*'
    })
    with urllib.request.urlopen(req, timeout=8) as response:
        page = response.read().decode('utf-8', errors='replace')
    # Para ejercicios nuevos, leer exclusivamente la fila cuyo primer campo sea el año exacto.
    parser = _UITTableParser()
    parser.feed(page)
    for row in parser.rows:
        if not row or not re.fullmatch(r'20\d{2}', str(row[0]).strip()):
            continue
        if int(row[0].strip()) != year or len(row) < 2:
            continue
        number = re.sub(r'[^0-9,.]', '', row[1]).replace(',', '')
        if number and re.fullmatch(r'\d+(?:\.\d+)?', number):
            value = float(number)
            if value >= 1000:
                return value, SUNAT_UIT_URL
    return None, SUNAT_UIT_URL

@app.route('/api/uit/actualizar', methods=['GET'])
def actualizar_uit():
    try:
        year = int(request.args.get('year', '0'))
        if year < 2000 or year > 2100:
            return jsonify({'ok': False, 'error': 'Ejercicio no válido.'}), 400
        try:
            amount, source = _official_uit_for_year(year)
        except (urllib.error.URLError, TimeoutError, OSError):
            amount, source = OFFICIAL_UIT_VALUES.get(year), SUNAT_UIT_URL
            if amount is None:
                return jsonify({'ok': False, 'available': False, 'year': year,
                                'message': f'No se pudo verificar en SUNAT si la UIT {year} ya fue publicada.',
                                'source': source}), 503
        if amount is None:
            return jsonify({'ok': False, 'available': False, 'year': year,
                            'message': f'La SUNAT todavía no publica el valor de la UIT para {year}.',
                            'source': source}), 404
        os.makedirs(INSTANCE_DIR, exist_ok=True)
        path = os.path.join(INSTANCE_DIR, 'uit_values.json')
        try:
            with open(path, 'r', encoding='utf-8') as f:
                values = json.load(f)
        except (OSError, ValueError):
            values = {}
        values[str(year)] = {'value': amount, 'source': source,
                             'updated_at': datetime.now().isoformat(timespec='seconds')}
        tmp = path + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(values, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)
        return jsonify({'ok': True, 'year': year, 'value': amount,
                        'source': source, 'updated_at': values[str(year)]['updated_at']})
    except (TypeError, ValueError):
        return jsonify({'ok': False, 'error': 'Ejercicio no válido.'}), 400




def _excel_norm(value):
    import unicodedata
    text = unicodedata.normalize('NFD', str(value or '').lower())
    text = ''.join(ch for ch in text if unicodedata.category(ch) != 'Mn')
    return re.sub(r'[^a-z0-9]+', ' ', text).strip()


def _calculate_excel_liquidation(row):
    """Estimación anual reproducible para los casos de trabajo/fuente extranjera."""
    headers = row.get('headers') or []
    values = row.get('values') or []
    normalized = [_excel_norm(h) for h in headers]
    def number(terms, default=0.0):
        idx = next((i for i, h in enumerate(normalized) if any(t in h for t in terms)), None)
        if idx is None or idx >= len(values):
            return float(default)
        try:
            return max(0.0, float(str(values[idx] or 0).replace(',', '')))
        except (TypeError, ValueError):
            return float(default)
    def text(terms, default=''):
        idx = next((i for i, h in enumerate(normalized) if any(t in h for t in terms)), None)
        return str(values[idx] if idx is not None and idx < len(values) and values[idx] is not None else default).strip()
    period = text(['periodo tributario', 'periodo'])
    year_value = number(['ejercicio'], 0)
    year = int(year_value or (int(period[:4]) if re.match(r'^20\d{2}', period) else 2025))
    uit = OFFICIAL_UIT_VALUES.get(year)
    if not uit:
        uit = 0.0
    if uit <= 0:
        return {
            'kind': 'pendiente', 'year': year, 'uit': 0.0, 'annualTax': 0.0, 'balance': 0.0,
            'balanceAmount': 0.0, 'balanceLabel': 'PENDIENTE UIT OFICIAL',
            'filingRequired': None, 'filingLabel': 'NO EVALUABLE: UIT NO PUBLICADA',
            'filingReasons': [], 'filingNote': f'No se calcula el ejercicio {year} porque todavía no se ha verificado una UIT oficial para ese año. Actualiza la UIT cuando SUNAT publique el valor.',
            'calculationAvailable': False, 'caseName': row.get('taxpayer_name') or row.get('name') or 'Caso Excel'
        }
    pro_fourth = number(['honorarios profesion', 'honorarios por profesion', 'ingresos por servicios independientes'])
    other_fourth = number(['otras rentas cuarta', 'dietas director', 'funciones similares'])
    fifth_salary = number(['remuneracion anual quinta', 'remuneracion anual', 'sueldo anual', 'remuneraciones quinta'])
    bonuses = number(['gratificaciones bonos', 'gratificaciones', 'bonificaciones', 'utilidades'])
    foreign_net = number(['renta neta fuente extranjera', 'renta extranjera', 'ingreso extranjero'])
    foreign_tax = number(['impuesto pagado extranjero', 'impuesto extranjero'])
    fourth_withholding = number(['retencion cuarta'])
    fifth_withholding = number(['retencion quinta'])
    payments = number(['pagos a cuenta cuarta', 'pagos previos adicionales'])
    prior_credit = number(['saldo favor anterior'])
    itf = number(['itf deducible'])
    donations = number(['donaciones deducibles'])
    expenses = row.get('expenses') or {}
    rent_expense = float(expenses.get('rentExpense') or 0)
    restaurant_expense = float(expenses.get('restaurantExpense') or 0)
    health_expense = float(expenses.get('healthExpense') or 0)
    professional_expense = float(expenses.get('professionalExpense') or 0)
    essalud_expense = float(expenses.get('essaludExpense') or 0)
    fourth_deduction = min(pro_fourth * .20, 24 * uit)
    fourth_net = max(0.0, pro_fourth - fourth_deduction) + other_fourth
    fifth_gross = fifth_salary + bonuses
    work_gross = fourth_net + fifth_gross
    basic_deduction = min(work_gross, 7 * uit) if work_gross > 0 else 0.0
    rent_deduction = rent_expense * .30
    restaurant_deduction = restaurant_expense * .15
    health_deduction = health_expense * .30
    professional_deduction = professional_expense * .30
    essalud_deduction = essalud_expense
    requested_extra = sum([rent_deduction, restaurant_deduction, health_deduction, professional_deduction, essalud_deduction])
    remaining = max(0.0, work_gross - basic_deduction)
    extra_deduction = min(requested_extra, 3 * uit, remaining)
    itf_deduction = min(itf, max(0.0, remaining - extra_deduction))
    donation_deduction = min(donations, max(0.0, remaining - extra_deduction - itf_deduction))
    work_taxable = max(0.0, remaining - extra_deduction - itf_deduction - donation_deduction)
    taxable = work_taxable + foreign_net
    remaining_tax = taxable
    annual_tax = 0.0
    for limit, rate in [(5 * uit, .08), (15 * uit, .14), (15 * uit, .17), (10 * uit, .20), (float('inf'), .30)]:
        base = min(remaining_tax, limit)
        annual_tax += base * rate
        remaining_tax -= base
        if remaining_tax <= 0:
            break
    foreign_credit_limit = foreign_net * (annual_tax / taxable) if taxable > 0 and foreign_net > 0 else 0.0
    foreign_credit = min(foreign_tax, foreign_credit_limit, annual_tax)
    credits = fourth_withholding + fifth_withholding + payments + prior_credit + foreign_credit
    balance = annual_tax - credits
    fourth_on = (pro_fourth + other_fourth) > 0
    fifth_on = fifth_gross > 0
    foreign_on = foreign_net > 0
    n_sources = sum([fourth_on, fifth_on, foreign_on])
    kind = 'mixta' if n_sources > 1 else 'cuarta' if fourth_on else 'quinta' if fifth_on else 'extranjera'
    spouse_attribution = text(['atribuye gastos de alquiler al conyuge', 'atribucion alquiler conyuge', 'atribuye alquiler'], 'No').lower() in ('si','sí','yes','1','true')
    refund_request = text(['solicita devolucion', 'solicita devolucion de saldo'], 'No').lower() in ('si','sí','yes','1','true')
    reasons = []
    if balance > .005:
        reasons.append('Determina deuda tributaria por pagar')
    if prior_credit > .005:
        reasons.append('Aplica saldo a favor de ejercicios anteriores')
    if balance < -.005 and (fourth_on or (foreign_on and (fourth_on or fifth_on))):
        reasons.append('Determina saldo a favor en rentas de cuarta o rentas de trabajo con fuente extranjera')
    if balance < -.005 and fifth_on and not fourth_on and rent_deduction > .005:
        reasons.append('Saldo a favor de quinta por deducción de alquiler/subarrendamiento')
    if spouse_attribution:
        reasons.append('Atribuye gastos de alquiler al cónyuge/concubino')
    if refund_request and balance < -.005:
        reasons.append('Solicita devolución de retenciones/pagos en exceso')
    filing_required = bool(reasons)
    if year >= 2026:
        filing_required = None
        reasons = []
    if balance > .005:
        balance_label = 'A FAVOR DEL FISCO'
        balance_amount = balance
    elif balance < -.005:
        balance_label = 'A FAVOR DEL CONTRIBUYENTE'
        balance_amount = abs(balance)
    else:
        balance_label = 'SIN SALDO'
        balance_amount = 0.0
    filing_label = ('PROYECCIÓN: OBLIGACIÓN FV 709 A CONFIRMAR AL CIERRE' if year >= 2026 else
                    'OBLIGADO A PRESENTAR FV 709' if filing_required else 'NO OBLIGADO SEGÚN LOS SUPUESTOS EVALUADOS')
    if year >= 2026:
        filing_note = 'El ejercicio aún no ha cerrado. El saldo es una proyección con la UIT vigente conocida; la obligación de presentar la declaración anual debe confirmarse al cierre y con las reglas que SUNAT publique para ese ejercicio.'
    elif filing_required:
        filing_note = 'Se activa al menos un supuesto de obligación de SUNAT: ' + '; '.join(reasons) + '.'
    elif fifth_on and not fourth_on and not foreign_on:
        filing_note = 'Percibe exclusivamente quinta categoría, el impuesto queda cubierto por retenciones y no se ha informado saldo a favor por alquiler ni solicitud de devolución. Según SUNAT, en este escenario no debe presentar la DJ anual.'
    elif balance_label == 'SIN SALDO':
        filing_note = 'No se detecta deuda, saldo a favor ni otro supuesto de obligación incluido en esta simulación. Verifique la información personalizada y cualquier otro tipo de renta antes de concluir.'
    else:
        filing_note = 'No se detectó un supuesto específico de obligación en los datos importados. Revisar la información completa del contribuyente y las reglas del ejercicio.'
    return {
        'kind': kind, 'year': year, 'uit': uit, 'fourthOn': fourth_on, 'fifthOn': fifth_on, 'foreignOn': foreign_on,
        'proFourth': pro_fourth, 'otherFourth': other_fourth, 'fourthDeduction': fourth_deduction,
        'fourthNet': fourth_net, 'fifthSalary': fifth_salary, 'bonuses': bonuses, 'fifthGross': fifth_gross,
        'foreignNet': foreign_net, 'foreignTax': foreign_tax, 'basicDeduction': basic_deduction,
        'extraDeduction': extra_deduction, 'itfDeduction': itf_deduction, 'donationDeduction': donation_deduction,
        'taxable': taxable, 'annualTax': round(annual_tax, 2), 'withholding': fourth_withholding + fifth_withholding,
        'payments': payments, 'priorCredit': prior_credit, 'foreignCredit': round(foreign_credit, 2),
        'totalCredits': round(credits, 2), 'balance': round(balance, 2), 'balanceLabel': balance_label,
        'balanceAmount': round(balance_amount, 2), 'filingRequired': filing_required, 'calculationAvailable': True,
        'filingLabel': filing_label, 'filingReasons': reasons, 'filingNote': filing_note,
        'expenseDeductions': {'rent': rent_deduction, 'restaurants': restaurant_deduction, 'health': health_deduction,
                              'professional': professional_deduction, 'essalud': essalud_deduction},
        'caseName': row.get('taxpayer_name') or row.get('name') or 'Caso Excel'
    }


@app.route('/api/cases/bulk', methods=['POST'])
@login_required
def cases_bulk_api():
    """Guarda un bloque completo de casos Excel en una sola transacción."""
    data = request.get_json(silent=True) or {}
    items = data.get('cases')
    if not isinstance(items, list) or not items:
        return jsonify({'ok': False, 'error': 'No se recibieron casos para guardar.'}), 400
    if len(items) > 1000:
        return jsonify({'ok': False, 'error': 'El archivo supera el máximo de 1,000 casos por importación.'}), 413
    uid = session['user_id']
    stamp = datetime.now().strftime('%d/%m/%Y %H:%M')
    prepared = []
    try:
        for item in items:
            if not isinstance(item, dict):
                raise ValueError('Uno de los registros tiene un formato incorrecto.')
            payload = item.get('payload') or {}
            row = payload.get('excelRow')
            if isinstance(row, dict):
                calculation = _calculate_excel_liquidation(row)
                if not calculation.get('calculationAvailable', True):
                    raise ValueError(calculation.get('filingNote') or 'No hay UIT oficial para calcular este ejercicio.')
                payload.update(calculation)
                year = int(calculation['year'])
                tax = float(calculation['annualTax'])
                balance = float(calculation['balance'])
            else:
                year = int(item.get('year') or payload.get('year') or 2026)
                tax = float(item.get('annual_tax') if item.get('annual_tax') is not None else payload.get('annualTax') or 0)
                balance = float(item.get('balance') if item.get('balance') is not None else payload.get('balance') or 0)
            if year < 2000 or year > 2100 or not all(map(lambda x: abs(x) < 1e15, (tax, balance))):
                raise ValueError('Un ejercicio o importe está fuera de rango.')
            serialized = json.dumps(payload, ensure_ascii=False, allow_nan=False)
            prepared.append((
                uid,
                str(item.get('case_name') or payload.get('caseName') or 'Caso importado')[:180],
                year,
                str(item.get('category') or payload.get('kind') or 'Caso Excel')[:100],
                tax, balance, serialized, stamp
            ))
    except (TypeError, ValueError, OverflowError) as exc:
        return jsonify({'ok': False, 'error': f'No se guardó el bloque: {exc}'}), 400
    with db() as conn:
        cur = conn.executemany(
            'INSERT INTO cases(user_id,case_name,year,category,annual_tax,balance,payload,saved_at) VALUES(?,?,?,?,?,?,?,?)',
            prepared
        )
    return jsonify({'ok': True, 'saved': len(prepared), 'saved_at': stamp}), 201


@app.route('/api/classify-excel', methods=['POST'])
@login_required
def classify_excel():
    uploaded = request.files.get('file')
    if not uploaded or not uploaded.filename:
        return jsonify({'error': 'Selecciona un archivo Excel.'}), 400
    if not uploaded.filename.lower().endswith(('.xlsx', '.xlsm')):
        return jsonify({'error': 'Formato no compatible. Sube un archivo .xlsx o .xlsm.'}), 400
    raw = uploaded.read()
    if len(raw) > 10 * 1024 * 1024:
        return jsonify({'error': 'El archivo supera el límite de 10 MB.'}), 413

    def norm(value):
        return re.sub(r'[^a-z0-9]+', ' ', str(value or '').lower()
                      .replace('á','a').replace('é','e').replace('í','i')
                      .replace('ó','o').replace('ú','u').replace('ñ','n')).strip()

    def json_value(value):
        if value is None:
            return ''
        if isinstance(value, (str, int, float, bool)):
            return value
        if hasattr(value, 'isoformat'):
            return value.isoformat()
        return str(value)

    try:
        from openpyxl import load_workbook
        wb = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
        ws = wb[wb.sheetnames[0]]
        iterator = ws.iter_rows(values_only=True)
        headers = list(next(iterator, None) or [])
        if not headers:
            return jsonify({'error': 'La primera hoja está vacía.'}), 400
        names = [norm(h) for h in headers]

        def classify_col(name):
            # No confundir retenciones, deducciones, gastos o créditos con ingresos.
            if any(k in name for k in ['retencion', 'deduccion', 'pago', 'credito',
                                       'gasto', 'impuesto', 'saldo', 'elegible',
                                       'ruc', 'uit', 'periodo', 'declaracion']):
                return False, False, False
            fourth = any(k in name for k in ['honorario', 'otras rentas cuarta',
                                              'renta cuarta', 'renta de cuarta',
                                              'ingreso independiente', 'cuarta categoria'])
            fifth = any(k in name for k in ['sueldo', 'salario', 'remuneracion',
                                             'gratificacion', 'bonificacion', 'quinta categoria',
                                             'renta quinta', 'renta de quinta'])
            foreign = any(k in name for k in ['renta neta fuente extranjera',
                                               'renta extranjera', 'ingreso extranjero',
                                               'fuente extranjera', 'ingreso exterior',
                                               'renta exterior'])
            return fourth, fifth, foreign

        col_types = [classify_col(n) for n in names]
        case_idx = next((i for i,n in enumerate(names)
                         if n in ['id caso','caso','codigo caso','codigo']), None)
        taxpayer_idx = next((i for i,n in enumerate(names)
                             if ('nombre completo' in n or 'razon social' in n) and 'tipo' not in n), None)
        if case_idx is None:
            case_idx = taxpayer_idx

        rows = []
        counts = {'solo_cuarta':0,'solo_quinta':0,'solo_extranjera':0,'combinadas':0,
                  'sin_datos':0,'cuarta_quinta':0,'cuarta_extranjera':0,
                  'quinta_extranjera':0,'todas_tres':0}
        for rownum, values in enumerate(iterator, start=2):
            values = list(values or [])
            if not values or not any(v is not None and str(v).strip() for v in values):
                continue
            detected = []
            for i, (fourth, fifth, foreign) in enumerate(col_types):
                if i >= len(values):
                    continue
                try:
                    amount = float(values[i]) if values[i] is not None else 0
                except (TypeError, ValueError):
                    amount = 0
                if amount <= 0:
                    continue
                if fourth and '4.ª categoría' not in detected: detected.append('4.ª categoría')
                if fifth and '5.ª categoría' not in detected: detected.append('5.ª categoría')
                if foreign and 'Fuente extranjera' not in detected: detected.append('Fuente extranjera')

            if len(detected) == 1:
                key = {'4.ª categoría':'solo_cuarta','5.ª categoría':'solo_quinta',
                       'Fuente extranjera':'solo_extranjera'}[detected[0]]
            elif len(detected) > 1:
                key = 'combinadas'
            else:
                key = 'sin_datos'
            counts[key] += 1
            source_set = set(detected)
            combo_key = 'otro'
            if source_set == {'4.ª categoría','5.ª categoría'}:
                counts['cuarta_quinta'] += 1; combo_key = 'cuarta_quinta'
            elif source_set == {'4.ª categoría','Fuente extranjera'}:
                counts['cuarta_extranjera'] += 1; combo_key = 'cuarta_extranjera'
            elif source_set == {'5.ª categoría','Fuente extranjera'}:
                counts['quinta_extranjera'] += 1; combo_key = 'quinta_extranjera'
            elif len(source_set) == 3:
                counts['todas_tres'] += 1; combo_key = 'todas_tres'

            name = (str(values[case_idx]) if case_idx is not None and case_idx < len(values)
                    and values[case_idx] is not None else f'Fila {rownum}')
            route = {'solo_cuarta':'cuarta','solo_quinta':'quinta',
                     'solo_extranjera':'extranjera','combinadas':'mixta'}.get(key)
            label = {'solo_cuarta':'Solo renta de cuarta',
                     'solo_quinta':'Solo renta de quinta',
                     'solo_extranjera':'Solo fuente extranjera',
                     'combinadas':'Rentas combinadas',
                     'sin_datos':'Sin renta identificada'}[key]
            taxpayer_name = (str(values[taxpayer_idx]) if taxpayer_idx is not None
                             and taxpayer_idx < len(values) and values[taxpayer_idx] is not None else '')
            rows.append({'name':name, 'taxpayer_name':taxpayer_name, 'sources':detected, 'class_key':key,
                         'classification':label, 'route':route, 'combo_key':combo_key,
                         'row_number':rownum, 'headers':[str(h or '') for h in headers],
                         'values':[json_value(v) for v in values]})

        # Si existe hoja de detalle de gastos, asociarla por ID de caso.
        expense_map = {}
        if 'DETALLE_3UIT' in wb.sheetnames:
            exp_ws = wb['DETALLE_3UIT']
            exp_iter = exp_ws.iter_rows(values_only=True)
            exp_headers = [norm(h) for h in (next(exp_iter, None) or [])]
            for exp_row in exp_iter:
                vals = list(exp_row or [])
                if len(vals) < 6 or not vals[0]:
                    continue
                case_id = str(vals[0]).strip()
                kind = norm(vals[2] if len(vals) > 2 else '')
                try: paid = float(vals[5] or 0)
                except (TypeError, ValueError): paid = 0
                bucket = None
                if 'arrendamiento' in kind or 'subarrendamiento' in kind:
                    bucket = 'rentExpense'
                elif 'restaurante' in kind or 'hotel' in kind or 'bar' in kind:
                    bucket = 'restaurantExpense'
                elif 'medico' in kind or 'odontologo' in kind or 'salud' in kind:
                    bucket = 'healthExpense'
                elif 'essalud' in kind or 'trabajador del hogar' in kind:
                    bucket = 'essaludExpense'
                elif 'servicio' in kind or 'profesional' in kind or 'oficio' in kind:
                    bucket = 'professionalExpense'
                # Un tipo de gasto desconocido no se presume deducible.
                if bucket is None:
                    continue
                expense_map.setdefault(case_id, {'rentExpense':0,'restaurantExpense':0,
                    'healthExpense':0,'professionalExpense':0,'essaludExpense':0})
                expense_map[case_id][bucket] += paid

        for row in rows:
            vals = row['values']
            case_id = str(vals[0]).strip() if vals else ''
            row['expenses'] = expense_map.get(case_id, {'rentExpense':0,'restaurantExpense':0,
                'healthExpense':0,'professionalExpense':0,'essaludExpense':0})
            row['calculation'] = _calculate_excel_liquidation(row)

        wb.close()
        return jsonify({'ok':True,'sheet':ws.title,'headers':[str(h or '') for h in headers],
                        'total':len(rows),'counts':counts,'rows':rows})
    except Exception:
        return jsonify({'error':'No se pudo leer el Excel. Comprueba que no esté dañado y que la primera fila contenga encabezados.'}), 400





@app.route('/api/formulario-709', methods=['POST'])
@login_required
def formulario_709():
    """Genera una vista previa PDF sobre la plantilla reconstruida que aportó el usuario."""
    data = request.get_json(silent=True) or {}
    if isinstance(data.get('inputs'), dict):
        data = {**data, **data['inputs']}
    try:
        import fitz
        template_path = os.path.join(BASE_DIR, 'static', 'docs', 'formulario_709_plantilla.pdf')
        doc = fitz.open(template_path)
        kind = str(data.get('kind') or 'mixta')
        year = int(data.get('year') or 2026)
        uit = float(data.get('uit') or (5350 if year == 2025 else 5500))
        n = lambda k: max(0.0, float(data.get(k) or 0))
        gross4 = n('proFourth') or n('fourthGross')
        other4 = n('otherFourth') or n('fourthOther')
        ded4 = min(gross4 * .20, 24 * uit)
        net4 = max(0.0, gross4 - ded4)
        gross5 = n('fifthSalary') + n('gratifications') + n('bonuses')
        if not gross5: gross5 = n('salary') + n('fifth') + n('fifthGross')
        foreign = n('foreignNet') if 'foreignNet' in data else n('foreign')
        total4 = net4 + other4
        total_work = total4 + gross5
        ded7 = min(total_work, 7 * uit) if total_work > 0 else 0
        ded_extra = min(n('extraDeduction'), 3 * uit, max(0, total_work-ded7))
        itf = n('itfDeduction') if 'itfDeduction' in data else n('itf')
        donations = n('donationDeduction') if 'donationDeduction' in data else n('donations')
        taxable_work = max(0, total_work-ded7-ded_extra-itf-donations)
        taxable = taxable_work + foreign
        annual_tax = n('annualTax')
        if annual_tax == 0 and taxable > 0:
            bands=[(5*uit,.08),(15*uit,.14),(15*uit,.17),(10*uit,.20),(float('inf'),.30)]
            rem=taxable
            for limit, rate in bands:
                base=min(rem,limit); annual_tax += base*rate; rem-=base
                if rem<=0: break
        withholding = n('withholding') or n('withheld') or n('fourthCredits') + n('fifthCredits')
        payments = n('payments') or n('fourthPayments')
        prior = n('priorCredit')
        foreign_credit = n('foreignCredit')
        credits = withholding + payments + prior + foreign_credit
        balance = annual_tax-credits
        refund=max(0, credits-annual_tax)
        vals={
          # Primera y segunda categoría: sin importes si el caso es solo de trabajo.
          100:0,102:0,501:0,502:0,515:0,153:0,156:0,133:0,159:0,160:0,161:0,162:0,163:0,164:0,166:0,
          350:0,353:0,354:0,355:0,385:0,356:0,357:0,388:0,358:0,359:0,360:0,361:0,362:0,363:0,364:0,365:0,366:0,
          107:gross4,507:ded4,508:net4,108:other4,509:total4,111:gross5,510:total_work,
          511:ded7,514:ded_extra,512:taxable_work,522:itf,519:donations,513:taxable_work,
          116:foreign,517:taxable,120:annual_tax,122:foreign_credit,158:max(0,annual_tax-foreign_credit),
          125:prior,127:payments,128:0,130:withholding,131:0,141:refund,140:2 if refund>0 else 1,
          142:max(0,balance),144:0,145:0,146:max(0,balance),168:max(0,balance)
        }
        deduction_codes={502,156,133,353,355,388,358,359,363,507,511,514,522,519,122,125,127,128,130,131,144}
        # Reemplaza solo la columna de importes, manteniendo textos, líneas y numeración de la plantilla.
        for page_index, page in enumerate(doc):
            words=page.get_text('words')
            page_codes = [100,102,501,502,515,153,156,133,159,160,161,162,163,164,166,350,353,354,355,385,356,357,388,358,359,360,361,362,363,364,365,366] if page_index==0 else [107,507,508,108,509,111,510,511,514,512,522,519,513,116,517,120,122,158,125,127,128,130,131,141,140,142,144,145,146,168]
            for code in page_codes:
                candidates=[w for w in words if w[4]==str(code) and 450 <= w[0] <= 480]
                if not candidates: continue
                w=candidates[0]
                y=(w[1]+w[3])/2
                # Blanco solo en el importe preimpreso de esa fila.
                rect=fitz.Rect(526, y-6.2, 563, y+5.5)
                page.draw_rect(rect, color=None, fill=(1,1,1), overlay=True)
                value=float(vals.get(code,0) or 0)
                if code in deduction_codes and value>0:
                    text=f'({value:,.0f})'
                else:
                    text=f'{value:,.0f}'
                page.insert_text((558-len(text)*4.4, y+3.0), text, fontsize=8.3, fontname='helv', color=(0,0,0), overlay=True)
            # Borra datos personales ficticios de la reconstrucción; la aplicación no debe conservarlos.
            if page_index==0:
                # Limpia únicamente el contenido de cada celda de datos; conserva bordes y separadores.
                cell_masks = [
                    fitz.Rect(256, 70, 375, 85),   # RUC
                    fitz.Rect(256, 88, 375, 111),  # Razón social / nombre
                    fitz.Rect(496, 88, 554, 111),  # Periodo
                    fitz.Rect(256, 113, 375, 133), # Número de orden (sin dato oficial)
                    fitz.Rect(496, 113, 554, 133), # Fecha de presentación (sin dato oficial)
                    fitz.Rect(256, 136, 375, 152), # Tipo de declaración
                    fitz.Rect(496, 136, 554, 152)  # Tipo de moneda
                ]
                for rect in cell_masks:
                    page.draw_rect(rect, color=None, fill=(1,1,1), overlay=True)
                taxpayer_name = str(data.get('taxpayerName') or data.get('razonSocial') or data.get('caseName') or '')[:90]
                taxpayer_ruc = str(data.get('taxpayerRuc') or data.get('ruc') or '')[:11]
                declaration_type = str(data.get('declarationType') or 'ORIGINAL').upper()[:20]
                period = str(data.get('taxPeriod') or f'{year}13')[:6]
                # Los datos se escriben dentro de sus respectivas celdas, con ajuste automático.
                page.insert_text((260,82), taxpayer_ruc, fontsize=8.0, fontname='helv', color=(0,0,0), overlay=True)
                page.insert_textbox(fitz.Rect(260, 89, 372, 110), taxpayer_name, fontsize=7.0, fontname='helv', color=(0,0,0), lineheight=1.05, overlay=True)
                page.insert_textbox(fitz.Rect(500, 92, 551, 107), period, fontsize=8.0, fontname='helv', color=(0,0,0), overlay=True)
                page.insert_text((260,148), declaration_type, fontsize=7.8, fontname='helv', color=(0,0,0), overlay=True)
                page.insert_text((500,148), 'SOLES', fontsize=8.0, fontname='helv', color=(0,0,0), overlay=True)
        out=doc.tobytes(deflate=True)
        doc.close()
        from flask import send_file
        return send_file(io.BytesIO(out), mimetype='application/pdf', as_attachment=False, download_name=f'vista_previa_formulario_709_{year}.pdf')
    except Exception as exc:
        app.logger.exception('Error al generar vista previa del Formulario 709')
        return jsonify({'error':'No se pudo generar la vista previa del Formulario 709. Revisa que la plantilla PDF esté disponible.'}), 500


@app.get('/health')
def health():
    return {'status': 'ok'}

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)), debug=False)
