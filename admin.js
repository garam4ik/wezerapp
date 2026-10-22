/* GitHub Pages is static: this client-side password is NOT secure authentication.
   Change it to a unique, non-sensitive passphrase before use. */
const ADMIN_PASSWORD = "610624";
const DEFAULT_NOTES = {
  version: "2026-10-22-1",
  title: "Що нового?",
  items: [
    "Додано та повернуто на карту Донецьку область.",
    "Крим, Луганська, Запорізька й Херсонська області виділені світло-червоним.",
    "Збережено звичайний колір і товщину меж районів."
  ]
};
const $ = id => document.getElementById(id);
let original = DEFAULT_NOTES;
async function loadNotes() {
  try {
    const res = await fetch("release-notes.json", { cache: "no-store" });
    if (res.ok) original = await res.json();
  } catch (_) {}
  if (!original || !Array.isArray(original.items)) original = DEFAULT_NOTES;
  fillForm(original);
}
function fillForm(notes) {
  $("version").value = notes.version || "";
  $("title").value = notes.title || "Що нового?";
  $("items").value = (notes.items || []).join("\n");
}
$("login-form").addEventListener("submit", event => {
  event.preventDefault();
  if ($("password").value.trim() !== ADMIN_PASSWORD) {
    $("login-error").hidden = false;
    return;
  }
  $("login-error").hidden = true;
  $("login-card").hidden = true;
  $("editor-card").hidden = false;
  sessionStorage.setItem("wezera-admin-unlocked", "1");
  loadNotes();
});
$("logout").addEventListener("click", () => {
  sessionStorage.removeItem("wezera-admin-unlocked");
  $("editor-card").hidden = true;
  $("login-card").hidden = false;
  $("password").value = "";
});
$("notes-form").addEventListener("submit", event => {
  event.preventDefault();
  const notes = {
    version: $("version").value.trim(),
    title: $("title").value.trim(),
    items: $("items").value.split("\n").map(s => s.trim()).filter(Boolean)
  };
  if (!notes.version || !notes.title || !notes.items.length) {
    $("status").hidden = false;
    $("status").textContent = "Заповни версію, заголовок і хоча б один пункт.";
    return;
  }
  const blob = new Blob([JSON.stringify(notes, null, 2) + "\n"], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "release-notes.json";
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  $("status").hidden = false;
  $("status").textContent = "Файл створено. Тепер заміни release-notes.json у корені GitHub-репозиторію.";
});
$("reset").addEventListener("click", () => fillForm(original));



// Interactive red-territory brush. Export GeoJSON, then upload it to the repository root.
(function setupTerritoryPainter(){
  const mapEl = document.getElementById('draw-map');
  if (!mapEl || typeof L === 'undefined') { window.addEventListener('load', setupTerritoryPainter, {once:true}); return; }
  let painterMap, mode='brush', drawing=false, activeStroke=null, strokes=[], rendered=[];
  const status = document.getElementById('draw-status');
  const say = t => { if(status) status.textContent=t; };
  function pointDistance(a,b){ return painterMap.distance(a,b); }
  function makeCircle(latlng, metres){
    const pts=[]; const earth=6378137, lat=latlng.lat*Math.PI/180, lng=latlng.lng*Math.PI/180, angular=metres/earth;
    for(let i=0;i<20;i++){const bearing=2*Math.PI*i/20;const lat2=Math.asin(Math.sin(lat)*Math.cos(angular)+Math.cos(lat)*Math.sin(angular)*Math.cos(bearing));const lng2=lng+Math.atan2(Math.sin(bearing)*Math.sin(angular)*Math.cos(lat),Math.cos(angular)-Math.sin(lat)*Math.sin(lat2));pts.push([lat2*180/Math.PI,lng2*180/Math.PI]);} pts.push(pts[0]); return pts;
  }
  function strokeLayer(stroke){return L.geoJSON({type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:stroke.flatMap(pt=>makeCircle(pt,pt.radius).map(r=>[[r[1],r[0]]])).map(r=>r)}},{style:{color:'#f3a0a0',weight:0,fillColor:'#f04444',fillOpacity:0.82,interactive:false}});}
  // Represent each brush stamp as an independent polygon so eraser/undo are predictable.
  function stampLayer(stamp){const coords=makeCircle(stamp.latlng,stamp.radius).map(p=>[p[1],p[0]]);return L.geoJSON({type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[coords]}},{style:{color:'#f04444',weight:0.3,fillColor:'#f04444',fillOpacity:.82},interactive:false});}
  function renderAll(){rendered.forEach(l=>painterMap.removeLayer(l));rendered=[];strokes.forEach(stroke=>stroke.forEach(stamp=>{const layer=stampLayer(stamp).addTo(painterMap);rendered.push(layer);}));}
  function sizeMetres(latlng){const px=Number(document.getElementById('brush-size').value);return painterMap.distance(latlng,painterMap.containerPointToLatLng(painterMap.latLngToContainerPoint(latlng).add([px,0])));}
  function eraseAt(latlng){let changed=false;strokes=strokes.map(stroke=>stroke.filter(stamp=>{const erase=sizeMetres(latlng)+stamp.radius*.45;const keep=pointDistance(latlng,stamp.latlng)>erase;if(!keep)changed=true;return keep;})).filter(stroke=>stroke.length);if(changed)renderAll();}
  function stampAt(latlng){const stamp={latlng:{lat:latlng.lat,lng:latlng.lng},radius:sizeMetres(latlng)};activeStroke.push(stamp);const layer=stampLayer(stamp).addTo(painterMap);rendered.push(layer);}
  function setMode(next){mode=next;document.getElementById('brush-tool').classList.toggle('active',mode==='brush');document.getElementById('eraser-tool').classList.toggle('active',mode==='eraser');painterMap.getContainer().style.cursor=mode==='brush'?'crosshair':'cell';say(mode==='brush'?'Пензель активний — малюй мишкою по карті.':'Гумка активна — проведи по червоних мазках, щоб стерти їх.');}
  painterMap=L.map(mapEl,{zoomControl:true,attributionControl:false,preferCanvas:true}).setView([48.8,31.2],6);
  Promise.all([fetch('https://raw.githubusercontent.com/slawomirmatuszak/ukrainian_geodata/master/regiony.geojson'),fetch('https://raw.githubusercontent.com/slawomirmatuszak/ukrainian_geodata/master/rayony.geojson')]).then(async rs=>{const data=await Promise.all(rs.map(r=>r.json()));const regions=data[0].features||[];const districts=data[1].features||[];L.geoJSON({type:'FeatureCollection',features:districts},{style:{color:'#3d4653',weight:.7,fillColor:'#303744',fillOpacity:.9},interactive:false}).addTo(painterMap);L.geoJSON({type:'FeatureCollection',features:regions},{style:{color:'#9aa5b4',weight:1.2,fill:false},interactive:false}).addTo(painterMap);}).catch(()=>say('Не вдалося завантажити межі карти. Перевір інтернет.'));
  painterMap.on('mousedown',e=>{if(e.originalEvent.button!==0)return;drawing=true;if(mode==='brush'){activeStroke=[];strokes.push(activeStroke);stampAt(e.latlng);}else eraseAt(e.latlng);});
  painterMap.on('mousemove',e=>{if(!drawing)return;if(mode==='brush'){if(!activeStroke)return;const last=activeStroke[activeStroke.length-1];if(!last||pointDistance(last.latlng,e.latlng)>Math.max(100,sizeMetres(e.latlng)*.35))stampAt(e.latlng);}else eraseAt(e.latlng);});
  window.addEventListener('mouseup',()=>{drawing=false;activeStroke=null;});
  document.getElementById('brush-tool').addEventListener('click',()=>setMode('brush'));document.getElementById('eraser-tool').addEventListener('click',()=>setMode('eraser'));
  document.getElementById('undo-stroke').addEventListener('click',()=>{strokes.pop();renderAll();say('Останній мазок скасовано.');});
  document.getElementById('clear-drawing').addEventListener('click',()=>{if(confirm('Очистити всі намальовані червоні території?')){strokes=[];renderAll();say('Малюнок очищено.');}});
  document.getElementById('export-drawing').addEventListener('click',()=>{const features=[];strokes.forEach(stroke=>stroke.forEach(stamp=>{const ring=makeCircle(stamp.latlng,stamp.radius).map(p=>[p[1],p[0]]);features.push({type:'Feature',properties:{fill:'#f04444'},geometry:{type:'Polygon',coordinates:[ring]}});}));const blob=new Blob([JSON.stringify({type:'FeatureCollection',features},null,2)],{type:'application/geo+json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='red-territories.geojson';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);say('GeoJSON завантажено. Завантаж red-territories.geojson у корінь репозиторію GitHub.');});
  setMode('brush');setTimeout(()=>painterMap.invalidateSize(),250);
})();
