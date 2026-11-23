// Frontend del pronóstico: consulta la API y dibuja gráfica, indicadores y tabla.
// Todas las horas llegan en UTC (terminan en "Z") y se muestran en hora de Colombia.

const ZONA = "America/Bogota";
const formatoHora = new Intl.DateTimeFormat("es-CO", {
  timeZone: ZONA, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
});
const formatoNumero = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

const $ = (id) => document.getElementById(id);
let grafica = null;
let unidad = "";

const aHoraColombia = (isoUtc) => formatoHora.format(new Date(isoUtc));
const num = (v) => formatoNumero.format(v) + (unidad ? ` ${unidad}` : "");

async function pedirJSON(url) {
  let respuesta;
  try {
    respuesta = await fetch(url);
  } catch {
    throw new Error("No se pudo conectar con la API. ¿Está corriendo uvicorn o el contenedor?");
  }
  let datos = null;
  try { datos = await respuesta.json(); } catch { /* respuesta sin JSON */ }
  if (!respuesta.ok) {
    const detalle = datos && datos.detail ? datos.detail : `HTTP ${respuesta.status}`;
    throw new Error(typeof detalle === "string" ? detalle : JSON.stringify(detalle));
  }
  return datos;
}

function mostrarError(mensaje) {
  const caja = $("error");
  if (!mensaje) { caja.hidden = true; caja.textContent = ""; return; }
  caja.hidden = false;
  caja.textContent = "⚠️ " + mensaje;
}

async function cargarSalud() {
  const insignia = $("salud");
  try {
    const s = await pedirJSON("/api/salud");
    unidad = "";
    if (s.field) $("titulo-grafica").textContent = `Histórico y pronóstico · ${s.measurement} / ${s.field}`;
    const listo = s.modelo_cargado && (s.influx_configurado || s.modo_demo);
    const etiqueta = s.modo_demo ? "MODO DEMO" : (listo ? "Servicio OK" : "Configuración incompleta");
    insignia.textContent = `${etiqueta} · atendido por ${s.atendido_por}`;
    insignia.className = "insignia " + (listo && !s.modo_demo ? "ok" : "alerta");
  } catch (e) {
    insignia.textContent = "Servicio no disponible";
    insignia.className = "insignia alerta";
  }
}

async function cargarModelo() {
  try {
    const m = await pedirJSON("/api/modelo");
    const orden = `SARIMA(${m.order.join(",")})×(${m.seasonal_order.join(",")})`;
    const mae = m.metricas_test && m.metricas_test.MAE != null ? ` · MAE prueba: ${formatoNumero.format(m.metricas_test.MAE)}` : "";
    const fecha = m.entrenado_en ? ` · entrenado: ${m.entrenado_en}` : "";
    $("modelo").textContent = `${orden}${mae}${fecha}`;
  } catch (e) {
    $("modelo").textContent = "Sin información del modelo: " + e.message;
  }
}

function pintarIndicadores(datos) {
  const pred = datos.prediccion;
  const proxima = pred[0];
  const maximo = pred.reduce((a, b) => (b.prediccion > a.prediccion ? b : a));
  const minimo = pred.reduce((a, b) => (b.prediccion < a.prediccion ? b : a));

  $("ind-proxima").textContent = num(proxima.prediccion);
  $("ind-proxima-det").textContent =
    `${aHoraColombia(proxima.tiempo)} · entre ${num(proxima.limite_inferior)} y ${num(proxima.limite_superior)}`;
  $("ind-maximo").textContent = num(maximo.prediccion);
  $("ind-maximo-det").textContent = `a las ${aHoraColombia(maximo.tiempo)}`;
  $("ind-minimo").textContent = num(minimo.prediccion);
  $("ind-minimo-det").textContent = `a las ${aHoraColombia(minimo.tiempo)}`;
  $("ind-ultimo").textContent = aHoraColombia(datos.ultima_observacion);

  const rellenadas = $("ind-rellenadas");
  rellenadas.textContent = datos.horas_rellenadas > 0
    ? `${datos.horas_rellenadas} h sin dato fueron rellenadas: el pronóstico es menos confiable`
    : "Sin horas faltantes en el contexto";
  rellenadas.className = "detalle" + (datos.horas_rellenadas > 0 ? " alerta" : "");
}

function pintarTabla(pred) {
  $("filas").innerHTML = pred.map((p) => `
    <tr><td>${aHoraColombia(p.tiempo)}</td><td>${num(p.prediccion)}</td>
    <td>${num(p.limite_inferior)}</td><td>${num(p.limite_superior)}</td></tr>`).join("");
}

function pintarGrafica(datos) {
  const hist = datos.historico;
  const pred = datos.prediccion;
  const etiquetas = [...hist, ...pred].map((p) => aHoraColombia(p.tiempo));
  const vacios = (n) => Array(n).fill(null);
  const ultimo = hist.length ? hist[hist.length - 1].valor : null;

  // El pronóstico arranca en el último punto real para que la línea quede unida.
  const unirConHistorico = (valores) => [...vacios(Math.max(hist.length - 1, 0)), ultimo, ...valores];
  const serieHist = [...hist.map((p) => p.valor), ...vacios(pred.length)];
  const seriePred = hist.length ? unirConHistorico(pred.map((p) => p.prediccion)) : pred.map((p) => p.prediccion);
  const serieInf = hist.length ? unirConHistorico(pred.map((p) => p.limite_inferior)) : pred.map((p) => p.limite_inferior);
  const serieSup = hist.length ? unirConHistorico(pred.map((p) => p.limite_superior)) : pred.map((p) => p.limite_superior);
  const pct = Math.round(datos.confianza * 100);

  const config = {
    type: "line",
    data: {
      labels: etiquetas,
      datasets: [
        { label: "Histórico", data: serieHist, borderColor: "#facc15", backgroundColor: "#facc15", pointRadius: 0, borderWidth: 2 },
        { label: `Límite inferior (${pct} %)`, data: serieInf, borderColor: "rgba(56,189,248,0.3)", pointRadius: 0, borderWidth: 1, fill: false },
        { label: `Intervalo de confianza ${pct} %`, data: serieSup, borderColor: "rgba(56,189,248,0.3)", backgroundColor: "rgba(56,189,248,0.18)", pointRadius: 0, borderWidth: 1, fill: "-1" },
        { label: "Pronóstico", data: seriePred, borderColor: "#38bdf8", backgroundColor: "#38bdf8", borderDash: [6, 4], pointRadius: 2, borderWidth: 2 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { ticks: { color: "#94a3b8", maxTicksLimit: 12 }, grid: { color: "#1f2a3d" } },
        y: { ticks: { color: "#94a3b8" }, grid: { color: "#1f2a3d" } },
      },
      plugins: {
        legend: { labels: { color: "#e2e8f0", filter: (item) => !item.text.startsWith("Límite inferior") } },
        tooltip: { callbacks: { label: (c) => c.raw == null ? null : `${c.dataset.label}: ${num(c.raw)}` } },
      },
    },
  };

  if (grafica) grafica.destroy();
  grafica = new Chart($("grafica"), config);
}

async function cargarPronostico() {
  const boton = $("actualizar");
  boton.disabled = true;
  boton.textContent = "Consultando…";
  mostrarError(null);
  const params = new URLSearchParams({
    horas: $("horas").value,
    historia: $("historia").value,
    confianza: $("confianza").value,
  });
  try {
    const datos = await pedirJSON(`/api/prediccion?${params}`);
    if (!datos.prediccion || datos.prediccion.length === 0) throw new Error("La API no devolvió pronóstico.");
    pintarIndicadores(datos);
    pintarGrafica(datos);
    pintarTabla(datos.prediccion);
  } catch (e) {
    mostrarError(e.message);
  } finally {
    boton.disabled = false;
    boton.textContent = "Actualizar";
  }
}

$("actualizar").addEventListener("click", cargarPronostico);
["horas", "historia", "confianza"].forEach((id) => $(id).addEventListener("change", cargarPronostico));

cargarSalud();
cargarModelo();
cargarPronostico();
