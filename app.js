/* ============================================================
   眷属美食地图 · 前端应用逻辑 v3
   双视图：🏪 店铺聚合视图（默认，仅显示有店名店铺，含复购次数/多条引用）
           ☰ 全部博文视图（含未标注店名，可手动录入店名）
   ============================================================ */
let DATA = FOODS_DATA;
let map = null, markers = {}, curId = null, curType = '全部', curQ = '';
let streetLayer = null, satLayer = null, curBase = 'street';
let onlyNamed = true;

const TYPE_ORDER = ['粤菜小炒','粤菜','茶餐厅','烧腊','日料','凉茶糖水','创意粤菜','西式简餐','粥粉面饭','快餐','小吃创意','甜品','家常手作'];

const AMAP_STREET = 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}';
const AMAP_SAT    = 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}';

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function imgProxy(u){if(!u)return '';if(u.indexOf('media/')===0||u.indexOf('./')===0||u.indexOf('/media/')===0)return u;if(u.indexOf('sinaimg')>=0)return '/img?u='+encodeURIComponent(u);return u;}

/* 导航跳转：高德/百度/苹果地图（手机端唤起 App） */
function navLinks(lat,lng,name,addr){
  if(lat==null||lng==null||isNaN(lat)||isNaN(lng))return '';
  const n=encodeURIComponent(name||'');
  const a=encodeURIComponent(addr||name||'');
  const to=lng+','+lat;
  return '<div class="navtitle">📍 定位 · '+(addr?esc(addr):'区域示意')+'</div>'
    +'<div class="navbtns">'
    +'<a class="navb gd" href="https://uri.amap.com/navigation?to='+to+','+a+'&mode=car&coordinate=gaode" target="_blank" rel="noopener">🧭 高德导航</a>'
    +'<a class="navb bd" href="https://api.map.baidu.com/marker?location='+lat+','+lng+'&title='+n+'&output=html&coord_type=gcj02&src=webapp" target="_blank" rel="noopener">🧭 百度地图</a>'
    +'<a class="navb ap" href="http://maps.apple.com/?ll='+lat+','+lng+'&q='+n+'" target="_blank" rel="noopener">🧭 苹果地图</a>'
    +'</div>';
}

/* ---------- 数据 ---------- */
function shopType(sh){return (sh.refs&&sh.refs[0]&&sh.refs[0].type)||'未分类';}
function filtered(){
  if(onlyNamed){
    let arr=(DATA.shops||[]).slice();
    if(curType!=='全部') arr=arr.filter(sh=>shopType(sh)===curType);
    if(curQ){const q=curQ.toLowerCase();
      arr=arr.filter(sh=>[sh.name,sh.city,sh.address,sh.note,(sh.refs||[]).map(r=>r.text).join(' ')].join(' ').toLowerCase().includes(q));}
    return arr;
  }
  let arr=(DATA.spots||[]).slice();
  if(curType!=='全部') arr=arr.filter(s=>s.type===curType);
  if(curQ){const q=curQ.toLowerCase();
    arr=arr.filter(s=>[s.food,s.place,s.region,s.type,s.text,s.shopName,s.tags&&s.tags.join(' ')].join(' ').toLowerCase().includes(q));}
  return arr.sort((a,b)=>(b.date+a.time).localeCompare(a.date+a.time));
}

/* ---------- 初始化 ---------- */
function init(){
  const c=DATA.meta.mapCenter||{lat:23.1291,lng:113.2644,zoom:11};
  if(!map){
    map=L.map('map',{zoomControl:true,attributionControl:true}).setView([c.lat,c.lng],c.zoom||11);
    streetLayer=L.tileLayer(AMAP_STREET,{subdomains:['1','2','3','4'],maxZoom:18,attribution:'© 高德地图 © 微博@夜用型眷属'}).addTo(map);
    satLayer=L.tileLayer(AMAP_SAT,{subdomains:['1','2','3','4'],maxZoom:18});
  }
  /* markers：店铺点（有坐标的） */
  (DATA.shops||[]).forEach(sh=>{
    if(sh.lat==null||sh.lng==null)return;
    const key='s:'+sh.name;
    if(markers[key])return;
    const icon=L.divIcon({className:'',html:'<div class="pin'+(sh.repurchaseCount>1?' repu':'')+'"></div>',iconSize:[16,16],iconAnchor:[8,8]});
    const m=L.marker([sh.lat,sh.lng],{icon}).addTo(map);
    m.on('click',()=>openDetail(key));
    markers[key]=m;
  });
  /* chips */
  const items=onlyNamed?(DATA.shops||[]):(DATA.spots||[]);
  const typeCnt={};
  items.forEach(it=>{const t=onlyNamed?shopType(it):it.type;typeCnt[t]=(typeCnt[t]||0)+1;});
  const types=TYPE_ORDER.filter(t=>typeCnt[t]).concat(Object.keys(typeCnt).filter(t=>!TYPE_ORDER.includes(t)).sort());
  const chips=document.getElementById('chips');
  chips.innerHTML='';
  const mk=(label,key,cls)=>{const b=document.createElement('button');b.className='chip'+(cls?' '+cls:'')+(key===curType?' on':'');b.innerHTML=esc(label)+' <span class="n">'+(key==='全部'?items.length:typeCnt[key]||0)+'</span>';b.onclick=()=>{curType=key;document.querySelectorAll('.chip').forEach(x=>x.classList.remove('on'));b.classList.add('on');render();};chips.appendChild(b);};
  mk('全部','全部','accent');
  types.forEach(t=>mk(t,t,''));
  /* 统计 */
  document.getElementById('st-count').textContent=onlyNamed?(DATA.shops||[]).length:(DATA.spots||[]).length;
  document.getElementById('st-type').textContent=types.length;
  render();
}

/* ---------- 渲染 ---------- */
function render(){
  const list=document.getElementById('list');
  const arr=filtered();
  Object.keys(markers).forEach(k=>{
    const inView=onlyNamed?arr.some(sh=>('s:'+sh.name)===k):false;
    markers[k].setOpacity(inView?1:0.15);
    const el=markers[k].getElement&&markers[k].getElement();
    if(el&&el.querySelector('.pin'))el.querySelector('.pin').classList.toggle('hot',inView);
  });
  if(!arr.length){list.innerHTML='<div class="empty">没有匹配的记录，换个关键词或类型试试～</div>';return;}
  const groups={};
  arr.forEach(it=>{const t=onlyNamed?shopType(it):it.type;(groups[t]=groups[t]||[]).push(it);});
  const types=Object.keys(groups).sort((a,b)=>{const ia=TYPE_ORDER.indexOf(a),ib=TYPE_ORDER.indexOf(b);return (ia<0?99:ia)-(ib<0?99:ib)||a.localeCompare(b);});
  let html='';
  if(curQ) html+='<div class="hint">搜索「'+esc(curQ)+'」共 '+arr.length+' 条结果</div>';
  if(onlyNamed) html+='<div class="hint">🏪 共 '+arr.length+' 家已确认店铺 · 博文引用见店铺详情</div>';
  else html+='<div class="hint">☰ 全部美食博文 '+arr.length+' 条 · 无店名的可点开手动补充</div>';
  types.forEach(t=>{
    html+='<div class="group"><div class="grouphead"><span class="dot"></span><h2>'+esc(t)+'</h2><span class="cnt">'+groups[t].length+(onlyNamed?' 家':' 条')+'</span></div>';
    groups[t].forEach(it=>{html+=onlyNamed?shopCard(it):spotCard(it);});
    html+='</div>';
  });
  list.innerHTML=html;
  list.querySelectorAll('.card').forEach(el=>{el.onclick=()=>{openDetail(el.dataset.id);scrollToCard(el.dataset.id);};});
}

function shopCard(sh){
  const r0=(sh.refs||[])[0]||{};
  const img=r0.images&&r0.images[0]?imgProxy(r0.images[0]):'';
  return '<div class="card" data-id="s:'+esc(sh.name)+'"><img src="'+esc(img)+'" loading="lazy" alt=""><div class="main">'
    +'<div class="food">'+esc(sh.name)+'</div>'
    +'<div class="shopmini">'+(sh.verified?'✓ 已平台验证':'○ 博主自述·待核')+'</div>'
    +(sh.repurchaseCount>1?'<div class="repurchase">↻ 打卡 ×'+sh.repurchaseCount+'</div>':'')
    +'<div class="meta"><span>📍 '+esc(sh.city+(sh.address?' · '+sh.address:''))+'</span><span>最近 '+esc(sh.lastVisit||'')+'</span></div>'
    +'<div class="excerpt">'+esc((r0.text||'').slice(0,90))+'</div>'
    +'</div></div>';
}

function spotCard(s){
  const img=s.images&&s.images[0]?imgProxy(s.images[0]):'';
  return '<div class="card" data-id="'+s.id+'"><img src="'+esc(img)+'" loading="lazy" alt=""><div class="main">'
    +'<div class="food">'+esc(s.food)+'</div>'
    +(s.shopName?'<div class="shopmini">'+((s.shopSource||'').indexOf('验证')>=0?'✓ 已平台验证':'○ 待核')+'</div>':'')
    +'<div class="meta"><span>📍 '+esc(s.place)+'</span><span>'+esc(s.date)+'</span><span class="tag">'+esc(s.type)+'</span></div>'
    +'<div class="excerpt">'+esc(s.text)+'</div></div></div>';
}

/* ---------- 详情 ---------- */
function showModal(){
  document.getElementById('modal').classList.add('show');
  document.getElementById('mask').classList.add('show');
}

function openDetail(id){
  if(id.indexOf('s:')===0){
    const sh=(DATA.shops||[]).find(x=>('s:'+x.name)===id); if(!sh)return;
    curId=id;
    Object.keys(markers).forEach(k=>{const p=markers[k].getElement&&markers[k].getElement();if(p&&p.querySelector('.pin'))p.querySelector('.pin').classList.toggle('pop',k===id);});
    document.querySelectorAll('.card').forEach(el=>el.classList.toggle('cur',el.dataset.id===id));
    const refs=sh.refs||[];
    document.getElementById('m-food').textContent=sh.name;
    document.getElementById('m-chips').innerHTML=[sh.city,sh.verified?'已平台验证':'博主自述·待核',(sh.repurchaseCount>1?'打卡 ×'+sh.repurchaseCount:'')].filter(Boolean).map((c,i)=>'<span class="'+(i===0?'tp':'')+'">'+esc(c)+'</span>').join('');
    document.getElementById('m-text').textContent='';
    const refHtml=refs.map(r=>{
      const imgs=r.images||[];
      return '<div class="ref">'
        +'<div class="refhead"><span class="refdate">'+esc((r.date||'')+' '+(r.time||''))+'</span><span class="tag">'+esc(r.type||'')+'</span></div>'
        +(imgs.length?'<div class="refimgs">'+imgs.map((u,i)=>'<img src="'+esc(imgProxy(u))+'" alt="图'+(i+1)+'" loading="lazy">').join('')+'</div>':'')
        +'<div class="reftext">'+esc(r.text)+'</div>'
        +'<a class="weibo" href="'+esc(r.url||'')+'" target="_blank" rel="noopener">↗ 原微博</a>'
        +'</div>';
    }).join('');
    document.getElementById('m-refs').innerHTML='<div class="refhead2">📚 博文引用 '+refs.length+' 条'+(sh.repurchaseCount>1?' · 打卡 '+sh.repurchaseCount+' 次':'')+'</div>'+refHtml;
    document.getElementById('m-shop').innerHTML='<div class="shopname">🏪 '+esc(sh.name)+'</div>'
      +(sh.address?'<div class="shopaddr">📍 '+esc(sh.city+' · '+sh.address)+'</div>':'')
      +'<div class="shopbadge '+(sh.verified?'ok':'warn')+'">'+(sh.verified?'✓ 已平台验证':'○ 博主自述·待核')+'</div>';
    document.getElementById('m-locnote').textContent='坐标'+(sh.verified?'已平台验证':'为区域级示意')+'，具体以博文为准';
    document.getElementById('m-date').textContent='最近打卡 '+(sh.lastVisit||'');
    document.getElementById('m-url').href='https://m.weibo.cn/u/5038438846';
    document.getElementById('m-url').textContent='↗ 博主主页';
    document.getElementById('m-note').style.display='none';
    /* 导航（第一时间显示定位地点） */
    const navEl=document.getElementById('m-nav');
    const nl=navLinks(sh.lat,sh.lng,sh.name,sh.city+' '+(sh.address||''));
    if(nl){navEl.innerHTML=nl;navEl.style.display='block';}else navEl.style.display='none';
    /* 图库：所有引用图片 */
    const allImgs=refs.flatMap(r=>r.images||[]);
    fillGallery(allImgs);
    showModal();
    return;
  }
  const s=(DATA.spots||[]).find(x=>x.id===id); if(!s)return;
  curId=id;
  Object.keys(markers).forEach(k=>{const p=markers[k].getElement&&markers[k].getElement();if(p&&p.querySelector('.pin'))p.querySelector('.pin').classList.remove('pop');});
  document.querySelectorAll('.card').forEach(el=>el.classList.toggle('cur',el.dataset.id===id));
  document.getElementById('m-food').textContent=s.shopName?s.shopName:s.food;
  document.getElementById('m-text').textContent=s.text;
  document.getElementById('m-date').textContent=(s.date||'')+(s.time?' '+s.time:'')+' · '+(s.place||'');
  document.getElementById('m-url').href=s.url||('https://m.weibo.cn/detail/'+s.id);
  document.getElementById('m-url').textContent='↗ 查看原微博';
  const chips=[s.type,s.place,s.region].filter(Boolean);
  if(s.tags) chips.push(...s.tags.slice(0,4));
  document.getElementById('m-chips').innerHTML=chips.map((c,i)=>'<span class="'+(i<2?'tp':'')+'">'+esc(c)+'</span>').join('');
  const shopEl=document.getElementById('m-shop');
  if(s.shopName){const vd=(s.shopSource||'').indexOf('验证')>=0;
    shopEl.innerHTML='<div class="shopname">🏪 '+esc(s.shopName)+'</div>'
      +(s.place?'<div class="shopaddr">📍 '+esc(s.place)+'</div>':'')
      +'<div class="shopbadge '+(vd?'ok':'warn')+'">'+(vd?'✓ 已平台验证':'○ 待核')+'</div>';
    shopEl.style.display='block';}
  else shopEl.style.display='none';
  document.getElementById('m-refs').innerHTML='';
  /* 导航（有坐标时） */
  const navEl2=document.getElementById('m-nav');
  const nl2=navLinks(s.lat,s.lng,s.shopName||s.food,s.place||'');
  if(nl2){navEl2.innerHTML=nl2;navEl2.style.display='block';}else navEl2.style.display='none';
  /* 手动录入（无店名时） */
  const noteEl=document.getElementById('m-note');
  if(!s.shopName){
    noteEl.style.display='block';
    document.getElementById('note-id').value=s.id;
    document.getElementById('note-name').value='';
    document.getElementById('note-addr').value='';
    document.getElementById('note-msg').textContent='';
  }else noteEl.style.display='none';
  document.getElementById('m-locnote').textContent=s.locNote?'坐标说明：'+s.locNote:'博文未标注精确地址，坐标仅供参考（区域级标注）。';
  fillGallery(s.images||[]);
  showModal();
}

function fillGallery(imgs){
  const g=document.getElementById('gallery');
  if(imgs.length){
    let gi=0;
    g.innerHTML=imgs.map((u,i)=>'<img src="'+esc(imgProxy(u))+'" class="'+(i===0?'on':'')+'" alt="图'+(i+1)+'">').join('')
      +'<button class="nav prev">‹</button><button class="nav next">›</button><span class="idx">1/'+imgs.length+'</span>';
    const show=()=>{g.querySelectorAll('img').forEach((im,i)=>im.classList.toggle('on',i===gi));g.querySelector('.idx').textContent=(gi+1)+'/'+imgs.length;};
    g.querySelector('.prev').onclick=e=>{e.stopPropagation();gi=(gi-1+imgs.length)%imgs.length;show();};
    g.querySelector('.next').onclick=e=>{e.stopPropagation();gi=(gi+1)%imgs.length;show();};
  }else{
    g.innerHTML='<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#999;font-size:13px">本条无配图</div>';
  }
}

function closeDetail(){
  document.getElementById('modal').classList.remove('show');
  document.getElementById('mask').classList.remove('show');
  Object.keys(markers).forEach(k=>{const p=markers[k].getElement&&markers[k].getElement();if(p&&p.querySelector('.pin'))p.querySelector('.pin').classList.remove('pop');});
  document.querySelectorAll('.card').forEach(el=>el.classList.remove('cur'));
  curId=null;
}

function scrollToCard(id){
  const el=document.querySelector('.card[data-id="'+id+'"]');
  if(el)el.scrollIntoView({behavior:'smooth',block:'center'});
}

function switchBase(k){
  curBase=k;
  document.getElementById('btn-street').classList.toggle('active',k==='street');
  document.getElementById('btn-sat').classList.toggle('active',k==='sat');
  if(document.getElementById('lb-street'))document.getElementById('lb-street').classList.toggle('active',k==='street');
  if(document.getElementById('lb-sat'))document.getElementById('lb-sat').classList.toggle('active',k==='sat');
  if(k==='street'){streetLayer.addTo(map); if(map.hasLayer(satLayer))map.removeLayer(satLayer);}
  else{satLayer.addTo(map); if(map.hasLayer(streetLayer))map.removeLayer(streetLayer);}
}

/* ---------- 动态加载 + 状态 + 刷新 ---------- */
function boot(d){if(d&&((d.spots&&d.spots.length)||(d.shops&&d.shops.length))){DATA=d;init();}else init();}
async function loadData(){
  try{
    const r=await fetch('/api/spots',{cache:'no-store'});
    if(!r.ok)throw 0;
    const d=await r.json();
    if(d&&(d.spots||[]).length){boot(d);return;}
  }catch(e){}
  try{
    const r2=await fetch('foods.json',{cache:'no-store'});
    if(!r2.ok)throw 0;
    const d2=await r2.json();
    if(d2&&(d2.spots||[]).length){boot(d2);return;}
  }catch(e){}
  boot(FOODS_DATA);
}
function refreshStatus(){
  fetch('/api/status',{cache:'no-store'}).then(r=>r.json()).then(s=>{
    const t=document.getElementById('up-time');
    if(t)t.textContent='更新时间：'+(s.updatedAt||'—')+' · '+s.shopCount+' 家店';
    const st=document.getElementById('up-state');
    const btn=document.getElementById('btn-refresh');
    if(s.running){
      if(st)st.textContent='更新中…';
      if(btn){btn.disabled=true;btn.classList.add('busy');btn.textContent='更新中…';}
    }else{
      if(st&&s.lastResult)st.textContent=s.lastResult.slice(0,80);
      if(btn){btn.disabled=false;btn.classList.remove('busy');btn.textContent='↻ 立即刷新';}
    }
  }).catch(()=>{});
}
document.addEventListener('DOMContentLoaded',()=>{
  refreshStatus();
  const btn=document.getElementById('btn-refresh');
  if(btn)btn.onclick=()=>{
    btn.disabled=true;btn.textContent='更新中…';
    const st=document.getElementById('up-state');if(st)st.textContent='正在抓取新微博…';
    fetch('/api/refresh',{method:'POST',cache:'no-store'}).then(r=>r.json()).then(()=>{
      setTimeout(()=>{loadData();refreshStatus();},3000);
      const iv=setInterval(()=>{
        fetch('/api/status',{cache:'no-store'}).then(r=>r.json()).then(s=>{
          if(!s.running){clearInterval(iv);loadData();refreshStatus();}
        }).catch(()=>{});
      },5000);
    }).catch(()=>{refreshStatus();});
  };
  const btnNamed=document.getElementById('btn-named');
  const syncNamed=()=>{btnNamed.textContent=onlyNamed?'🏪 有店名':'☰ 全部';btnNamed.classList.toggle('on',onlyNamed);};
  syncNamed();
  btnNamed.onclick=()=>{onlyNamed=!onlyNamed;syncNamed();render();};
  document.getElementById('btn-street').onclick=()=>switchBase('street');
  document.getElementById('btn-sat').onclick=()=>switchBase('sat');
  document.getElementById('m-close').onclick=closeDetail;
  document.getElementById('m-close2').onclick=closeDetail;
  document.getElementById('mask').onclick=closeDetail;
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDetail();});
  document.getElementById('q').addEventListener('input',e=>{curQ=e.target.value.trim();render();});
  document.getElementById('map').insertAdjacentHTML('beforeend',
    '<div class="layerbtn"><button id="lb-street" class="active">街景</button><button id="lb-sat">卫星</button></div>');
  document.getElementById('lb-street').onclick=()=>switchBase('street');
  document.getElementById('lb-sat').onclick=()=>switchBase('sat');
  /* 手动录入 */
  document.getElementById('note-save').onclick=async()=>{
    const mid=document.getElementById('note-id').value;
    const name=document.getElementById('note-name').value.trim();
    const addr=document.getElementById('note-addr').value.trim();
    const msg=document.getElementById('note-msg');
    if(!name){msg.textContent='请填写店名';return;}
    try{
      const r=await fetch('/api/shopnote',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id:mid,name:name,address:addr})});
      const d=await r.json();
      msg.textContent=d.message||'已记录';
      if(d.ok){setTimeout(()=>{closeDetail();loadData();},600);}
    }catch(e){msg.textContent='保存失败，请重试';}
  };
  loadData();
});
