require('dotenv').config();
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');

async function run() {
  const conn = await mysql.createConnection({
    host: 'localhost', user: 'root', password: 'Diego85m.', database: 'fl_snf_db'
  });

  // 1. Get obra@gmail.com user
  const [[user]] = await conn.query("SELECT id FROM usuarios WHERE usuario='obra@gmail.com'");
  const userId = user.id;
  console.log('👤 Usuario:', userId);

  // 2. Check if user already has an obra
  const [[existing]] = await conn.query("SELECT obra_id FROM usuarios WHERE id=?", [userId]);
  let obraId = existing.obra_id;

  if (!obraId) {
    obraId = uuidv4();
    await conn.query(`
      INSERT INTO obras (id, nombre_obra, rfc, estado, direccion, telefono, correo, personalidad_juridica, donataria, activo, creado_por)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `, [obraId, 'Centro Comunitario San Ignacio', 'CSI850312AB3', 'Jalisco',
        'Av. Hidalgo 1234, Col. Centro, Zapopan, Jalisco', '(33) 3615-4200',
        'director@sanignacio.org.mx', 'Asociación Civil', 'si', userId]);
    await conn.query("UPDATE usuarios SET obra_id=? WHERE id=?", [obraId, userId]);
    console.log('🏛️  Obra creada:', obraId);
  } else {
    console.log('🏛️  Obra existente:', obraId);
  }

  // 3. Build sondeo_general form data
  const formData = {
    // Datos Obra - Generales
    nombreObra: 'Centro Comunitario San Ignacio',
    rfc: 'CSI850312AB3',
    estado: 'Jalisco',
    direccionSede: 'Av. Hidalgo 1234, Col. Centro, Zapopan, Jalisco',
    telefonoLocal: '(33) 3615-4200',
    personalidadJuridica: 'Asociación Civil',
    donataria: 'si',
    // Planeación
    fechaPlaneacion: '2024-02-15',
    periodoPlaneacion: '2024 – 2026',
    mision: 'Promover el desarrollo integral de las personas en situación de vulnerabilidad mediante programas educativos, alimentarios y de salud comunitaria, con un enfoque ignaciano.',
    vision: 'Ser una obra referente de transformación social en Jalisco, donde cada persona pueda desarrollar su pleno potencial en dignidad y equidad.',
    objetivoGeneral: 'Mejorar la calidad de vida de 2,500 personas en situación de pobreza extrema de Zapopan a través de programas integrales de desarrollo humano y comunitario para el periodo 2024-2026.',
    objetivosEstrategicos: '1. Fortalecer el programa de alimentación para garantizar tres comidas diarias a 800 niñas y niños.\n2. Ampliar la cobertura del programa de educación básica a 300 adultos mayores.\n3. Desarrollar 5 talleres de capacitación laboral por año para jóvenes en vulnerabilidad.\n4. Consolidar alianzas con 10 instituciones de salud para atención preventiva.',
    // Contactos
    directorNombre: 'Pbro. Javier Morales Ruiz SJ',
    directorTel: '+52 33 3615-4201',
    directorCorreo: 'director@sanignacio.org.mx',
    adminNombre: 'Lic. Patricia Sánchez Torres',
    adminTel: '+52 33 3615-4202',
    adminCorreo: 'administracion@sanignacio.org.mx',
    proyNombre: 'Ing. Roberto Fuentes Díaz',
    proyTel: '+52 33 3615-4203',
    proyCorreo: 'proyectos@sanignacio.org.mx',
    llenadoNombre: 'Lic. Ana Karen Reyes',
    llenadoTel: '+52 33 3615-4204',
    llenadoCorreo: 'obra@gmail.com',
    // Colaboradores
    numJesuitas: '3',
    numSacerdotes: '1',
    numReligiosos: '4',
    numLaicos: '42',
    totalColaboradores: '50',
    // Comunicación
    respContenidos: 'Daniela Vázquez López',
    respContenidosTel: '+52 33 3615-4205',
    respContenidosCorreo: 'comunicacion@sanignacio.org.mx',
    frecuenciaPublicaciones: '1 o 2 veces por semana',
    formatoRedes: 'si',
    formatoFotos: 'si',
    permisoImagenes: 'si',
    compartirMaterial: 'si',
    // Presupuesto
    presupuestoAnual: '4850000',
    // Proyectos Vigentes - Proyecto 1
    'pv1-nombre': 'Programa de Alimentación Infantil',
    'pv1-temporalidad': 'Enero 2025 – Diciembre 2025',
    'pv1-causa': 'Alimentación',
    'pv1-tematicas': 'Seguridad alimentaria, nutrición infantil, desnutrición',
    'pv1-responsable': 'Lic. Patricia Sánchez Torres',
    'pv1-tel': '+52 33 3615-4202',
    'pv1-correo': 'administracion@sanignacio.org.mx',
    'pv1-objetivo': 'Garantizar la alimentación nutritiva diaria de 800 niñas y niños de 0 a 12 años en situación de pobreza extrema del municipio de Zapopan.',
    'pv1-realidad': 'En la zona de intervención, el 38% de los menores presenta algún grado de desnutrición crónica. Las familias destinan más del 70% de su ingreso a alimentación sin lograr cubrir los requerimientos nutricionales mínimos.',
    'pv1-descripcion': 'Se ofrecen tres comidas balanceadas al día en el comedor comunitario, con menús diseñados por nutriólogas. Se incluyen talleres de educación alimentaria para madres y padres de familia.',
    'pv1-benef-directos': '800',
    'pv1-benef-indirectos': '3200',
    'pv1-carac-pobl': 'Niñas y niños de 0 a 12 años pertenecientes a familias en pobreza extrema. El 65% son hijos de madres solteras. El 20% presenta rezago escolar asociado a desnutrición.',
    'pv1-metrica': 'Se realizó un censo comunitario puerta a puerta en las colonias de intervención. Se validó con datos del CONEVAL y registros del DIF municipal.',
    'pv1-lugar': 'Estado: Jalisco, Municipio: Zapopan, Colonias: El Colli, Lomas del Paraíso, Atemajac del Valle',
    'pv1-resultados': '1. 800 menores con alimentación diaria garantizada. 2. Reducción del 25% en índices de desnutrición. 3. 200 madres/padres capacitados en nutrición.',
    'pv1-obj-estrategico': 'Objetivo estratégico 1: Fortalecer el programa de alimentación para garantizar tres comidas diarias a 800 niñas y niños.',
    // Proyectos Vigentes - Proyecto 2
    'pv2-nombre': 'Talleres de Capacitación Laboral para Jóvenes',

    'pv2-temporalidad': 'Marzo 2025 – Noviembre 2025',
    'pv2-causa': 'Educación',
    'pv2-tematicas': 'Inserción laboral, habilidades técnicas, emprendimiento social',
    'pv2-responsable': 'Ing. Roberto Fuentes Díaz',
    'pv2-tel': '+52 33 3615-4203',
    'pv2-correo': 'proyectos@sanignacio.org.mx',
    'pv2-objetivo': 'Desarrollar habilidades técnicas y socioemocionales en 150 jóvenes de 16 a 29 años para facilitar su inserción al mercado laboral formal.',
    'pv2-realidad': 'El 42% de los jóvenes en las colonias de intervención no estudia ni trabaja. La falta de habilidades técnicas certificadas es la principal barrera de inserción laboral.',
    'pv2-descripcion': 'Se imparten 5 talleres de 3 meses en: electricidad residencial, costura, gastronomía, computación y carpintería. Al finalizar se conecta a los participantes con empresas aliadas.',
    'pv2-benef-directos': '150',
    'pv2-benef-indirectos': '600',
    'pv2-carac-pobl': 'Jóvenes de 16 a 29 años sin empleo formal ni estudios en curso. El 55% son mujeres. El 30% son jefas o jefes de hogar.',
    'pv2-metrica': 'Registro en base de datos propia, validado con encuesta de caracterización socioeconómica aplicada al inicio del taller.',
    'pv2-lugar': 'Estado: Jalisco, Municipio: Zapopan, Centro Comunitario San Ignacio',
    'pv2-resultados': '1. 150 jóvenes certificados en algún oficio. 2. 70% de colocación laboral en los 3 meses siguientes. 3. 5 convenios con empresas locales.',
    'pv2-obj-estrategico': 'Objetivo estratégico 3: Desarrollar 5 talleres de capacitación laboral por año para jóvenes en vulnerabilidad.',
    // Proyectos Vigentes - Proyecto 3
    'pv3-nombre': 'Programa de Alfabetización para Adultos Mayores',
    'pv3-temporalidad': 'Febrero 2025 – Noviembre 2025',
    'pv3-causa': 'Educación',
    'pv3-tematicas': 'Alfabetización, lecto-escritura, inclusión digital básica',
    'pv3-responsable': 'Mtra. Lucía Flores Andrade',
    'pv3-tel': '+52 33 3615-4206',
    'pv3-correo': 'educacion@sanignacio.org.mx',
    'pv3-objetivo': 'Lograr la alfabetización funcional de 300 adultos mayores de 60 años o más que no saben leer ni escribir, fortaleciendo su autonomía y participación social.',
    'pv3-realidad': 'El 29% de los adultos mayores en la zona de intervención es analfabeta funcional. Esta condición limita su acceso a trámites de salud, seguridad social y vida comunitaria, generando dependencia y exclusión social.',
    'pv3-descripcion': 'Se imparten clases tres veces por semana en grupos de 15 personas. El método pedagógico es participativo y contextualizado. Al finalizar el ciclo se certifica a los participantes ante el INEA.',
    'pv3-benef-directos': '300',
    'pv3-benef-indirectos': '900',
    'pv3-carac-pobl': 'Adultos mayores de 60 años o más sin educación formal. El 72% son mujeres. El 40% vive sola. El 35% tiene condiciones de salud crónicas que dificultan el desplazamiento.',
    'pv3-metrica': 'Diagnóstico inicial aplicado por facilitadores del INEA en coordinación con la Obra. Se cruzan datos con el padrón municipal de adultos mayores.',
    'pv3-lugar': 'Estado: Jalisco, Municipio: Zapopan, Centro Comunitario San Ignacio y 3 sedes comunitarias en colonias aledañas',
    'pv3-resultados': '1. 300 adultos mayores certificados ante el INEA. 2. 80% de los participantes capaces de firmar y leer documentos básicos. 3. Formación de 5 círculos de lectura permanentes.',
    'pv3-obj-estrategico': 'Objetivo estratégico 2: Ampliar la cobertura del programa de educación básica a 300 adultos mayores.',
    // Proyectos Vigentes - Proyecto 4
    'pv4-nombre': 'Red de Apoyo a Mujeres Jefas de Hogar',
    'pv4-temporalidad': 'Enero 2025 – Diciembre 2025',
    'pv4-causa': 'Desarrollo Comunitario',
    'pv4-tematicas': 'Empoderamiento femenino, microfinanzas, desarrollo de habilidades, redes de apoyo',
    'pv4-responsable': 'Lic. Mariana Espinoza Robles',
    'pv4-tel': '+52 33 3615-4207',
    'pv4-correo': 'mujeres@sanignacio.org.mx',
    'pv4-objetivo': 'Fortalecer la autonomía económica y el bienestar integral de 200 mujeres jefas de hogar mediante formación en finanzas personales, emprendimiento y acompañamiento psicosocial.',
    'pv4-realidad': 'El 28% de los hogares atendidos está encabezado por mujeres solas. Muchas enfrentan violencia económica, falta de empleo formal y aislamiento social. El acceso a crédito formal es prácticamente nulo para este grupo.',
    'pv4-descripcion': 'Se conforman grupos solidarios de 20 mujeres que reciben talleres de educación financiera, ahorro y microcrédito. Paralelamente se ofrece acompañamiento psicológico individual y grupal, y se facilita la creación de microempresas familiares.',
    'pv4-benef-directos': '200',
    'pv4-benef-indirectos': '800',
    'pv4-carac-pobl': 'Mujeres de 25 a 55 años que son jefas de hogar sin pareja. El 60% tiene hijos menores de 12 años a cargo. El 45% no terminó la secundaria. El 30% ha vivido situaciones de violencia doméstica.',
    'pv4-metrica': 'Registro propio de la Obra complementado con datos del DIF y la Fiscalía Estatal. Se aplica encuesta de caracterización al inicio del programa.',
    'pv4-lugar': 'Estado: Jalisco, Municipio: Zapopan, Centro Comunitario San Ignacio',
    'pv4-resultados': '1. 200 mujeres con plan de ahorro activo. 2. 40 microempresas familiares iniciadas. 3. Reducción del 35% en indicadores de estrés financiero reportados.',
    'pv4-obj-estrategico': 'Objetivo estratégico 3 y 4: Capacitación laboral y alianzas institucionales para el desarrollo de mujeres en vulnerabilidad.',
    // Proyectos Financiar - Proyecto 1
    'pf1-nombre': 'Centro de Salud Preventiva Comunitaria',
    'pf1-temporalidad': 'Enero 2026 – Diciembre 2026',
    'pf1-causa': 'Salud',
    'pf1-tematicas': 'Salud preventiva, detección temprana, atención primaria',
    'pf1-responsable': 'Dr. Carlos Ibáñez Mendoza',
    'pf1-tel': '+52 33 3615-4210',
    'pf1-correo': 'salud@sanignacio.org.mx',
    'pf1-objetivo': 'Establecer un centro de salud preventiva con consultas médicas, odontológicas y psicológicas gratuitas para 1,200 personas sin acceso a servicios de salud en Zapopan.',
    'pf1-realidad': 'El 45% de la población atendida no cuenta con derechohabiencia. Las enfermedades crónicas no diagnosticadas afectan al 28% de los adultos mayores en la zona.',
    'pf1-descripcion': 'Se habilitará un espacio de 180 m² con 4 consultorios (medicina general, odontología, psicología y nutrición) con equipo médico básico y medicamentos esenciales.',
    'pf1-benef-directos': '1200',
    'pf1-benef-indirectos': '4800',
    'pf1-carac-pobl': 'Adultos mayores, mujeres embarazadas y personas con enfermedades crónicas sin derechohabiencia. El 60% vive con menos de $3,000 mensuales.',
    'pf1-metrica': 'Diagnóstico comunitario realizado con la Universidad de Guadalajara y datos del IMSS/ISSSTE sobre cobertura de derechohabiencia.',
    'pf1-lugar': 'Estado: Jalisco, Municipio: Zapopan, Colonias: El Colli, Lomas del Paraíso, Nueva Santa María',
    'pf1-resultados': '1. 1,200 personas atendidas con al menos una consulta al año. 2. Detección temprana de 200 casos de enfermedades crónicas. 3. 12 brigadas comunitarias de salud.',
    'pf1-obj-estrategico': 'Objetivo estratégico 4: Consolidar alianzas con instituciones de salud para atención preventiva.',
    // Necesidades Materiales
    retosUrgentes: 'La camioneta de transporte de alimentos (modelo 2015) presenta fallas mecánicas recurrentes en motor y frenos, poniendo en riesgo la distribución del programa alimentario. El edificio principal requiere impermeabilización urgente pues las filtraciones dañan el área de comedor. 8 computadoras del área de capacitación están obsoletas y no soportan el software requerido.',
    necesidadesPrevistas: 'Para el segundo semestre de 2025 se estima un incremento del 30% en beneficiarios del comedor, requiriendo ampliar la cocina con equipo industrial adicional. También se prevé mobiliario para 3 aulas adicionales del programa de capacitación.',
    // Contexto Demográfico
    tipoPoblacion: 'mixta',
    tamanoPoblacion: 'La zona de intervención abarca aproximadamente 85,000 habitantes distribuidos en 12 colonias de Zapopan. En los últimos 5 años se ha observado un crecimiento del 12%, principalmente por migración interna de municipios rurales de Jalisco y estados del sur del país.',
    grupoPrincipal: 'El principal grupo poblacional son niñas y niños de 0 a 12 años (35% de la población atendida), seguido de mujeres adultas jefas de hogar (28%) y adultos mayores (22%). También se atiende a jóvenes en situación de riesgo social (15%).',
    tamanoFamilias: '4.2 personas por familia',
    situacionSocioeconomica: 'El 68% de las familias vive en pobreza moderada y el 22% en pobreza extrema (CONEVAL 2022). Las principales actividades económicas son comercio informal, trabajo doméstico y construcción. El ingreso promedio familiar es de $6,800 mensuales.',
    condicionesEducativas: 'La tasa de alfabetización en adultos mayores es del 71%, con brecha de género (hombres 82%, mujeres 62%). El 18% de los menores de 6-14 años presenta rezago educativo. La deserción escolar en secundaria alcanza el 25%.',
    oportunidadesRecreacion: 'La zona cuenta con 3 parques urbanos, 2 canchas deportivas y 1 biblioteca comunitaria. El 60% de los jóvenes reporta no tener acceso a actividades recreativas estructuradas por falta de recursos. No hay internet en el 45% de los hogares.',
    empleoDesempleo: 'La tasa de desempleo abierto es del 8.3%, pero el empleo informal alcanza el 62% de la PEA. Las principales actividades son construcción (30%), comercio (25%), manufactura (20%) y servicios domésticos (25%). El salario promedio informal es 1.8 veces el salario mínimo.',
    condicionesSalud: 'La esperanza de vida es de 72 años. La mortalidad infantil es de 18 por cada 1,000 nacidos vivos. El 35% de los adultos mayores padece diabetes y/o hipertensión sin tratamiento continuo. Solo el 55% tiene acceso a servicios de salud pública.',
    enfermedadesComunes: 'Diabetes mellitus tipo 2 (28% en mayores de 40 años), hipertensión arterial (24%), obesidad infantil (32% en menores de 12 años), infecciones respiratorias agudas (primera causa en menores de 5 años) y desnutrición crónica (18% en menores de 5 años).',
    accesoServicios: 'El 92% de los hogares cuenta con agua potable (suministro intermitente, 12 hrs/día). El 98% tiene electricidad. El 35% de las viviendas presenta hacinamiento. Las vías de comunicación son adecuadas con acceso a transporte público.',
    identidadCultural: 'La comunidad celebra festividades patronales importantes. Existe una rica tradición artesanal de tejido y alfarería. Las comunidades de migrantes mantienen vínculos culturales con sus comunidades de origen mediante fiestas y tradiciones gastronómicas.',
    comunidadesIndigenas: 'Náhuatl (Guerrero y Michoacán), Mixteco (Oaxaca), Wixáritari (Nayarit y Jalisco)',
    poblacionIndigena: '340 personas',
    lenguasIndigenas: 'Náhuatl, Mixteco, Wixárika',
    tasaMigracion: 'El 15% de la población adulta ha migrado internamente al menos una vez. El 8% tiene experiencia de migración a EUA. La tasa de retorno ha aumentado un 12% en los últimos 3 años.',
    tendenciasMigracion: 'Creciente migración rural-urbana desde municipios del sur de Jalisco y estados de Guerrero, Oaxaca y Michoacán. La Obra atiende familias en proceso de asentamiento que enfrentan barreras de integración social y laboral.',
    razonesMigracion: 'Búsqueda de empleo mejor remunerado (65%), inseguridad y violencia en comunidades de origen (20%), reunificación familiar (10%) y acceso a servicios educativos y de salud (5%).',
    politicasMigratorias: 'El DIF municipal ofrece atención psicosocial a familias migrantes. La Obra colabora con el programa "Bienvenido a Casa" del gobierno estatal para orientación e integración de familias retornadas.',
    notasContexto: 'La zona presenta alta densidad de organizaciones civiles, facilitando el trabajo en red. La Obra tiene alianzas estratégicas con la UdeG, el ITESO y Cruz Roja Jalisco.',
    // Impacto
    calidadVida: 'El 78% de las familias beneficiarias reporta mejora significativa en su calidad de vida. El indicador de seguridad alimentaria aumentó del 35% al 67% en hogares participantes. El acceso a educación mejoró en un 40% para adultos mayores beneficiarios del programa de alfabetización.',
    habilidades: 'Los beneficiarios del programa de capacitación laboral tienen un 68% de colocación laboral en los primeros 3 meses. Las madres de familia aplican conocimientos de nutrición para mejorar la alimentación familiar. Los jóvenes reportan mayor autoestima y habilidades de comunicación.',
    impactoEducacion: 'Se han alfabetizado 420 adultos mayores en 2 años. El programa de refuerzo escolar redujo la deserción en un 30% en colonias de intervención. Los talleres de educación alimentaria llegaron a 600 familias.',
    cohesionSocial: 'Se han formado 8 redes vecinales de apoyo mutuo. El índice de confianza institucional aumentó del 42% al 71% (encuesta 2024). Las familias migrantes reportan mayor integración social gracias a los espacios de encuentro comunitario.',
    infraestructura: 'Se rehabilitaron 2 aulas del centro comunitario. Se instaló sistema de captación de agua de lluvia que abastece el 40% de las necesidades del comedor. El área de cocina cuenta con certificación de manejo higiénico de alimentos desde 2023.',
    impactoSalud: 'Las brigadas de salud han atendido a 3,200 personas en 2 años, detectando 180 casos de diabetes no diagnosticada y 210 de hipertensión. La tasa de desnutrición infantil bajó del 24% al 18%. Se logró vacunación completa del 92% de menores de 5 años.',
    impactoEconomico: 'Los participantes del programa laboral reportan un incremento del 45% en sus ingresos. Se han apoyado 23 microempresas familiares que generan 2.3 empleos adicionales en promedio. El ahorro familiar por alimentación subsidiada es de $1,800 mensuales.',
    comentariosImpacto: 'El modelo de intervención integral (alimentación + educación + salud + capacitación) ha demostrado mayor efectividad que los enfoques sectoriales. La presencia jesuita y el enfoque ignaciano generan confianza y permanencia de los beneficiarios.'
  };

  const sondeoData = {
    formData,
    completedSections: ['datosObra','presupuesto','proyectosVigentes','proyectosFinanciar','necesidadesMateriales','contextoDemografico','impacto'],
    timestamp: new Date().toISOString()
  };

  // 4. Insert formulario sondeo_general
  await conn.query(`
    INSERT INTO formularios (obra_id, form_key, datos, actualizado_por)
    VALUES (?, 'sondeo_general', ?, ?)
    ON DUPLICATE KEY UPDATE datos=VALUES(datos), actualizado_por=VALUES(actualizado_por), fecha_actualizacion=NOW()
  `, [obraId, JSON.stringify(sondeoData), userId]);
  console.log('📋 Formulario sondeo_general insertado');

  // 5. Insert proyectos vigentes
  await conn.query(`DELETE FROM proyectos WHERE obra_id=?`, [obraId]);

  await conn.query(`INSERT INTO proyectos (obra_id, tipo, datos, creado_por) VALUES (?, 'vigente', ?, ?)`,
    [obraId, JSON.stringify({
      nombre: 'Programa de Alimentación Infantil',
      temporalidad: 'Enero 2025 – Diciembre 2025',
      causa: 'Alimentación',
      responsable: 'Lic. Patricia Sánchez Torres',
      beneficiadosDirectos: 800,
      presupuesto: 1800000
    }), userId]);

  await conn.query(`INSERT INTO proyectos (obra_id, tipo, datos, creado_por) VALUES (?, 'vigente', ?, ?)`,
    [obraId, JSON.stringify({
      nombre: 'Talleres de Capacitación Laboral para Jóvenes',
      temporalidad: 'Marzo 2025 – Noviembre 2025',
      causa: 'Educación',
      responsable: 'Ing. Roberto Fuentes Díaz',
      beneficiadosDirectos: 150,
      presupuesto: 650000
    }), userId]);

  await conn.query(`INSERT INTO proyectos (obra_id, tipo, datos, creado_por) VALUES (?, 'vigente', ?, ?)`,
    [obraId, JSON.stringify({
      nombre: 'Programa de Alfabetización para Adultos Mayores',
      temporalidad: 'Febrero 2025 – Noviembre 2025',
      causa: 'Educación',
      responsable: 'Mtra. Lucía Flores Andrade',
      beneficiadosDirectos: 300,
      presupuesto: 420000
    }), userId]);

  await conn.query(`INSERT INTO proyectos (obra_id, tipo, datos, creado_por) VALUES (?, 'vigente', ?, ?)`,
    [obraId, JSON.stringify({
      nombre: 'Red de Apoyo a Mujeres Jefas de Hogar',
      temporalidad: 'Enero 2025 – Diciembre 2025',
      causa: 'Desarrollo Comunitario',
      responsable: 'Lic. Mariana Espinoza Robles',
      beneficiadosDirectos: 200,
      presupuesto: 380000
    }), userId]);

  await conn.query(`INSERT INTO proyectos (obra_id, tipo, datos, creado_por) VALUES (?, 'financiar', ?, ?)`,
    [obraId, JSON.stringify({
      nombre: 'Centro de Salud Preventiva Comunitaria',
      temporalidad: 'Enero 2026 – Diciembre 2026',
      causa: 'Salud',
      responsable: 'Dr. Carlos Ibáñez Mendoza',
      beneficiadosDirectos: 1200,
      montoRequerido: 2400000
    }), userId]);

  console.log('📁 4 proyectos vigentes insertados');
  console.log('🔍 1 proyecto a financiar insertado');
  console.log('');
  console.log('✅ Todo listo. Login: obra@gmail.com / 5678');
  await conn.end();
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
