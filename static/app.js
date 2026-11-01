(() => {
  const $ = (id) => document.getElementById(id);
  const OFFICIAL_UIT_REFERENCE = {2023:4950, 2024:5150, 2025:5350, 2026:5500};
  const pages = ['inicio','calculo','cuarta','quinta','extranjera','mixta','excel','caso','liquidacion','investiga','historial','creditos'];
  let currentPage = 'inicio';
  let activeRoute = 'mixta';
  let lastCalculation = null;
  let editingCaseId = null;
  let historyFilter = 'all';
  let toastTimer;
  let excelAnalysis = null;
  let excelFilter = 'all';
  let excelCurrentCase = null;
  let excelBatchId = null;
  let excelBatchSaved = false;
  let pendingExcelRow = null;
  let pendingExcelBatchId = null;

  function showToast(message) {
    const el = $('toast'); el.textContent = message; el.classList.add('show');
    el.setAttribute('role','alert');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 4200);
  }
  function navigate(page, push = true) {
    if (!pages.includes(page)) page = 'inicio';
    currentPage = page;
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === `page-${page}`));
    document.querySelectorAll('.nav-link, .nav-sublink').forEach(b => b.classList.toggle('active', b.dataset.page === page));
    document.querySelectorAll('.nav-group').forEach(g => g.classList.toggle('has-active', !!g.querySelector('.nav-sublink.active')));
    if (push) history.pushState({page}, '', `#${page}`);
    window.scrollTo({top:0, behavior:'smooth'});
    if (page === 'historial') renderHistory();
    if (page === 'inicio') renderHomeDashboard();
  }
  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-page]');
    if (nav) {
      e.preventDefault();
      if (['cuarta','quinta','extranjera','mixta'].includes(nav.dataset.page)) { activeRoute = nav.dataset.page; updateRouteResources(); }
      navigate(nav.dataset.page);
      return;
    }
    const route = e.target.closest('[data-route]');
    if (route) { activeRoute = route.dataset.route; updateRouteResources(); navigate(activeRoute); return; }
    const start = e.target.closest('[data-start-route]');
    if (start) {
      activeRoute = start.dataset.startRoute;
      if (activeRoute === 'cuarta') { $('hasFourth').checked = true; $('hasFifth').checked = false; $('hasForeign').checked = false; }
      if (activeRoute === 'quinta') { $('hasFourth').checked = false; $('hasFifth').checked = true; $('hasForeign').checked = false; }
      if (activeRoute === 'extranjera') { $('hasFourth').checked = false; $('hasFifth').checked = false; $('hasForeign').checked = true; }
      if (activeRoute === 'mixta') { $('hasFourth').checked = true; $('hasFifth').checked = true; $('hasForeign').checked = true; }
      updateSources(); navigate('caso'); return;
    }
  });
  const rentNavToggle = $('rentNavToggle');
  rentNavToggle?.addEventListener('click', () => { const submenu=$('rentSubmenu'); const open=submenu.classList.toggle('open'); rentNavToggle.setAttribute('aria-expanded',String(open)); rentNavToggle.classList.toggle('expanded',open); });
  document.addEventListener('click', e => { const reveal=e.target.closest('[data-reveal]'); if(reveal){const target=$(reveal.dataset.reveal); const open=target.classList.toggle('hidden')===false; reveal.setAttribute('aria-expanded',String(open)); reveal.textContent=open?'Ocultar ejemplos −':'Ver cuáles son +';} });
  window.addEventListener('popstate', (e) => navigate((e.state && e.state.page) || location.hash.slice(1) || 'inicio', false));
  if (location.hash) navigate(location.hash.slice(1), false);


  function updateRouteResources() {
    const config = {
      cuarta: {title:'Apoyo · Renta de cuarta categoría',desc:'Refuerza recibos por honorarios, deducción legal, retenciones y pagos a cuenta de servicios independientes.',video:'https://www.youtube.com/results?search_query=SUNAT+renta+de+cuarta+categor%C3%ADa+explicacion+corta+calculo+deduccion',sunat:'https://personas.sunat.gob.pe/trabajador-independiente'},
      quinta: {title:'Apoyo · Renta de quinta categoría',desc:'Repasa remuneraciones, gratificaciones, proyección anual, retenciones del empleador y regularización.',video:'https://www.youtube.com/results?search_query=SUNAT+renta+de+quinta+categor%C3%ADa+explicacion+corta+calculo+retenciones',sunat:'https://personas.sunat.gob.pe/trabajador-dependiente'},
      extranjera: {title:'Apoyo · Renta de fuente extranjera',desc:'Revisa la naturaleza de la renta, su conversión, integración anual y las condiciones para un posible crédito por impuesto pagado en el exterior.',video:'https://www.youtube.com/results?search_query=renta+de+fuente+extranjera+personas+naturales+Peru+explicacion+corta',sunat:'https://www.sunat.gob.pe/legislacion/renta/ley/fdetalle.htm'},
      mixta: {title:'Apoyo · Caso integral mixto',desc:'Sigue un caso que integra rentas de cuarta, quinta y fuente extranjera. Contrasta los supuestos y no dupliques importes.',video:'https://www.youtube.com/results?search_query=declaracion+anual+personas+naturales+Peru+rentas+de+trabajo+caso+practico',sunat:'https://www.sunat.gob.pe/'}
    };
    const c=config[activeRoute]||config.mixta;
    if ($('routeResourceTitle')) $('routeResourceTitle').textContent=c.title; if ($('routeResourceDescription')) $('routeResourceDescription').textContent=c.desc; if ($('routeVideoLink')) $('routeVideoLink').href=c.video; if ($('routeSunatLink')) $('routeSunatLink').href=c.sunat;
  }

  function updateSources() {
    $('fourthFields').classList.toggle('hidden', !$('hasFourth').checked);
    $('fifthFields').classList.toggle('hidden', !$('hasFifth').checked);
    $('foreignFields').classList.toggle('hidden', !$('hasForeign').checked);
  }
  ['hasFourth','hasFifth','hasForeign'].forEach(id => $(id).addEventListener('change', updateSources));
  function val(id) { return Math.max(0, Number($(id).value) || 0); }
  function money(n) { return new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN',minimumFractionDigits:2}).format(Number.isFinite(n)?n:0); }
  function progressiveTax(amount, uit) {
    let remaining = Math.max(0, amount), tax = 0;
    const bands = [{limit:5*uit,rate:.08},{limit:15*uit,rate:.14},{limit:15*uit,rate:.17},{limit:10*uit,rate:.20},{limit:Infinity,rate:.30}];
    for (const band of bands) { const portion = Math.min(remaining, band.limit); tax += portion * band.rate; remaining -= portion; if (remaining <= 0) break; }
    return tax;
  }
  function calculate() {
    const year = Number($('year').value), uit = uitForExercise(year);
    const fourthOn = $('hasFourth').checked, fifthOn = $('hasFifth').checked, foreignOn = $('hasForeign').checked;
    const fourthGross = fourthOn ? val('fourthGross') + val('fourthOther') : 0;
    const fourthDeduction = Math.min(fourthGross * .20, 24 * uit);
    const fourthNet = Math.max(0, fourthGross - fourthDeduction);
    const fifthGross = fifthOn ? val('fifthGross') : 0;
    const foreignNet = foreignOn ? val('foreignNet') : 0;
    const workNet = fourthNet + fifthGross + foreignNet;
    const basicDeduction = workNet > 0 ? 7 * uit : 0;
    const extraDeduction = Math.min(val('extraDeduction'), 3 * uit);
    const taxable = Math.max(0, workNet - basicDeduction - extraDeduction);
    const annualTax = progressiveTax(taxable, uit);
    const fourthCredits = fourthOn ? val('fourthWithheld') + val('fourthPayments') : 0;
    const fifthCredits = fifthOn ? val('fifthWithheld') : 0;
    const foreignCredit = foreignOn ? Math.min(val('foreignTax'), annualTax) : 0;
    const otherCredits = val('otherCredits');
    const totalCredits = fourthCredits + fifthCredits + foreignCredit + otherCredits;
    const balance = annualTax - totalCredits;
    const kind=[fourthOn,fifthOn,foreignOn].filter(Boolean).length>1?'mixta':fourthOn?'cuarta':fifthOn?'quinta':'extranjera';
    const sourceInputs=Object.fromEntries(['caseName','year','activity','domicile','fourthGross','fourthOther','fifthGross','foreignNet','extraDeduction','fourthWithheld','fourthPayments','fifthWithheld','foreignTax','otherCredits','caseNotes'].map(id=>[id,$(id)?.value??'']));
    const result = {kind,year,uit,caseName:$('caseName').value.trim() || 'Caso sin título',activity:$('activity').value.trim(),domicile:$('domicile').value,fourthOn,fifthOn,foreignOn,fourthGross,fourthDeduction,fourthNet,fifthGross,foreignNet,workNet,basicDeduction,extraDeduction,taxable,annualTax,fourthCredits,fifthCredits,foreignCredit,otherCredits,totalCredits,balance,notes:$('caseNotes').value,inputs:sourceInputs};
    lastCalculation = result; renderResult(result); if ($('heroTax')) $('heroTax').textContent = money(annualTax); return result;
  }
  function renderResult(r) {
    $('emptyResult').classList.add('hidden'); $('resultContent').classList.remove('hidden');
    $('resultName').textContent = r.caseName; $('resultMeta').textContent = `Ejercicio ${r.year} · ${r.domicile === 'domiciled' ? 'Persona domiciliada en Perú' : 'No domiciliado · revisar reglas específicas'}`;
    $('metricWork').textContent = money(r.workNet); $('metricTaxable').textContent = money(r.taxable); $('metricTax').textContent = money(r.annualTax); $('metricBalance').textContent = money(Math.abs(r.balance));
    $('balanceLabel').textContent = r.balance > .005 ? 'Saldo estimado por regularizar' : r.balance < -.005 ? 'Posible saldo a favor' : 'Sin saldo estimado';
    const rows = [
      ['section','A. DETERMINACIÓN DE RENTAS'],['Renta bruta de cuarta categoría',r.fourthGross],['(-) Deducción referencial 20% de cuarta',-r.fourthDeduction],['Renta neta de cuarta categoría',r.fourthNet],['Renta bruta de quinta categoría',r.fifthGross],['Renta neta computable de fuente extranjera',r.foreignNet],['Renta neta combinada antes de deducciones',r.workNet],['section','B. DEDUCCIONES'],['(-) Deducción legal de 7 UIT',-r.basicDeduction],['(-) Deducción adicional ingresada (máx. 3 UIT)',-r.extraDeduction],['total','RENTA IMPONIBLE ESTIMADA',r.taxable],['section','C. LIQUIDACIÓN DEL IMPUESTO'],['Impuesto anual por escala progresiva',r.annualTax],['(-) Retenciones y pagos a cuenta de cuarta',-r.fourthCredits],['(-) Retenciones de quinta categoría',-r.fifthCredits],['(-) Crédito extranjero referencial',-r.foreignCredit],['(-) Otros créditos / saldo a favor',-r.otherCredits],['total',r.balance > .005 ? 'IMPUESTO ESTIMADO POR REGULARIZAR' : r.balance < -.005 ? 'POSIBLE SALDO A FAVOR' : 'SALDO ESTIMADO',Math.abs(r.balance)]
    ];
    $('calcRows').innerHTML = rows.map(row => {
      if (row[0] === 'section') return `<tr class="section-row"><td colspan="2">${row[1]}</td></tr>`;
      const cls = row[0] === 'total' ? ' class="total-row"' : '';
      return `<tr${cls}><td>${row[0] === 'total' ? row[1] : row[0]}</td><td>${money(row[2])}</td></tr>`;
    }).join('');
    const steps = [
      ['1','Renta de cuarta','Se toma el ingreso bruto declarado y se resta una deducción referencial del 20%, limitada a 24 UIT, cuando corresponda. Resultado: '+money(r.fourthNet)+'.'],
      ['2','Integración de ingresos','Se suman la renta neta de cuarta, la renta de quinta y la fuente extranjera registrada. Total: '+money(r.workNet)+'.'],
      ['3','Deducciones','Se resta la deducción base de 7 UIT y la deducción adicional indicada, limitada en esta simulación a 3 UIT.'],
      ['4','Escala progresiva','Se calcula por tramos acumulativos sobre la renta imponible estimada. Impuesto: '+money(r.annualTax)+'.'],
      ['5','Regularización','Se restan retenciones, pagos a cuenta y créditos ingresados. Saldo neto: '+money(r.balance)+'.']
    ];
    $('calculationSteps').innerHTML = steps.map(s => `<div class="calc-step"><span class="step-no">${s[0]}</span><div><b>${s[1]}</b><p>${s[2]}</p></div></div>`).join('');
    let interp = r.balance > .005 ? `Con los importes registrados, la simulación arroja un saldo por regularizar de ${money(r.balance)}. Comprueba que las retenciones y pagos a cuenta estén completos y sustentados.` : r.balance < -.005 ? `Los créditos y pagos registrados superan el impuesto estimado en ${money(Math.abs(r.balance))}. Esto podría indicar un saldo a favor, sujeto a las reglas y validaciones del ejercicio.` : 'Con los importes ingresados, el impuesto anual estimado coincide con los créditos y pagos registrados.';
    if (r.domicile === 'nondomiciled') interp += ' El caso de no domiciliados requiere un análisis separado; esta hoja no debe usarse como determinación definitiva.';
    if (r.foreignOn) interp += ' La renta extranjera y el crédito por impuesto pagado fuera del país deben validarse según su naturaleza, documentación y límites legales.';
    $('resultInterpretation').textContent = interp;
  }
  $('taxForm')?.addEventListener('submit', e => { e.preventDefault(); if (!$('hasFourth').checked && !$('hasFifth').checked && !$('hasForeign').checked) { showToast('Selecciona al menos una fuente de renta.'); return; } const r=calculate(); navigate('liquidacion'); showToast('Liquidación académica generada. Revisa el detalle.'); });
  $('printResult')?.addEventListener('click', () => window.print());
  let serverCases = [];
  async function fetchSaved() {
    try {
      const response=await fetch('/api/cases',{headers:{'Accept':'application/json'},cache:'no-store'});
      if(response.redirected || response.status===401){showToast('Tu sesión ha caducado. Vuelve a iniciar sesión.');window.location.href='/acceso';serverCases=[];return serverCases;}
      if(!response.ok) throw new Error(`Error ${response.status} al consultar el historial.`);
      const data=await response.json(); if(!Array.isArray(data)) throw new Error('El servidor devolvió un historial no válido.');
      serverCases=data;
    } catch(err) { showToast(err.message||'No se pudo conectar con el historial.'); serverCases=[]; }
    return serverCases;
  }
  async function renderHomeDashboard() {
    const cases=await fetchSaved();
    const counts={cuarta:0,quinta:0,extranjera:0,mixta:0};
    cases.forEach(item=>{
      const p=item.payload||{};
      let k=p.kind||([p.fourthOn,p.fifthOn,p.foreignOn].filter(Boolean).length>1?'mixta':p.fourthOn?'cuarta':p.fifthOn?'quinta':p.foreignOn?'extranjera':'');
      if(!k && String(item.category).includes('+')) k='mixta';
      if(counts[k]!==undefined) counts[k]++;
    });
    const total=cases.length, max=Math.max(1,...Object.values(counts));
    const put=(id,v)=>{const el=$(id);if(el)el.textContent=String(v);};
    put('homeTotalCases',total); put('homeDonutTotal',total);
    put('homeFourthCases',counts.cuarta); put('homeFifthCases',counts.quinta); put('homeForeignCases',counts.extranjera);
    put('homeLegendFourth',counts.cuarta); put('homeLegendFifth',counts.quinta); put('homeLegendForeign',counts.extranjera); put('homeLegendMixed',counts.mixta);
    [['Fourth','cuarta'],['Fifth','quinta'],['Foreign','extranjera'],['Mixed','mixta']].forEach(([suffix,key])=>{
      put(`homeBar${suffix}Count`,counts[key]);
      const bar=$(`homeBar${suffix}`); if(bar)bar.style.width=`${counts[key]/max*100}%`;
    });
    const donut=$('homeDonut');
    if(donut){
      const vals=Object.values(counts),sum=vals.reduce((a,b)=>a+b,0)||1;
      const a=vals[0]/sum*100,b=a+vals[1]/sum*100,c=b+vals[2]/sum*100;
      donut.style.background=`conic-gradient(#9b4963 0 ${a}%,#315f7a ${a}% ${b}%,#5b9da3 ${b}% ${c}%,#d7a4b2 ${c}% 100%)`;
    }
  }
  async function saveCase() {
    if (!lastCalculation) { showToast('Primero calcula un caso.'); return; }
    const category = [lastCalculation.fourthOn?'4.ª categoría':'',lastCalculation.fifthOn?'5.ª categoría':'',lastCalculation.foreignOn?'Fuente extranjera':''].filter(Boolean).join(' + ') || activeRoute;
    try {
      const savedPayload={...lastCalculation}; if(pendingExcelRow){savedPayload.excelRow=pendingExcelRow;savedPayload.excelBatchId=pendingExcelBatchId||null;} const body={case_name:lastCalculation.caseName,year:lastCalculation.year,category,annual_tax:lastCalculation.annualTax,balance:lastCalculation.balance,payload:savedPayload};
      const wasEditing=Boolean(editingCaseId); if(wasEditing)body.id=editingCaseId;
      const response = await fetch('/api/cases', {method:wasEditing?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      if (!response.ok) { let msg='No se pudo guardar el caso.'; try { const err=await response.json(); msg=err.error||msg; } catch {} throw new Error(msg); }
      editingCaseId=null; pendingExcelRow=null; pendingExcelBatchId=null; showToast(wasEditing?'Caso actualizado en tu cuenta.':'Caso guardado en tu cuenta.'); if (currentPage === 'historial') renderHistory();
    } catch (err) { showToast(err.message || 'No se pudo guardar el caso. Intenta de nuevo.'); }
  }
  $('saveCase')?.addEventListener('click',saveCase);
  async function renderHistory() {
    const holder=$('historyList'); if(!holder)return; const arr=await fetchSaved();
    if (!arr.length) {
      holder.innerHTML='<div class="empty-state compact"><img class="history-empty-art" src="/static/img/portada_rentas.png" alt="Ilustración de análisis de rentas"><div class="empty-icon">◷</div><h3>Aún no tienes casos guardados</h3><p>Cuando calcules una renta, aparecerá aquí con opciones para editarla y revisar su Formulario 709.</p><button class="btn btn-primary" data-page="calculo">Elegir tipo de renta</button></div>';
      return;
    }
    const grouped=[
      ['cuarta','Renta de cuarta categoría','casos de honorarios y servicios independientes'],
      ['quinta','Renta de quinta categoría','casos de remuneraciones y retenciones'],
      ['extranjera','Renta de fuente extranjera','casos con rentas obtenidas fuera del país'],
      ['mixta','Casos mixtos','casos que integran varias fuentes de renta']
    ];
    const filtered=historyFilter==='all'?arr:arr.filter(x=>{
      const p=x.payload||{}, k=p.kind||([p.fourthOn,p.fifthOn,p.foreignOn].filter(Boolean).length>1?'mixta':p.fourthOn?'cuarta':p.fifthOn?'quinta':p.foreignOn?'extranjera':'');
      if(historyFilter==='mixta')return k==='mixta'||String(x.category).includes('+');
      return k===historyFilter;
    });
    holder.innerHTML=`
      <div class="history-filterbar">${grouped.map(([key,label,desc])=>`<button type="button" class="history-filter-btn ${historyFilter===key?'active':''}" data-history-filter="${key}"><b>${label}</b><small>${desc}</small></button>`).join('')}<button type="button" class="history-filter-btn ${historyFilter==='all'?'active':''}" data-history-filter="all"><b>Todos los casos</b><small>Ver el historial completo</small></button></div>
      <div class="history-group-intro"><h3>${historyFilter==='all'?'Todos tus casos':(grouped.find(x=>x[0]===historyFilter)||[])[1]||'Casos guardados'}</h3><p>${filtered.length} caso(s) en esta vista. Puedes editar sus datos o abrir el Formulario 709.</p></div>
      <div class="excel-batch-list"><h3>Bloques importados desde Excel</h3>${[...new Set(arr.map(x=>x.payload?.excelBatchId).filter(Boolean))].map(id=>`<div class="excel-batch-row"><span>Archivo Excel · ${arr.filter(x=>x.payload?.excelBatchId===id).length} caso(s)</span><button class="small-btn danger" data-delete-batch="${escapeHtml(id)}">Eliminar este bloque</button></div>`).join('')||'<p class="small-note">Aún no hay bloques de Excel guardados.</p>'}</div>
      ${filtered.length?filtered.map(item=>{const p=item.payload||{};const bal=Number(p.balance??item.balance??0);const label=p.balanceLabel||(bal>0.005?'A FAVOR DEL FISCO':bal<-.005?'A FAVOR DEL CONTRIBUYENTE':'SIN SALDO');const amount=Number(p.balanceAmount??Math.abs(bal));const filing=p.filingLabel||(p.filingRequired?'OBLIGADO A PRESENTAR FV 709':'Resultado pendiente de verificar');const outcome=label==='SIN SALDO'?'Sin saldo tributario':label==='PENDIENTE UIT OFICIAL'?'Pendiente: UIT oficial no publicada':`${label}: ${money(amount)}`;return `<div class="history-item" data-history-item="${item.id}"><div class="history-item-main"><h3>${escapeHtml(item.case_name)}</h3><p>${escapeHtml(item.saved_at)} · Ejercicio ${item.year} · ${escapeHtml(item.category)}</p><b>${escapeHtml(outcome)}</b><small class="excel-row-taxpayer">Impuesto anual: ${money(item.annual_tax)} · ${escapeHtml(filing)}</small><small class="excel-row-taxpayer">${escapeHtml((p.filingReasons||[]).join('; ')||p.filingNote||'')}</small></div><div class="history-actions"><button class="small-btn" data-edit-case="${item.id}">Editar caso</button><button class="small-btn" data-delete-case="${item.id}">Eliminar</button></div></div>`;}).join(''):'<div class="empty-state compact"><img class="history-empty-art" src="/static/img/portada_rentas.png" alt="Ilustración de análisis de rentas"><h3>No hay casos en esta categoría</h3><p>Esta vista está vacía por ahora. Cuando guardes una renta de este tipo aparecerá aquí para editarla y consultar su Formulario 709.</p><button class="btn btn-outline" data-history-filter="all">Ver todos los casos</button></div>'}`;
    holder.querySelectorAll('[data-edit-case]').forEach(b=>b.addEventListener('click',()=>{
      const item=serverCases.find(x=>x.id===Number(b.dataset.editCase)); if(!item)return;
      const payload=item.payload||{}, kind=payload.kind;
      if(payload.excelRow){
        excelAnalysis={rows:[payload.excelRow],total:1,sheet:'Historial',counts:{}};
        excelFilter='all'; excelCurrentCase=null; excelBatchId=payload.excelBatchId||null; editingCaseId=item.id;
        navigate('excel'); openExcelCase(0);
        showToast('Caso de Excel cargado. Edita sus datos y genera la liquidación para actualizar este registro.');
        return;
      }
      const form=document.querySelector(`.category-calc-form[data-calc="${kind}"]`);
      const inputs=payload.inputs||{};
      if(form){
        form.querySelectorAll('[name]').forEach(el=>{if(Object.prototype.hasOwnProperty.call(inputs,el.name))el.value=inputs[el.name];});
        editingCaseId=item.id; activeRoute=kind; updateRouteResources(); navigate(kind);
        showToast('Caso cargado para edición. Modifica los datos y vuelve a calcular para actualizar el mismo registro.');
        form.scrollIntoView({behavior:'smooth',block:'start'}); return;
      }
      const builder=$('taxForm');
      if(payload.fourthOn!==undefined && builder){
        Object.entries(inputs).forEach(([key,value])=>{const el=$(key);if(el)el.value=value;});
        $('hasFourth').checked=!!payload.fourthOn; $('hasFifth').checked=!!payload.fifthOn; $('hasForeign').checked=!!payload.foreignOn;
        updateSources(); editingCaseId=item.id; navigate('caso');
        showToast('Caso manual cargado. Modifica los campos y vuelve a calcular para actualizarlo.');
        builder.scrollIntoView({behavior:'smooth',block:'start'}); return;
      }
      showToast('Este registro no contiene datos editables de una calculadora.');
    }));
    holder.querySelectorAll('[data-delete-batch]').forEach(b=>b.addEventListener('click',async()=>{
      if(!confirm('¿Eliminar únicamente todos los casos de este bloque de Excel? Los demás bloques y casos manuales se conservarán.'))return;
      const response=await fetch('/api/cases?batch_id='+encodeURIComponent(b.dataset.deleteBatch),{method:'DELETE'});
      if(!response.ok){showToast('No se pudo eliminar el bloque de Excel.');return;}
      await renderHistory(); showToast('Se eliminó únicamente ese bloque de Excel.');
    }));
    holder.querySelectorAll('[data-delete-case]').forEach(b=>b.addEventListener('click',async()=>{
      if(!confirm('¿Eliminar este caso del historial?'))return;
      const response=await fetch('/api/cases?id='+encodeURIComponent(b.dataset.deleteCase),{method:'DELETE'});
      if(!response.ok){showToast('No se pudo eliminar el caso.');return;}
      renderHistory();showToast('Caso eliminado de tu cuenta.');
    }));
    holder.querySelectorAll('[data-history-filter]').forEach(b=>b.addEventListener('click',()=>{historyFilter=b.dataset.historyFilter;renderHistory();}));
  }
  function escapeHtml(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  $('clearHistory')?.addEventListener('click',async()=>{if(confirm('¿Eliminar todos los casos guardados de tu cuenta?')){await fetch('/api/cases',{method:'DELETE'});renderHistory();showToast('Tu historial fue limpiado.');}});
  $('checkQuiz')?.addEventListener('click',()=>{const selected=document.querySelector('input[name="q1"]:checked');const f=$('quizFeedback');if(!selected){f.textContent='Selecciona una opción primero.';return;}f.textContent=selected.value==='b'?'¡Correcto! Clasificar los ingresos y verificar las reglas del ejercicio evita aplicar una tasa o deducción incorrecta.':'Vuelve a intentarlo. Primero se clasifica cada ingreso y se revisa la norma aplicable; después se calcula.';f.style.color=selected.value==='b'?'#26715e':'var(--wine)';});
  $('quickSearch')?.addEventListener('keydown',e=>{if(e.key==='Enter'){const q=e.target.value.toLowerCase();if(!q.trim())return;if(q.includes('cuarta')||q.includes('honorario')){navigate('calculo');}else if(q.includes('quinta')||q.includes('remuner')){navigate('calculo');}else if(q.includes('extranj')){navigate('calculo');}else if(q.includes('mixt')){navigate('calculo');}else{navigate('investiga');showToast('Consulta los conceptos y recursos de aprendizaje.');}}});
  const accountToggle = $('accountToggle');
  const accountMenu = $('accountDropdown');
  if (accountToggle && accountMenu) {
    accountToggle.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      const isOpen=accountMenu.classList.toggle('open');
      accountToggle.setAttribute('aria-expanded',String(isOpen));
    });
    document.addEventListener('click',event=>{
      if(!event.target.closest('.account-menu')){
        accountMenu.classList.remove('open');
        accountToggle.setAttribute('aria-expanded','false');
      }
    });
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'){
        accountMenu.classList.remove('open');
        accountToggle.setAttribute('aria-expanded','false');
      }
    });
  }

  const excelForm=$('excelUploadForm');
  function renderExcelRows() {
    if (!excelAnalysis) return;
    const rows = excelAnalysis.rows.filter(r => {
      if (excelFilter === 'all') return true;
      if (['cuarta_quinta','cuarta_extranjera','quinta_extranjera','todas_tres'].includes(excelFilter)) return r.combo_key === excelFilter;
      return r.class_key === excelFilter;
    });
    const filterNames={all:'Todos los casos',solo_cuarta:'Solo renta de cuarta categoría',solo_quinta:'Solo renta de quinta categoría',solo_extranjera:'Solo renta de fuente extranjera',combinadas:'Casos de rentas combinadas',cuarta_quinta:'Casos de cuarta + quinta',cuarta_extranjera:'Casos de cuarta + fuente extranjera',quinta_extranjera:'Casos de quinta + fuente extranjera',todas_tres:'Casos con las tres fuentes'};
    $('excelResultTitle').textContent=`${filterNames[excelFilter]||'Casos filtrados'} · ${rows.length} caso(s)`;
    $('excelRows').innerHTML = rows.map(r => {
      const idx = excelAnalysis.rows.indexOf(r);
      const calc=r.calculation||{};
      const resultText=calc.calculationAvailable===false?'Pendiente: UIT no publicada':calc.balanceLabel==='A FAVOR DEL FISCO'?`A favor del fisco: ${money(calc.balanceAmount)}`:calc.balanceLabel==='A FAVOR DEL CONTRIBUYENTE'?`A favor del contribuyente: ${money(calc.balanceAmount)}`:'Sin saldo';
      const filingText=calc.calculationAvailable===false?'No evaluable todavía':calc.filingRequired===null?(calc.filingLabel||'Proyección: verificar al cierre'):calc.filingRequired?'Debe presentar FV 709':'No obligado (supuestos evaluados)';
      const filingReason=(calc.filingReasons||[]).join('; ')||calc.filingNote||'';
      return `<tr><td>${esc(r.name)}${r.taxpayer_name?`<small class="excel-row-taxpayer">${esc(r.taxpayer_name)}</small>`:''}</td><td>${esc((r.sources||[]).join(' + ')||'Sin renta identificada')}</td><td><span class="class-pill ${r.class_key==='sin_datos'?'muted-pill':''}">${esc(r.classification)}</span></td><td><strong>${esc(resultText)}</strong><small class="excel-row-taxpayer">${esc(filingText)}</small><small class="excel-row-taxpayer">${esc(filingReason)}</small></td><td><button type="button" class="small-btn" data-excel-open="${idx}">Ver / editar</button></td></tr>`;
    }).join('') || '<tr><td colspan="5">No hay casos en este filtro.</td></tr>';
    document.querySelectorAll('[data-excel-filter]').forEach(b => {
      b.classList.toggle('selected', b.dataset.excelFilter === excelFilter);
      b.setAttribute('aria-pressed', String(b.dataset.excelFilter === excelFilter));
    });
  }
  function renderExcelSummary(counts) {
    const cards = [
      ['solo_cuarta','Solo 4.ª',counts.solo_cuarta,'4.ª categoría'],
      ['solo_quinta','Solo 5.ª',counts.solo_quinta,'5.ª categoría'],
      ['solo_extranjera','Solo exterior',counts.solo_extranjera,'Fuente extranjera'],
      ['combinadas','Combinadas',counts.combinadas,'Dos o más fuentes']
    ];
    $('excelSummary').innerHTML = cards.map(([key,label,count,desc]) =>
      `<button type="button" class="excel-filter-card" data-excel-filter="${key}" aria-pressed="${excelFilter===key}"><b>${count}</b><span>${label}</span><small>${desc}</small></button>`
    ).join('');
    const combos = [
      ['cuarta_quinta','4.ª + 5.ª',counts.cuarta_quinta],
      ['cuarta_extranjera','4.ª + fuente extranjera',counts.cuarta_extranjera],
      ['quinta_extranjera','5.ª + fuente extranjera',counts.quinta_extranjera],
      ['todas_tres','4.ª + 5.ª + fuente extranjera',counts.todas_tres]
    ];
    $('excelCombinationSummary').innerHTML = `<h3>Detalle de combinaciones encontradas</h3><div class="excel-combo-buttons">${combos.map(([key,label,count])=>`<button type="button" data-excel-filter="${key}" class="excel-combo-filter" aria-pressed="${excelFilter===key}"><span>${label}</span><b>${count}</b></button>`).join('')}</div>`;
  }
  function openExcelCase(index) {
    if (!excelAnalysis || !excelAnalysis.rows[index]) return;
    excelCurrentCase = JSON.parse(JSON.stringify(excelAnalysis.rows[index]));
    const row = excelCurrentCase;
    $('excelMain').classList.add('hidden');
    $('excelCaseDetail').classList.remove('hidden');
    $('excelDetailTitle').textContent = `${row.taxpayer_name || row.name || 'Caso importado'} · ${row.classification}`;
    $('excelDetailSubtitle').textContent = `Caso ${row.name} · fila ${row.row_number}. Edita los datos del Excel y genera una liquidación anual desde la calculadora correspondiente.`;
    $('excelDetailFields').innerHTML = (row.headers||[]).map((header,i)=>{
      const value = row.values?.[i] ?? '';
      const h = String(header||`Columna ${i+1}`);
      const norm = h.toLowerCase();
      const textField = i===0 || norm.includes('ruc') || norm.includes('periodo') || norm.includes('declaracion') || norm.includes('nombre') || norm.includes('razon social') || norm.includes('tipo de caso') || norm.includes('notas');
      const type = 'text';
      const step = (typeof value === 'number' && !textField) ? ' inputmode="decimal"' : '';
      const readonly = i===0 ? ' readonly title="El identificador del caso se conserva para relacionar los gastos."' : '';
      return `<label class="excel-edit-field"><span>${esc(h)}</span><input type="${type}" data-edit-col="${i}" value="${esc(value)}"${step}${readonly}></label>`;
    }).join('');
    const exp = row.expenses || {};
    const rowYear=Number(fieldValue(['ejercicio'],2026));
    const rowUit=uitForExercise(rowYear);
    $('excelDetailExpenses').innerHTML = `<label class="excel-edit-field excel-uit-field"><span>UIT oficial del ejercicio ${rowYear} (S/)</span><div class="uit-control"><input id="excelUitValue" type="number" min="1" step="0.01" value="${rowUit||''}" readonly><button id="updateExcelUit" class="btn btn-outline btn-update-uit" type="button">Actualizar UIT ↻</button></div><small class="uit-help" id="excelUitStatus">${rowUit?`Valor oficial de referencia: S/ ${rowUit.toLocaleString('es-PE')}.`:'Verifica el valor oficial del ejercicio.'}</small></label><div class="excel-expense-grid"></div>`;
    const expenseFields = [
      ['rentExpense','Arrendamiento / subarrendamiento','30%'],
      ['restaurantExpense','Restaurantes, bares y hoteles','15%'],
      ['healthExpense','Servicios médicos y odontológicos','30%'],
      ['professionalExpense','Otros servicios profesionales','30%'],
      ['essaludExpense','Aportaciones EsSalud por trabajadores del hogar','100%']
    ];
    const grid=$('excelDetailExpenses').querySelector('.excel-expense-grid');
    grid.innerHTML=expenseFields.map(([key,label,rate])=>`<label class="excel-edit-field excel-expense-field"><span>${label} · importe total pagado (S/)</span><input type="number" min="0" step="0.01" data-edit-expense="${key}" value="${Number(exp[key]||0)}"><small data-excel-deduction="${key}">Deducción ${rate}: S/ 0.00</small></label>`).join('');
    const rates={rentExpense:.30,restaurantExpense:.15,healthExpense:.30,professionalExpense:.30,essaludExpense:1};
    const updatePreview=()=>{
      let total=0;
      Object.entries(rates).forEach(([key,rate])=>{
        const amount=Math.max(0,Number(grid.querySelector(`[data-edit-expense="${key}"]`)?.value)||0);
        const deduction=amount*rate; total+=deduction;
        const label=grid.querySelector(`[data-excel-deduction="${key}"]`);
        if(label)label.textContent=`Deducción ${Math.round(rate*100)}%: ${money(deduction)}`;
      });
      let summary=$('excelExpenseSummary');
      if(!summary){summary=document.createElement('div');summary.id='excelExpenseSummary';summary.className='deduction-total-preview';$('excelDetailExpenses').appendChild(summary);}
      const uit=Number($('excelUitValue')?.value)||0;
      summary.innerHTML=`<b>Total estimado por porcentajes: ${money(total)}</b><span>Tope conjunto máximo: ${uit?money(3*uit):'UIT pendiente de verificar'} (3 UIT). La deducción efectiva depende de los requisitos legales.</span>`;
      summary.classList.toggle('deduction-capped',uit>0&&total>3*uit);
    };
    grid.querySelectorAll('[data-edit-expense]').forEach(input=>input.addEventListener('input',updatePreview));
    $('updateExcelUit')?.addEventListener('click',()=>updateOfficialUit(rowYear,$('excelUitValue'),$('excelUitStatus'),$('updateExcelUit')).then(updatePreview));
    updatePreview();
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function closeExcelCase() {
    $('excelCaseDetail').classList.add('hidden');
    $('excelMain').classList.remove('hidden');
    excelCurrentCase = null;
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function fieldIndex(terms) {
    const hs=(excelCurrentCase.headers||[]).map(h=>String(h||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''));
    return hs.findIndex(h=>terms.some(t=>h.includes(t)));
  }
  function fieldValue(terms, fallback=0) {
    const i=fieldIndex(terms);
    if(i<0) return fallback;
    const v=excelCurrentCase.values?.[i];
    const n=Number(String(v??'').replace(/,/g,''));
    return Number.isFinite(n) ? n : fallback;
  }
  function fieldText(terms, fallback='') {
    const i=fieldIndex(terms);
    return i<0 ? fallback : String(excelCurrentCase.values?.[i]??fallback).trim();
  }
  function calculateExcelCase() {
    const row=excelCurrentCase;
    const headerInputs=$('excelDetailFields').querySelectorAll('[data-edit-col]');
    headerInputs.forEach(input=>{const i=Number(input.dataset.editCol); row.values[i]=input.value;});
    const expenseInputs=$('excelDetailExpenses').querySelectorAll('[data-edit-expense]');
    row.expenses=row.expenses||{};
    expenseInputs.forEach(input=>{row.expenses[input.dataset.editExpense]=Math.max(0,Number(input.value)||0);});
    row.name=String(row.values[1]||row.values[0]||'Caso editado');
    // Determine route from edited income amounts, not just the original classification.
    const gross=fieldValue(['honorarios por profesion','honorarios profesion','renta cuarta','ingreso independiente']);
    const otherFourth=fieldValue(['otras rentas cuarta']);
    const fifth=fieldValue(['remuneracion anual quinta','remuneracion anual','renta quinta','sueldo anual']);
    const bonuses=fieldValue(['gratificaciones bonos','gratificaciones','bonificaciones']);
    const foreign=fieldValue(['renta neta fuente extranjera','renta extranjera','ingreso extranjero']);
    const fourthOn=(gross+otherFourth)>0, fifthOn=(fifth+bonuses)>0, foreignOn=foreign>0;
    const nSources=[fourthOn,fifthOn,foreignOn].filter(Boolean).length;
    let route=nSources>1?'mixta':fourthOn?'cuarta':fifthOn?'quinta':foreignOn?'extranjera':row.route||'mixta';
    const form=document.querySelector(`.category-calc-form[data-calc="${route}"]`);
    if(!form){showToast('No se encontró la calculadora para esta combinación.');return;}
    const periodFallback=Number(String(fieldText(['periodo tributario'],'202613')).slice(0,4))||2026;
    const year=Math.round(fieldValue(['ejercicio'],periodFallback));
    const sourcePeriod=fieldText(['periodo tributario'],`${year}13`);
    const period=/^\d{4}13$/.test(sourcePeriod)?sourcePeriod:`${year}13`;
    if(sourcePeriod && sourcePeriod!==period) showToast(`El período ${sourcePeriod} corresponde a un mes. Para la liquidación anual se utilizará ${period}.`);
    const declaration=fieldText(['tipo de declaracion'],'ORIGINAL').toUpperCase();
    const set=(name,value)=>{const el=form.elements.namedItem(name);if(el)el.value=String(value??'');};
    form.querySelectorAll('input,select').forEach(el=>{
      if(el.name==='taxpayerName')el.value='';
      else if(el.name==='taxpayerRuc')el.value='';
      else if(el.name==='declarationType')el.value='ORIGINAL';
      else if(el.name==='taxPeriod')el.value=`${year}13`;
      else if(el.name==='year')el.value=String(year);
      else if(el.type==='number')el.value='0';
    });
    set('taxpayerName',fieldText(['nombre completo razon social','nombre completo','razon social'],String(row.values[1]||row.values[0]||'Caso Excel')));
    set('taxpayerRuc',fieldText(['ruc'],''));
    set('declarationType',['ORIGINAL','SUSTITUTORIA','RECTIFICATORIA'].includes(declaration)?declaration:'ORIGINAL');
    set('taxPeriod',period);
    set('year',year);
    set('gross',gross); set('otherFourth',otherFourth);
    set('salary',fieldValue(['remuneracion anual quinta','remuneracion anual','sueldo anual']));
    set('gratifications',0);
    set('bonuses',fieldValue(['gratificaciones bonos','bonos computables','bonificaciones']));
    set('fifth',fifth+bonuses);
    set('foreign',foreign);
    set('foreignTax',fieldValue(['impuesto pagado extranjero','impuesto extranjero']));
    set('withheld',fieldValue(['retencion cuarta'])+fieldValue(['retencion quinta']));
    set('payments',fieldValue(['pagos a cuenta cuarta'])+fieldValue(['pagos previos adicionales']));
    set('priorCredit',fieldValue(['saldo favor anterior']));
    set('itf',fieldValue(['itf deducible']));
    set('donations',fieldValue(['donaciones deducibles']));
    Object.entries(row.expenses||{}).forEach(([key,value])=>set(key,value));
    activeRoute=route; updateRouteResources(); navigate(route);
    pendingExcelRow=JSON.parse(JSON.stringify(row)); pendingExcelBatchId=excelBatchId;
    closeExcelCase();
    showToast('Datos cargados en la calculadora. Generando liquidación…');
    form.requestSubmit();
  }
  async function saveExcelBatch() {
    if (!excelAnalysis?.rows?.length || excelBatchSaved) return;
    const btn=$('saveExcelBatch'), status=$('excelBatchStatus');
    btn.disabled=true; btn.textContent='Guardando casos…';
    const batchId=excelBatchId || `excel-${Date.now()}`;
    excelBatchId=batchId;
    const norm=s=>String(s??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const cases=excelAnalysis.rows.map(row=>{
      const headers=row.headers||[], values=row.values||[];
      const val=terms=>{
        const i=headers.findIndex(h=>terms.some(t=>norm(h).includes(t)));
        const n=Number(String(i>=0?(values[i]??0):0).replace(/,/g,''));
        return Number.isFinite(n)?n:0;
      };
      const txt=terms=>{
        const i=headers.findIndex(h=>terms.some(t=>norm(h).includes(t)));
        return i>=0?String(values[i]??'').trim():'';
      };
      const period=txt(['periodo tributario','periodo']);
      const year=Number(txt(['ejercicio']).match(/\d{4}/)?.[0] || period.match(/^\d{4}/)?.[0]) || new Date().getFullYear();
      const key=row.class_key;
      const kind=key==='solo_cuarta'?'cuarta':key==='solo_quinta'?'quinta':key==='solo_extranjera'?'extranjera':'mixta';
      const taxpayerName=row.taxpayer_name||txt(['nombre completo','razon social','contribuyente'])||row.name||`Caso fila ${row.row_number||''}`;
      const declaration=txt(['tipo de declaracion']).toUpperCase();
      const payload={
        kind, excelBatchId:batchId, excelRow:row, year,
        caseName:`${taxpayerName} · ${row.classification}`,
        taxpayerName, taxpayerRuc:txt(['ruc']),
        taxPeriod:/^\d{4}13$/.test(period)?period:`${year}13`,
        declarationType:['ORIGINAL','SUSTITUTORIA','RECTIFICATORIA'].includes(declaration)?declaration:'ORIGINAL',
        uit:uitForExercise(year),
        annualTax:0,balance:0,
        proFourth:val(['honorarios profesion','honorarios por profesion','renta cuarta','ingreso independiente']),
        otherFourth:val(['otras rentas cuarta']),
        fifthSalary:val(['remuneracion anual quinta','remuneracion anual','renta quinta','sueldo anual']),
        bonuses:val(['gratificaciones','bonificaciones']),
        foreignNet:val(['renta neta fuente extranjera','renta extranjera','ingreso extranjero']),
        withholding:val(['retencion cuarta'])+val(['retencion quinta']),
        payments:val(['pagos a cuenta cuarta','pagos previos']),
        foreignTax:val(['impuesto pagado extranjero','impuesto extranjero']),
        inputs:{}
      };
      return {case_name:payload.caseName,year,category:row.classification,annual_tax:0,balance:0,payload};
    });
    try {
      const response=await fetch('/api/cases/bulk',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({cases})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error||'No se pudo guardar el bloque Excel.');
      excelBatchSaved=true;
      btn.disabled=true;
      btn.textContent='Bloque guardado en el historial';
      status.textContent=`Se guardaron ${data.saved} casos en el historial, dentro de un bloque independiente.`;
      showToast(status.textContent);
      await fetchSaved();
      if(currentPage==='historial') await renderHistory();
    } catch(err) {
      btn.disabled=false;
      btn.textContent='Reintentar guardado de casos';
      status.textContent=err.message||'No se pudo guardar el bloque Excel.';
      showToast(status.textContent);
    }
  }
  $('saveExcelBatch')?.addEventListener('click',saveExcelBatch);
  if (excelForm) excelForm.addEventListener('submit',async e=>{
    e.preventDefault(); const file=$('excelFile').files[0]; if(!file){showToast('Selecciona un archivo Excel.');return;}
    if(file.size>10*1024*1024){showToast('El archivo supera los 10 MB.');return;}
    const btn=excelForm.querySelector('button[type="submit"]'); btn.disabled=true; btn.textContent='Analizando archivo…';
    try {
      const fd=new FormData(); fd.append('file',file);
      const response=await fetch('/api/classify-excel',{method:'POST',body:fd});
      const data=await response.json().catch(()=>({error:`El servidor respondió con un formato inesperado (HTTP ${response.status}). Comprueba que Flask siga activo y vuelve a iniciar sesión.`}));
      if(response.redirected || response.status===401){window.location.href='/acceso';return;}
      if(!response.ok)throw new Error(data.error||data.message||'No se pudo leer el archivo.');
      excelAnalysis=data; excelFilter='all'; excelBatchId=`excel-${Date.now()}-${Math.random().toString(36).slice(2,8)}`; excelBatchSaved=false;
      $('saveExcelBatch').disabled=false; $('saveExcelBatch').textContent='Guardar todos los casos de este Excel en el historial'; $('excelBatchStatus').textContent=`${data.total} casos listos para guardarse en un bloque independiente.`;
      $('excelResultTitle').textContent=`Se analizaron ${data.total} filas`;
      $('excelResultIntro').textContent=`Hoja leída: ${data.sheet}. Pulsa las tarjetas para filtrar y abre cualquier fila para revisar, modificar y generar su liquidación anual.`;
      renderExcelSummary(data.counts); renderExcelRows();
      showToast('Excel analizado. Las tarjetas de categorías ya permiten filtrar.');
    } catch(err) {
      const msg=err.message||'Error al analizar Excel.';
      if($('excelResultIntro')) $('excelResultIntro').textContent=msg;
      showToast(msg);
    } finally {btn.disabled=false;btn.textContent='Analizar y clasificar filas →';}
  });
  document.addEventListener('click',e=>{
    const filter=e.target.closest('[data-excel-filter]');
    if(filter){excelFilter=filter.dataset.excelFilter;renderExcelRows();return;}
    const open=e.target.closest('[data-excel-open]');
    if(open){openExcelCase(Number(open.dataset.excelOpen));return;}
  });
  $('excelDetailBack')?.addEventListener('click',closeExcelCase);
  $('excelDetailCancel')?.addEventListener('click',closeExcelCase);
  $('excelDetailForm')?.addEventListener('submit',e=>{e.preventDefault();calculateExcelCase();});

  // Calculadoras independientes con liquidación detallada por categoría.
  function taxByBrackets(amount, uit) {
    const bands=[
      {label:'Hasta 5 UIT · 8%',limit:5*uit,rate:.08},
      {label:'Más de 5 hasta 20 UIT · 14%',limit:15*uit,rate:.14},
      {label:'Más de 20 hasta 35 UIT · 17%',limit:15*uit,rate:.17},
      {label:'Más de 35 hasta 45 UIT · 20%',limit:10*uit,rate:.20},
      {label:'Exceso de 45 UIT · 30%',limit:Infinity,rate:.30}
    ];
    let remaining=Math.max(0,amount), total=0;
    const detail=[];
    for(const band of bands){
      const base=Math.min(remaining,band.limit);
      const tax=base*band.rate;
      detail.push({label:band.label,base,tax,rate:band.rate});
      total+=tax; remaining-=base;
      if(remaining<=0) break;
    }
    return {total,detail};
  }
  function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

  let activePdfUrls = new WeakMap();
  async function loadForm709Preview(report, detail) {
    const preview=detail.querySelector('.category-709-preview');
    if(!preview) return;
    preview.classList.remove('hidden');
    const status=preview.querySelector('.category-709-status');
    const frame=preview.querySelector('.category-709-frame');
    const download=preview.querySelector('.category-709-download');
    status.textContent='Generando vista previa del formulario de dos páginas…';
    try {
      const response=await fetch('/api/formulario-709',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(report)});
      if(!response.ok){let message='No se pudo generar la vista previa.';try{const err=await response.json();message=err.error||message;}catch{}throw new Error(message);}
      const blob=await response.blob();
      const old=activePdfUrls.get(frame); if(old) URL.revokeObjectURL(old);
      const url=URL.createObjectURL(blob); activePdfUrls.set(frame,url);
      frame.src=url; download.href=url; download.download=`liquidacion_formulario_709_${report.year}.pdf`;
      status.textContent='Vista previa lista. Revisa las páginas 1 y 2 antes de descargar.';
    } catch(err) {
      status.textContent=(err.message||'Error al generar el PDF.')+' Puedes volver a calcular para intentarlo otra vez.';
      showToast(status.textContent);
    }
  }


  const expenseRates={rentExpense:.30,restaurantExpense:.15,healthExpense:.30,professionalExpense:.30,essaludExpense:1};
  const expenseLabels={
    rentExpense:'Alquiler · 30%',
    restaurantExpense:'Restaurantes y hoteles · 15%',
    healthExpense:'Servicios médicos · 30%',
    professionalExpense:'Servicios profesionales y oficios · 30%',
    essaludExpense:'EsSalud de trabajadores del hogar · 100%'
  };
  function expensePreviewValues(form){
    const val=(key)=>Math.max(0,Number(form.elements.namedItem(key)?.value)||0);
    const year=Number(form.elements.namedItem('year')?.value||2026);
    const uit=uitForExercise(year);
    const fourth=Math.max(0,val('gross')-Math.min(val('gross')*.20,24*uit))+val('otherFourth');
    const fifth=val('salary')+val('gratifications')+val('bonuses');
    const work=fourth+fifth;
    const after7=Math.max(0,work-Math.min(work,7*uit));
    const requested={};
    Object.keys(expenseRates).forEach(k=>requested[k]=val(k)*expenseRates[k]);
    const total=Object.values(requested).reduce((a,b)=>a+b,0);
    const allowed=Math.min(total,3*uit,after7);
    const ratio=total>0?allowed/total:0;
    const applied={};
    Object.keys(requested).forEach(k=>applied[k]=requested[k]*ratio);
    return {requested,applied,total,allowed,cap:3*uit,after7};
  }
  function refreshExpensePreviews(form){
    const v=expensePreviewValues(form);
    Object.keys(expenseRates).forEach(k=>{
      const el=form.querySelector(`[data-deduction-preview="${k}"]`);
      if(!el)return;
      const req=v.requested[k]||0;
      const fmt=x=>money(x);
      el.innerHTML=`<span>Deducción estimada según porcentaje: <b>${fmt(req)}</b></span><span class="deduction-limit-note">Sujeta al límite conjunto de 3 UIT y a los requisitos legales.</span>`;
      el.classList.toggle('deduction-capped',v.total>v.cap || v.allowed+0.005<v.total);
    });
    const totalPreview=form.querySelector('.deduction-total-preview');
    if(totalPreview){
      totalPreview.innerHTML=`<b>Total calculado por porcentajes: ${money(v.total)}</b><span>Deducción adicional considerada en la liquidación: <strong>${money(v.allowed)}</strong> · Tope máximo: ${money(v.cap)} (3 UIT).</span>`;
      totalPreview.classList.toggle('deduction-capped',v.total>v.allowed+0.005);
    }
  }
  document.querySelectorAll('.category-calc-form').forEach(form=>{
    Object.keys(expenseRates).forEach(k=>{
      const input=form.elements.namedItem(k);
      input?.addEventListener('input',()=>refreshExpensePreviews(form));
      input?.addEventListener('change',()=>refreshExpensePreviews(form));
    });
    ['year','gross','otherFourth','salary','gratifications','bonuses'].forEach(k=>{
      form.elements.namedItem(k)?.addEventListener('input',()=>refreshExpensePreviews(form));
    });
    refreshExpensePreviews(form);
  });

  document.querySelectorAll('.category-calc-form').forEach(form=>form.addEventListener('submit',e=>{
    e.preventDefault();
    const data=new FormData(form), n=k=>Math.max(0,Number(data.get(k))||0);
    const kind=form.dataset.calc, year=Number(data.get('year')||2026), uit=uitForExercise(year);
    if(!uit){showToast(`La UIT oficial del ejercicio ${year} no está disponible. Pulsa «Actualizar UIT» antes de calcular.`);return;}
    const taxpayerName=String(data.get('taxpayerName')||'').trim(), taxpayerRuc=String(data.get('taxpayerRuc')||'').trim(), declarationType=String(data.get('declarationType')||'ORIGINAL'), taxPeriod=String(data.get('taxPeriod')||'').trim();
    if(!taxpayerName || !/^\d{11}$/.test(taxpayerRuc) || !/^\d{4}13$/.test(taxPeriod) || Number(taxPeriod.slice(0,4))!==year) {
      showToast('Revisa los datos antes de calcular: nombre o razón social, RUC de 11 dígitos y período anual terminado en 13. Ejemplo: 202513 para el ejercicio 2025.');
      const bad=!taxpayerName?form.elements.namedItem('taxpayerName'):!/^\d{11}$/.test(taxpayerRuc)?form.elements.namedItem('taxpayerRuc'):form.elements.namedItem('taxPeriod');
      bad?.focus(); bad?.classList.add('field-invalid'); setTimeout(()=>bad?.classList.remove('field-invalid'),4200); return;
    }
    if(!['ORIGINAL','SUSTITUTORIA','RECTIFICATORIA'].includes(declarationType)){showToast('Selecciona el tipo de declaración.');return;}
    const proFourth=n('gross'), otherFourth=n('otherFourth');
    const fourthDeduction=Math.min(proFourth*.20,24*uit);
    const fourthNet=Math.max(0,proFourth-fourthDeduction)+otherFourth;
    const fifthSalary=n('salary'), gratifications=n('gratifications'), bonuses=n('bonuses');
    const fifthGross=fifthSalary+gratifications+bonuses;
    const foreignNet=n('foreign');
    const hasWork= fourthNet+fifthGross>0;
    const workBeforeDeductions=fourthNet+fifthGross;
    const basicDeduction=hasWork?Math.min(workBeforeDeductions,7*uit):0;
    const rentExpense=n('rentExpense'), restaurantExpense=n('restaurantExpense'), healthExpense=n('healthExpense'), professionalExpense=n('professionalExpense'), essaludExpense=n('essaludExpense');
    const rentDeduction=rentExpense*.30, restaurantDeduction=restaurantExpense*.15, healthDeduction=healthExpense*.30, professionalDeduction=professionalExpense*.30, essaludDeduction=essaludExpense;
    const extraRequested=rentDeduction+restaurantDeduction+healthDeduction+professionalDeduction+essaludDeduction;
    const itf=n('itf'), donations=n('donations'), priorCredit=n('priorCredit');
    const remainingAfter7=Math.max(0,workBeforeDeductions-basicDeduction);
    const extraDeduction=Math.min(extraRequested,3*uit,remainingAfter7);
    const itfDeduction=Math.min(itf,Math.max(0,remainingAfter7-extraDeduction));
    const donationDeduction=Math.min(donations,Math.max(0,remainingAfter7-extraDeduction-itfDeduction));
    const workTaxable=Math.max(0,remainingAfter7-extraDeduction-itfDeduction-donationDeduction);
    // La renta neta de fuente extranjera computable se integra luego de determinar la renta neta del trabajo.
    const taxable=workTaxable+foreignNet;
    const bracketCalc=taxByBrackets(taxable,uit), annualTax=bracketCalc.total;
    const withholding=n('withheld'), payments=n('payments');
    const foreignCreditLimit=taxable>0 ? foreignNet*(annualTax/taxable) : 0;
    const foreignCredit=Math.min(n('foreignTax'),foreignCreditLimit,annualTax);
    const totalCredits=withholding+payments+foreignCredit+priorCredit;
    const balance=annualTax-totalCredits;
    const hasFourth=(proFourth+otherFourth)>0, hasFifth=fifthGross>0, hasForeign=foreignNet>0;
    const filingReasons=[];
    if(balance>0.005)filingReasons.push('Determina deuda tributaria por pagar');
    if(priorCredit>0.005)filingReasons.push('Aplica saldo a favor de ejercicios anteriores');
    if(balance<-.005&&(hasFourth||(hasForeign&&(hasFourth||hasFifth))))filingReasons.push('Determina saldo a favor en rentas de cuarta o rentas de trabajo con fuente extranjera');
    if(balance<-.005&&hasFifth&&!hasFourth&&!hasForeign&&rentDeduction>0.005)filingReasons.push('Saldo a favor de quinta por deducción de alquiler/subarrendamiento');
    let filingRequired=filingReasons.length>0;
    if(year>=2026){filingRequired=null;filingReasons.length=0;}
    const balanceLabel=balance>0.005?'A FAVOR DEL FISCO':balance<-.005?'A FAVOR DEL CONTRIBUYENTE':'SIN SALDO';
    const filingLabel=year>=2026?'PROYECCIÓN: OBLIGACIÓN FV 709 A CONFIRMAR AL CIERRE':filingRequired?'OBLIGADO A PRESENTAR FV 709':'NO OBLIGADO SEGÚN LOS SUPUESTOS EVALUADOS';
    const fmt=x=>new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number.isFinite(x)?x:0);
    const names={cuarta:'Renta de cuarta categoría',quinta:'Renta de quinta categoría',extranjera:'Renta de fuente extranjera integrada',mixta:'Liquidación integral de rentas de trabajo y fuente extranjera'};
    const rows=[];
    const add=(label,value,kind='')=>rows.push({label,value,kind});
    add('Ejercicio fiscal',String(year),'text'); add('Valor de la UIT',uit);
    if(proFourth>0 || kind==='cuarta' || kind==='mixta' || kind==='extranjera'){
      add('Renta bruta por ejercicio individual (cuarta)',proFourth);
      add('(-) Deducción legal del 20% (tope 24 UIT)',-fourthDeduction);
      add('Renta neta del ejercicio individual',proFourth-fourthDeduction,'subtotal');
      add('(+) Otras rentas de cuarta sin deducción del 20%',otherFourth);
      add('Total renta neta de cuarta categoría',fourthNet,'subtotal');
    }
    if(fifthGross>0 || kind==='quinta' || kind==='mixta' || kind==='extranjera'){
      add('Sueldos y remuneraciones de quinta',fifthSalary);
      add('(+) Gratificaciones computables',gratifications);
      add('(+) Bonificaciones, utilidades y otros afectos',bonuses);
      add('Total renta bruta de quinta categoría',fifthGross,'subtotal');
    }
    add('Renta de trabajo antes de deducciones',workBeforeDeductions,'subtotal');
    add('(-) Deducción de 7 UIT'+(hasWork?' ('+fmt(7*uit)+' como máximo)':' (no aplicada sin renta de trabajo)'),-basicDeduction);
    add('Gasto por alquiler ingresado',rentExpense);
    add('Deducción porcentual por alquiler (30%, antes del límite)',rentDeduction);
    add('Gasto en restaurantes, bares y hoteles ingresado',restaurantExpense);
    add('Deducción porcentual por restaurantes/hoteles (15%, antes del límite)',restaurantDeduction);
    add('Gasto médico/odontológico ingresado',healthExpense);
    add('Deducción porcentual por servicios médicos (30%, antes del límite)',healthDeduction);
    add('Servicios profesionales/oficios ingresados',professionalExpense);
    add('Deducción porcentual por servicios profesionales (30%, antes del límite)',professionalDeduction);
    add('Aportes EsSalud por trabajadores del hogar ingresados',essaludExpense);
    add('Deducción porcentual por EsSalud (100%, antes del límite)',essaludDeduction);
    add('(-) Deducción adicional aplicada (límite 3 UIT: '+fmt(3*uit)+')',-extraDeduction);
    add('(-) ITF deducible aplicado',-itfDeduction);
    add('(-) Donaciones deducibles aplicadas',-donationDeduction);
    add('Renta neta imponible del trabajo',workTaxable,'total');
    if(kind==='extranjera'||kind==='mixta') add('(+) Renta neta de fuente extranjera computable',foreignNet);
    add('Base imponible utilizada para la escala progresiva',taxable,'total');
    rows.push({label:'DETALLE DE LA ESCALA PROGRESIVA',kind:'section'});
    bracketCalc.detail.forEach(b=>{if(b.base>0)add(b.label+' · base del tramo '+fmt(b.base),b.tax,'bracket');});
    add('Impuesto anual calculado',annualTax,'grand');
    add('(-) Retenciones de cuarta/quinta ingresadas',-withholding);
    add('(-) Pagos a cuenta de cuarta ingresados',-payments);
    add('(-) Saldo a favor de ejercicios anteriores',-priorCredit);
    if(kind==='extranjera'||kind==='mixta'){
      add('Impuesto pagado en el exterior informado',n('foreignTax'));
      add('(-) Crédito extranjero referencial limitado',-foreignCredit);
    }
    add(balance>0.005?'IMPUESTO ESTIMADO POR REGULARIZAR':balance<-.005?'POSIBLE SALDO A FAVOR':'SALDO ESTIMADO',Math.abs(balance),'grand');
    const resultBox=form.parentElement.querySelector('.category-calc-result');
    if (!resultBox) { showToast('No se encontró el área de resultado de esta categoría.'); return; }
    resultBox.innerHTML=`<span>${esc(names[kind])} · ejercicio ${year}</span><b>${fmt(annualTax)}<br><small style="font-weight:700;color:var(--wine)">${balance>0.005?'A favor del fisco: '+fmt(balance):balance<-.005?'A favor del contribuyente: '+fmt(Math.abs(balance)):'Sin saldo tributario'}</small><small style="display:block;font-weight:600;color:var(--muted);margin-top:5px">${esc(filingLabel)}</small></b>`;
    const detail=form.parentElement.querySelector('.category-liquidation');
    detail.classList.remove('hidden');
    detail.querySelector('.category-liquidation-rows').innerHTML=rows.map(r=>{
      if(r.kind==='section')return `<tr class="section-row"><td colspan="2">${esc(r.label)}</td></tr>`;
      const cls=['subtotal','total','grand'].includes(r.kind)?` class="${r.kind==='grand'?'total-row':r.kind==='total'?'total-row':''}"`:'';
      return `<tr${cls}><td>${esc(r.label)}</td><td>${r.kind==='text'?esc(r.value):fmt(r.value)}</td></tr>`;
    }).join('');
    let note='Simulación académica basada en el esquema general de rentas de trabajo de SUNAT. Los gastos se deducen con porcentajes de referencia: alquiler 30%, restaurantes/hoteles 15%, médicos/odontólogos 30%, servicios profesionales/oficios 30% y EsSalud de trabajadores del hogar 100%, sujetos a requisitos y sustentos. La suma de deducción adicional se limita a 3 UIT.';
    if(kind==='extranjera'||kind==='mixta') note+=' El crédito por impuesto pagado en el exterior se muestra como referencia: el límite legal depende de la tasa media, del impuesto efectivamente pagado y de la naturaleza de la renta.';
    if(kind==='quinta') note+=' La retención mensual del empleador puede seguir una proyección propia; esta hoja calcula la regularización anual estimada.';
    if(kind==='cuarta') note+=' La deducción del 20% no corresponde a dietas y funciones similares de director, síndico, mandatario, gestor, albacea y conceptos equiparables.';
    detail.querySelector('.category-liquidation-note').textContent=note;
    detail.dataset.report=JSON.stringify({kind,year,uit,rows,note,annualTax,balance,workBeforeDeductions,basicDeduction,extraDeduction,taxable,totalCredits,withholding,payments,foreignNet,foreignCredit,proFourth,otherFourth,fifthSalary,gratifications,bonuses,rentExpense,restaurantExpense,healthExpense,professionalExpense,essaludExpense,rentDeduction,restaurantDeduction,healthDeduction,professionalDeduction,essaludDeduction,taxpayerName,taxpayerRuc,declarationType,taxPeriod});
    // Cada cálculo queda guardado en la cuenta y aparece en el apartado único de casos.
    const casePayload={kind,year,uit,rows,note,annualTax,balance,balanceLabel,balanceAmount:Math.abs(balance),filingRequired,filingLabel,filingReasons,workBeforeDeductions,basicDeduction,extraDeduction,taxable,totalCredits,withholding,payments,foreignNet,foreignCredit,proFourth,otherFourth,fifthSalary,gratifications,bonuses,rentExpense,restaurantExpense,healthExpense,professionalExpense,essaludExpense,rentDeduction,restaurantDeduction,healthDeduction,professionalDeduction,essaludDeduction,taxpayerName,taxpayerRuc,declarationType,taxPeriod,caseName:`${names[kind]} · ${taxpayerName}`,inputs:Object.fromEntries(data.entries())};
    if(pendingExcelRow){casePayload.excelRow=pendingExcelRow;casePayload.excelBatchId=pendingExcelBatchId||null;pendingExcelRow=null;pendingExcelBatchId=null;}
    else if(excelCurrentCase){casePayload.excelRow=excelCurrentCase;casePayload.excelBatchId=excelBatchId||null;}
    const saveBody={case_name:casePayload.caseName,year,category:names[kind],annual_tax:annualTax,balance,payload:casePayload};
    const wasEditing=Boolean(editingCaseId);
    if(wasEditing)saveBody.id=editingCaseId;
    fetch('/api/cases',{method:wasEditing?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(saveBody)})
      .then(async res=>{if(!res.ok){const err=await res.json().catch(()=>({}));throw new Error(err.error||'No se pudo guardar el caso.');}
        editingCaseId=null;showToast(wasEditing?'Caso actualizado correctamente en el historial.':'Cálculo generado y guardado en el historial.');
      })
      .catch(err=>showToast(err.message||'Cálculo listo, pero no se pudo guardar. Revisa tu conexión.'));
    detail.dataset.form709=JSON.stringify({kind,year,uit,annualTax,balance,taxable,workBeforeDeductions,basicDeduction,extraDeduction,totalCredits,withholding,payments,foreignNet,foreignCredit,proFourth,otherFourth,fifthSalary,gratifications,bonuses,taxpayerName,taxpayerRuc,declarationType,taxPeriod,inputs:Object.fromEntries(data.entries())});
    // Render the exact two-page PDF template inline on the same page, immediately after calculation.
    const form709Report=JSON.parse(detail.dataset.form709);
    loadForm709Preview(form709Report, detail);
  }));
  document.querySelectorAll('.category-print').forEach(btn=>btn.addEventListener('click',()=>{
    const detail=btn.closest('.category-liquidation'); if(!detail?.dataset.report){showToast('Primero calcula la liquidación.');return;}
    const report=JSON.parse(detail.dataset.report), table=detail.querySelector('.category-liquidation-rows').innerHTML;
    const title=({cuarta:'Renta de cuarta categoría',quinta:'Renta de quinta categoría',extranjera:'Renta de fuente extranjera',mixta:'Caso integral mixto'})[report.kind]||'Liquidación anual';
    const w=window.open('','_blank','width=900,height=700');
    if(!w){showToast('Permite las ventanas emergentes para imprimir la liquidación.');return;}
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Liquidación · ${title}</title><style>body{font-family:Arial,sans-serif;color:#18344b;padding:32px}h1{color:#7a1e3c;font-size:24px}p{line-height:1.5;color:#526b7c}.meta{padding:12px;background:#f5edf0;border-radius:8px}table{border-collapse:collapse;width:100%;margin:20px 0}td{padding:9px;border-bottom:1px solid #ddd}td:last-child{text-align:right;white-space:nowrap}.section-row td{background:#e5eef3;color:#103d5b;font-weight:bold}.total-row td{font-weight:bold;background:#f8e9ee}small{font-size:12px}@media print{button{display:none}body{padding:0}}</style></head><body><h1>Tribuanálisis · ${title}</h1><div class="meta">Contribuyente: ${esc(report.taxpayerName)} · RUC: ${esc(report.taxpayerRuc)} · Declaración: ${esc(report.declarationType)} · Período: ${esc(report.taxPeriod)}<br>Ejercicio ${report.year} · UIT S/ ${report.uit.toLocaleString('es-PE')} · Liquidación académica</div><table><tbody>${table}</tbody></table><p>${esc(report.note)}</p><p><b>Importante:</b> documento educativo no oficial. Verifica los datos, límites y normas vigentes en SUNAT antes de usarlo para una declaración real.</p><button onclick="window.print()">Imprimir / Guardar como PDF</button><script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
    w.document.close();
  }));

  document.querySelectorAll('.category-709').forEach(btn=>btn.addEventListener('click',async()=>{
    const detail=btn.closest('.category-liquidation'), raw=detail?.dataset.form709;
    if(!raw){showToast('Primero calcula la renta para preparar el Formulario 709.');return;}
    let report; try{report=JSON.parse(raw);}catch{showToast('No se pudo leer el cálculo. Vuelve a calcular el caso.');return;}
    btn.disabled=true; const oldText=btn.textContent; btn.textContent='Actualizando vista previa…';
    await loadForm709Preview(report,detail);
    btn.disabled=false; btn.textContent=oldText;
  }));

  updateSources(); updateRouteResources(); renderHomeDashboard();

  function uitForExercise(year){ return OFFICIAL_UIT_REFERENCE[Number(year)] || 0; }
  function rememberUit(year,value){
    const y=Number(year),v=Number(value);
    if(y>=2023&&Number.isFinite(v)&&v>0) OFFICIAL_UIT_REFERENCE[y]=v;
  }
  function populateTaxYears(){
    const current=new Date().getFullYear();
    document.querySelectorAll('select[name="year"],#year').forEach(select=>{
      const previous=Number(select.value);
      const selected=previous>=2023&&previous<=current?previous:current;
      select.innerHTML=Array.from({length:current-2022},(_,i)=>current-i)
        .map(y=>`<option value="${y}">${y}</option>`).join('');
      select.value=String(selected);
    });
  }
  async function updateOfficialUit(year,input,status,button){
    const y=Number(year);
    if(!y){showToast('Selecciona el ejercicio fiscal.');return;}
    if(button){button.disabled=true;button.dataset.originalText=button.textContent;button.textContent='Consultando…';}
    if(status)status.textContent=`Consultando la UIT ${y} en SUNAT…`;
    try{
      const response=await fetch(`/api/uit/actualizar?year=${encodeURIComponent(y)}`,{cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.message||data.error||`No se pudo verificar la UIT ${y}.`);
      rememberUit(y,data.value);
      if(input)input.value=String(data.value);
      if(status)status.textContent=`UIT oficial ${y}: S/ ${Number(data.value).toLocaleString('es-PE')}.`;
      document.querySelectorAll('select[name="year"],#year').forEach(select=>{
        if(Number(select.value)!==y)return;
        const form=select.closest('form');
        const field=form?.elements.namedItem('uitValue');
        if(field)field.value=String(data.value);
        if(select.id==='year'&&$('uitValueMain'))$('uitValueMain').value=String(data.value);
      });
      document.querySelectorAll('.category-calc-form').forEach(form=>refreshExpensePreviews(form));
      showToast(`UIT ${y} actualizada: S/ ${Number(data.value).toLocaleString('es-PE')}.`);
    }catch(err){
      if(status)status.textContent=err.message||'No se pudo actualizar la UIT.';
      showToast(status?.textContent||err.message);
    }finally{
      if(button){button.disabled=false;button.textContent=button.dataset.originalText||'Actualizar UIT ↻';}
    }
  }
  populateTaxYears();
  document.querySelectorAll('select[name="year"],#year').forEach(select=>{
    const sync=()=>{
      const y=Number(select.value),v=uitForExercise(y);
      const form=select.closest('form'),field=form?.elements.namedItem('uitValue');
      if(field)field.value=v?String(v):'';
      if(select.id==='year'&&$('uitValueMain'))$('uitValueMain').value=v?String(v):'';
      const status=form?.querySelector('[data-uit-status]');
      if(status)status.textContent=v?`Valor oficial de referencia para ${y}: S/ ${v.toLocaleString('es-PE')}.`:`La UIT ${y} debe verificarse en SUNAT.`;
      if(select.id==='year'&&$('uitStatusMain'))$('uitStatusMain').textContent=v?`Valor oficial de referencia para ${y}: S/ ${v.toLocaleString('es-PE')}.`:`La UIT ${y} debe verificarse en SUNAT.`;
      document.querySelectorAll('.category-calc-form').forEach(refreshExpensePreviews);
    };
    select.addEventListener('change',sync);sync();
  });
  document.querySelectorAll('[data-update-uit]').forEach(button=>button.addEventListener('click',()=>{
    const form=button.closest('form'),year=form?.elements.namedItem('year')?.value;
    updateOfficialUit(year,form?.elements.namedItem('uitValue'),form?.querySelector('[data-uit-status]'),button);
  }));
  document.querySelector('[data-update-uit-main]')?.addEventListener('click',()=>{
    updateOfficialUit($('year')?.value,$('uitValueMain'),$('uitStatusMain'),document.querySelector('[data-update-uit-main]'));
  });

})();
