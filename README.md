# Tribuanálisis — Semana 7

Aplicación Flask educativa para prácticas de tributación.

## Ejecutar localmente desde Visual Studio Code

1. Extrae el ZIP.
2. Abre la carpeta `tribuanalisis_semana7` en VS Code.
3. Crea un entorno virtual e instala dependencias:
   - Windows: `py -m venv .venv` y `.venv\\Scripts\\activate`
   - `pip install -r requirements.txt`
4. Ejecuta `python app.py`.
5. Abre `http://127.0.0.1:5000`.

La aplicación usa SQLite en `instance/tribuanalisis.db` por defecto. Para despliegues persistentes, configura `DATABASE_PATH` a un almacenamiento persistente y define `SECRET_KEY` como variable de entorno.

## Cambios en esta revisión

- Se consolidó la navegación en una sola entrada «Cálculo de rentas», sin subapartados en el menú lateral.
- Las tarjetas para elegir el tipo de caso se trasladaron de Inicio al apartado Cálculo de rentas.
- Se conserva el menú de cuenta con cambio de contraseña y cierre de sesión.
- Se conserva el historial por usuario y el guardado automático de los cálculos de las calculadoras de categoría.
- Se conserva la importación de Excel con validación de extensión, tamaño y lectura de encabezados.
- La vista previa PDF usa la plantilla de dos páginas incluida en `static/docs/formulario_709_plantilla.pdf`.

## Nota importante

Este proyecto es académico. La plantilla PDF adjunta se identificó como reconstrucción editable y no como constancia oficial de SUNAT. La salida no debe presentarse como declaración oficial ni darse por válida para presentación real sin validar los casilleros, cálculos y el formulario oficial vigente para el ejercicio correspondiente.

### Datos de identificación por liquidación

Cada formulario independiente solicita nombre completo/razón social, RUC de 11 dígitos, período tributario de 6 dígitos y tipo de declaración (Original, Sustitutoria o Rectificatoria). Estos datos se agregan al caso guardado y se insertan en las celdas de identificación de la vista previa PDF.

### Material audiovisual por categoría

Cada categoría mantiene su video principal y agrega dos accesos distintos a búsquedas específicas de YouTube para evitar repetir los mismos recursos entre cuarta, quinta, fuente extranjera e integración mixta.


## Arranque recomendado en Windows
1. Descomprime el ZIP y abre la carpeta `tribuanalisis_semana7` en VS Code.
2. Ejecuta `INICIAR_TRIBUANALISIS.bat` con doble clic, o usa la terminal: `python -m venv .venv`, ` .\.venv\Scripts\Activate.ps1`, `python -m pip install -r requirements.txt`, `python app.py`.
3. Abre `http://127.0.0.1:5000`. Mantén abierta la terminal mientras uses la app.
4. Si el navegador muestra la versión anterior, detén el servidor con `Ctrl+C`, vuelve a iniciarlo y recarga con `Ctrl+F5`. El JavaScript tiene versión de caché actualizada.
5. En `Importar Excel`, descarga `static/docs/plantilla_casos_tributarios.xlsx` desde el botón de la página y vuelve a subirlo para probar.

La liquidación PDF se previsualiza dentro de la página del tipo de renta tras calcular, y el botón permite actualizarla. Los casos se guardan en SQLite dentro de `instance/tribuanalisis.db`, separados por cuenta. No borres esa carpeta si necesitas conservar el historial. El PDF es una reconstrucción académica basada en el archivo proporcionado y no es una constancia oficial SUNAT.

**Nota de cálculo:** los resultados de las calculadoras son educativos y requieren validación tributaria para cada ejercicio; no presentar directamente como declaración oficial.


Actualización de guía normativa (28-10-2026): el apartado Guía tributaria visual incorpora referencias a los artículos 33, 34, 45, 46, 51 y 53 del TUO de la Ley del Impuesto a la Renta, artículo 26-A del Reglamento, porcentajes de deducción adicional y enlaces oficiales SUNAT. El ejemplo de liquidación muestra la vista previa del PDF en la misma página; se retiró el panel 'Cómo utilizarlo' y el aviso 'Importante' de ese apartado.


## Actualización 30/10/2026 · Historial editable y Formulario 709

- El historial permite filtrar por cuarta, quinta, fuente extranjera, casos mixtos o todos.
- Los casos manuales pueden abrirse para editar sus datos y recalcularse actualizando el mismo registro.
- Cada caso guardado dispone de vista previa del Formulario 709 en PDF y descarga del documento.
- El Formulario 709 se genera usando el archivo PDF de plantilla incluido en `static/docs/formulario_709_plantilla.pdf`.
- Los importes se ingresan como texto numérico, sin controles de flechas/spinner.
- La importación Excel aparece primero; debajo se muestran los filtros interactivos y la tabla de casos.
- Se añadieron mensajes e ilustración para las vistas de historial vacías.

La plantilla PDF incluida es una reconstrucción educativa del formato compartido, no un comprobante oficial emitido ni validado por SUNAT. Verifica el resultado contra el formulario y las reglas del ejercicio tributario antes de usarlo en una declaración real.


## Actualización visual y funcional · 31/10/2026

- Validación anual del período con código 13 y avisos visuales integrados, sin el globo nativo del navegador.
- Botones de retorno de las páginas de categoría y liquidación dirigidos al apartado Cálculo de rentas.
- Página Inicio ampliada con panel de indicadores, gráfico circular y barras interactivos alimentados por el historial real del usuario.
- Apartado Ejemplo de liquidación: vista previa limpia de las dos páginas como imágenes renderizadas desde el PDF de ejemplo; se mantiene la descarga del PDF. Se retiró el enlace al portal de declaración que daba error.
- Videos de cuarta categoría: se sustituyó el video problemático y se añadió otro video; los tres incluyen reproducción integrada y enlace directo a YouTube.
- Guía tributaria ampliada con atribución del 50% del gasto de alquiler al cónyuge/concubino(a), ejemplo numérico, determinación integral de rentas de cuarta, quinta y fuente extranjera, deducciones, escala, créditos y saldo anual.
- Importación Excel: botón para guardar en bloque todos los casos del archivo en el historial. Cada registro conserva la fila original para reabrirlo, modificarlo y generar su Formulario 709. Se permite eliminar un caso individual o eliminar únicamente el bloque de un archivo Excel.
- Los importes de los formularios de detalle se capturan como texto numérico sin flechas de incremento.

Los videos dependen de que YouTube permita la reproducción embebida en el navegador/red de la institución. El PDF y los cálculos siguen siendo material académico no oficial y requieren contraste con las instrucciones SUNAT del ejercicio correspondiente.


## Ajustes de presentación y liquidación — 31/10/2026
- Se sustituyeron los minigráficos de la sección de cálculo por fichas didácticas que explican rentas de cuarta, quinta, fuente extranjera y combinadas.
- La vista del ejemplo de liquidación volvió a un visor PDF ampliable.
- La guía anual ahora presenta un mapa secuencial desplegable con las normas relacionadas en cada etapa.
- Se retiraron el esquema resumido y los avisos repetidos del cierre de la guía.
- Se ajustó la composición de datos personales del PDF generado para conservar los bordes y divisiones de la tabla; se evita cubrir celdas completas.
- Se reforzó la acción de historial para generar y abrir el Formulario 709 del caso seleccionado.
- El equipo de trabajo se ubicó en el panel rosado y se corrigió el orden del nombre de la docente.


Actualización visual de cierre (31/10/2026): se simplificó el apartado Cálculo de rentas para evitar tarjetas repetidas; se incorporaron ilustraciones SVG originales y diferenciadas por categoría; se reorganizó el mapa de determinación anual y el apartado Acerca del proyecto; se reforzó la apertura del Formulario 709 desde el historial, con vista previa y pestaña nueva.


## Actualización 01/11/2026 · Deducciones y Formulario 709
- Los campos de gastos adicionales muestran en vivo el importe calculado por porcentaje: alquiler 30%, restaurantes/hoteles 15%, médicos/odontólogos 30%, servicios profesionales/oficios 30% y EsSalud del hogar 100%.
- Se muestra el total de deducciones calculadas y el importe considerado en la liquidación, aplicando el límite conjunto de 3 UIT y la renta disponible.
- El detalle anual separa los gastos declarados, el cálculo porcentual informativo y la deducción adicional global efectivamente aplicada.
- El botón «Ver Formulario 709» abre una página independiente del caso guardado, genera el PDF, lo presenta en un visor y ofrece descarga.


## Reparación integral de importación, historial y UIT

Esta versión conserva `templates/auth.html`, la ruta de acceso, la página de inicio y el menú de usuario del ZIP original. Se añadieron:

- Consulta de UIT por ejercicio desde 2023, con valores oficiales históricos de referencia y consulta a SUNAT para ejercicios nuevos.
- Endpoint `/api/cases/bulk` para guardar todo un Excel en una sola transacción; evita que se interrumpa el guardado a mitad del bloque.
- Persistencia de `excelBatchId` y `excelRow` para volver a abrir y editar casos importados desde el historial.
- Plantilla vacía `static/docs/plantilla_llenado_tributuanalisis.xlsx` y archivo de muestra de 12 casos.
- Cálculo orientativo de porcentajes de gastos de la hoja `DETALLE_3UIT`.

### Inicio local

```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python app.py
```

Abre la URL que muestre Flask y usa `Ctrl + F5` para evitar archivos JavaScript antiguos en caché.

### Comprobaciones de funcionamiento en la instalación local

1. Abrir `/acceso`, crear una cuenta de prueba e iniciar sesión.
2. Abrir el menú de usuario; comprobar cambio de contraseña y cierre de sesión.
3. Descargar la plantilla vacía, llenar dos filas en `Base_Datos` y subirla desde Importar Excel.
4. Analizar, guardar el bloque completo y abrir Historial. Deben aparecer ambos casos y el bloque Excel.
5. Editar un caso importado y volver a guardarlo; debe actualizar el mismo registro.
6. Eliminar un caso y después eliminar un bloque de Excel; los casos manuales y otros bloques deben permanecer.
7. Cambiar de ejercicio y comprobar el importe UIT mostrado.

La revisión automática de este paquete cubrió sintaxis Python/JavaScript, plantillas Jinja, estructura de Excel, archivos de inicio de sesión y presencia de los recursos de la página de inicio. La prueba completa con servidor Flask debe ejecutarse en el equipo local, donde están instaladas las dependencias.


## UIT histórica y resultados de importación (revisión de noviembre 2026)

- UIT oficial usada por ejercicio: 2023 S/ 4,950; 2024 S/ 5,150; 2025 S/ 5,350; 2026 S/ 5,500. Para ejercicios publicados se usan estos importes contrastados; la consulta SUNAT queda reservada a ejercicios nuevos.
- La importación calcula en servidor la renta neta, deducción de 7 UIT, deducción adicional por gastos efectivamente pagados (porcentaje según tipo y tope conjunto 3 UIT), escala progresiva, créditos y saldo. El Excel no determina ni suministra la UIT.
- Los casos se guardan con impuesto anual, saldo a favor del fisco/contribuyente y orientación de obligación de FV 709; ya no se guardan automáticamente con S/ 0.00.
- El historial muestra el saldo y la orientación de presentación, no confunde el impuesto anual con el importe por regularizar.
- La hoja `RESULTADOS_ESPERADOS` contiene los 12 resultados ficticios del archivo de muestra; `LIQUIDACION_REFERENCIAL` contiene importes de casilleros orientativos.

### Criterio orientativo de obligación FV 709

Para Renta 2025 se evalúan los supuestos publicados por SUNAT: deuda por pagar; aplicación de saldos a favor anteriores; saldo a favor en rentas de cuarta o cuarta/quinta, incluyendo fuente extranjera que se suma a estas; atribución de gastos de alquiler al cónyuge/concubino; y exclusivamente quinta categoría con saldo a favor por deducción de alquiler/subarrendamiento. Para exclusiva quinta sin esos supuestos, el empleador retiene y paga el impuesto, y no se presenta declaración anual; se consideran también solicitudes de devolución de retenciones en exceso conforme al artículo 79 de la LIR.

La clasificación es una ayuda académica basada en los datos cargados. No sustituye la verificación de comprobantes, requisitos de deducción, rentas adicionales, información personalizada SUNAT ni el criterio de la norma aplicable al ejercicio.


Fuentes normativas oficiales de referencia:
- UIT SUNAT: https://www.sunat.gob.pe/indicestasas/uit.html
- Quiénes deben declarar (Renta 2025): https://renta.sunat.gob.pe/personas/quienes-deben-declarar-el-impuesto-la-renta
- Preguntas frecuentes Renta 2025, incluida quinta categoría exclusiva: https://renta.sunat.gob.pe/preguntas
- Ley del Impuesto a la Renta, artículo 79: https://www.sunat.gob.pe/legislacion/renta/ley/capxi.pdf
- Deducción adicional de rentas de trabajo: https://renta.sunat.gob.pe/personas/deduccion-adicional-para-rentas-de-trabajo
