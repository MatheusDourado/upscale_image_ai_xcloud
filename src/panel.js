// Panel inside Better xCloud's video settings. Reads and changes state only through window.BxImageFilter.
(() => {
 const api=window.BxImageFilter,settings=api.settings,status=api.status;
 let controlsPanel=null;
 function mountControls(parent){
  if(controlsPanel){parent.append(controlsPanel);return;}
  if(parent.querySelector('[data-bx-restoration]'))return;
  const panel=controlsPanel=document.createElement('div');panel.dataset.bxRestoration='v9.6.1';
  const title=document.createElement('p');title.textContent='Tratamento de imagem • v9.6.1';panel.append(title);
  function row(label,control){
   const wrapper=document.createElement('label');wrapper.className='bx-settings-row';
   const text=document.createElement('span');text.className='bx-settings-label';text.textContent=label;
   wrapper.append(text,control);panel.append(wrapper);return text;
  }
  const choose=document.createElement('select');choose.className='bx-focusable';choose.setAttribute('aria-label','Comparação');
  for(const [value,label]of [['original','Vídeo original'],['cas','Referência: só nitidez (sem tratamento)'],['filtered','Novo tratamento']]){const option=document.createElement('option');option.value=value;option.textContent=label;choose.append(option);}
  choose.value=settings.mode;choose.onchange=()=>api.update({mode:choose.value});row('Comparação',choose);
  const inputs=[];
  {
   const input=document.createElement('input');input.type='range';input.min=0;input.max=10;input.step=.5;input.className='bx-focusable';input.setAttribute('aria-label','Nitidez');
   const text=row('Nitidez',input);
   const sync=()=>{input.value=settings.sharpness;text.textContent=`Nitidez: ${settings.sharpness===0?'desligada':settings.sharpness.toFixed(1)}`;};sync();inputs.push(sync);
   input.oninput=()=>{api.update({sharpness:Number(input.value)});sync();};
  }
  for(const [name,label]of [['neural','Reconstrução neural (exp.)'],['cleanup','Compressão'],['deband','Degradês'],['chroma','Cor nas bordas'],['detail','Detalhe'],['temporal','Estabilidade em movimento'],['antialias','Antialiasing']]){
   const input=document.createElement('input');input.type='range';input.min=0;input.max=100;input.step=1;input.className='bx-focusable';input.setAttribute('aria-label',label);
   const text=row(label,input);
   const sync=()=>{input.value=Math.round(settings[name]*100);text.textContent=`${label}: ${input.value}%`;};sync();inputs.push(sync);
   input.oninput=()=>{api.update({[name]:Number(input.value)/100});sync();};
  }
  function selection(label,name,options){
   const select=document.createElement('select');select.className='bx-focusable';select.setAttribute('aria-label',label);
   for(const [value,text]of options){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}
   const sync=()=>select.value=String(settings[name]);sync();inputs.push(sync);
   select.onchange=()=>api.update({[name]:['gpuBudget','smoothing'].includes(name)?Number(select.value):select.value});row(label,select);
  }
  selection('Limpeza espacial','spatialMode',[['selective','Seletiva v8'],['legacy','Referência v7.1']]);
  selection('Nitidez final','sharpening',[['usm','USM (recomendado)'],['cas','AMD CAS'],['rcas','AMD RCAS'],['native','Seguir menu nativo (CAS/USM)']]);
  selection('Resolução de saída','output',[['auto','Automática — resolução da tela'],['native','1080p / nativa com tratamento'],['1440','2K — 2560 × 1440'],['2160','4K — 3840 × 2160']]);
  selection('Fluidez (ritmo de exibição)','fluidity',[['off','Desligada — exibe ao chegar'],['balanced','Equilibrada — segue o ritmo do servidor'],['max','Máxima — ritmo fixo 30/60']]);
  selection('Suavidade (buffer de vídeo)','smoothing',[['0','Automático — navegador decide'],['17','Alvo de 17 ms'],['33','Alvo de 33 ms'],['50','Alvo de 50 ms']]);
  selection('Tratamento na GPU','gpuBudget',[['3','Adaptar acima de 3 ms'],['6','Adaptar acima de 6 ms'],['10','Adaptar acima de 10 ms'],['0','Manter todos os filtros ativos']]);
  const diagnostic=document.createElement('button');diagnostic.className='bx-focusable';
  const syncDiagnostic=()=>diagnostic.textContent=api.diagnostic?'Encerrar diagnóstico':'Diagnóstico: colorir imagem';syncDiagnostic();
  diagnostic.onclick=()=>{api.diagnostic=!api.diagnostic;syncDiagnostic();};panel.append(diagnostic);
  const measure=document.createElement('button');measure.className='bx-focusable';measure.textContent='Iniciar medição';
  const exportReport=document.createElement('button');exportReport.className='bx-focusable';exportReport.textContent='Encerrar e exportar medição';
  measure.onclick=async()=>{measure.disabled=true;try{if(await api.startMeasurement())measure.textContent='Reiniciar medição';}finally{measure.disabled=false;}};
  exportReport.onclick=async()=>{exportReport.disabled=true;try{await api.exportMeasurement();}finally{exportReport.disabled=false;}};
  panel.append(measure,exportReport);
  const reset=document.createElement('button');reset.className='bx-focusable';reset.textContent='Restaurar tratamento';reset.onclick=()=>{api.reset();for(const sync of inputs)sync();choose.value=settings.mode;syncDiagnostic();};panel.append(reset);
  const report=document.createElement('p');report.setAttribute('role','status');panel.append(report);
  const note=document.createElement('p');note.textContent='v9: padrões medidos em streams H.264 tipo xCloud (docs/analysis-v9.md). Nitidez e método valem para o tratamento e para a referência só nitidez. Saída Automática renderiza na altura real do vídeo na tela: em celulares (ex.: 1220–1280 px) usa FSR e aplica a nitidez já no tamanho final; com HDMI 1080p fica nativa. Fluidez: processa cada quadro ao chegar e o exibe num relógio constante (Equilibrada segue o ritmo do servidor; Máxima impõe 30/60 fixo), com alguns ms de espera mostrados no painel. Suavidade: solicita um alvo de buffer ao navegador, que pode ajustá-lo conforme a rede. Pode melhorar a regularidade com mais latência; não garante um atraso máximo. Compare o alvo solicitado com o buffer medido na linha de latência. Reconstrução neural (experimental, desligada por padrão): rede treinada em streams H.264 limpa blocos e ruído antes da nitidez; custa ~30% mais GPU e pede Nitidez ~2,5. Degradês altos e Antialiasing suavizam textura. A medição exporta tempos GPU; não mede latência do controle. Tratamento salvo para todos os jogos.';panel.append(note);
  // Explicit 2K/4K above the display (e.g. 1080p HDMI to a 4K TV) is scaled back down by the browser.
  const outputWarning=()=>settings.mode==='filtered'&&['1440','2160'].includes(settings.output)&&status.display&&Number(settings.output)>status.display*1.1?`Tela/HDMI em ${status.display}p: saída maior só aumenta custo. Use Automática.\n`:'';
  // Live decoder line from the shared stream telemetry (status.net).
  const decoderLabels={hardware:'hardware',software:'software (CPU)',unknown:'não informado pelo navegador'};
  const ms=v=>v===null||v===undefined?'—':v.toFixed(1)+' ms';
  const decoderText=()=>{const n=status.net;if(!n)return '';const gpu=status.measurement==='gpu'&&status.gpuP95!==null?status.gpuP95:null;
   // One line per stage: the network round trip, then what the client adds per frame.
   return `Codec ${n.codec||'—'} • ${n.fpsReceived?Math.round(n.fpsReceived)+' FPS recebidos':'FPS —'} • Decodificação: ${decoderLabels[n.decoder]}${n.implementation?' ('+n.implementation+')':''}\n`
    +`Latência: rede (RTT) ${ms(n.rttMs)} • buffer ${ms(n.bufferMs)} • decodificação (DT) ${ms(n.decodeMs)} • tratamento ${ms(gpu)}\n`;};
  // Frame pacing of the last 2 s: steady 30 FPS shows ~33.3 ms, small deviation and 0 hitches.
  const pacingText=()=>{const p=status.pacing;if(!p)return '';
   const o=status.origin||{},fmt=x=>x?`${x.meanMs.toFixed(1)} ± ${x.deviationMs.toFixed(1)}`:'—',f=status.fluidity;
   return `Ritmo na tela: ${p.meanMs.toFixed(1)} ms ± ${p.deviationMs.toFixed(1)} • p95 ${p.p95Ms.toFixed(1)} ms • ${p.hitches} travada${p.hitches===1?'':'s'} em 2 s\n`
    +`Origem: servidor ${fmt(o.server)} • chegada ${fmt(o.arrival)}\n`
    +(o.presented?`Quadros pulados antes do tratamento: ${o.missed} de ${o.presented} em 2 s\n`:'')
    +(f?`Fluidez ${f.mode==='max'?'máxima':'equilibrada'}: +${(f.extraMs??0).toFixed(1)} ms de espera • ${f.dropped} descartado${f.dropped===1?'':'s'}\n`:'');};
  const smoothingText=()=>{
   const s=status.smoothing;if(!s)return '';
   const target=s.requestedMs?`alvo solicitado ${s.requestedMs} ms`:'automático';
   const state={waiting:'aguardando vídeo',unsupported:'não suportado pelo navegador',requested:'solicitação aceita',partial:'aplicação parcial',error:'não foi possível aplicar'}[s.state];
   return `Suavidade: ${target} • ${state}. O buffer medido aparece na linha de latência.\n`;
  };
  // Configuration summary to paste in a support conversation (no account data).
  const copy=document.createElement('button');copy.className='bx-focusable';copy.textContent='Copiar configuração';
  const copyBox=document.createElement('textarea');copyBox.readOnly=true;copyBox.rows=8;copyBox.style.cssText='display:none;width:100%;font-size:11px';
  copy.onclick=async()=>{
   const text=api.configText();copyBox.value=text;copyBox.style.display='block';copyBox.select();
   try{await navigator.clipboard.writeText(text);copy.textContent='Configuração copiada';}catch{copy.textContent='Copie o texto abaixo';}
  };
  panel.append(copy,copyBox);
  let interval=null;
  // Android app only (window.BxAndroid bridge): fixed display refresh rate, stored natively and
  // applied at once and on app start. Added on the first refresh that sees the bridge.
  let refreshRow=null;
  function ensureRefreshRow(){
   if(refreshRow||!window.BxAndroid?.getRefreshRates)return;
   const rates=(()=>{try{return JSON.parse(window.BxAndroid.getRefreshRates());}catch{return [];}})();
   const select=document.createElement('select');select.className='bx-focusable';select.setAttribute('aria-label','Taxa da tela (app)');
   for(const [value,text]of [['0','Sistema decide'],...rates.map(r=>[String(r),`Fixar em ${r} Hz`])]){const o=document.createElement('option');o.value=value;o.textContent=text;select.append(o);}
   select.value=String(window.BxAndroid.getRefreshRate?.()??0);
   select.onchange=()=>{window.BxAndroid.setRefreshRate(Number(select.value));};
   refreshRow=row('Taxa da tela (app)',select);panel.insertBefore(refreshRow.parentElement,report);
  }
  const refresh=()=>{
   ensureRefreshRow();
   syncDiagnostic();
   if(status.mode==='error')report.textContent=smoothingText()+'Erro: '+status.error;
   else if(!status.lastFrame||Date.now()-status.lastFrame>2500)report.textContent=smoothingText()+decoderText()+'Sem quadros recentes do tratamento. Selecione WebGL2 durante o jogo para filtrar a imagem.';
   else report.textContent=`${outputWarning()}${smoothingText()}${decoderText()}${pacingText()}${status.mode} • ${status.resolution} • ${status.frames} quadros • ${status.fps?.toFixed(1)||'—'} FPS\n${status.measurement==='gpu'?`GPU total p95: ${status.gpuP95?.toFixed(2)||'—'} ms`:'Sem medição GPU; apenas cadência'} ${status.adaptation}`;
  };
  // Rebuilt menu instances must not retain timers after removal.
  const observer=new MutationObserver(()=>{
   if(panel.isConnected&&!interval){api.panelOpen=true;refresh();interval=window.setInterval(refresh,1000);}
   else if(!panel.isConnected&&interval){api.panelOpen=false;window.clearInterval(interval);interval=null;}
  });observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('pagehide',()=>{if(interval)window.clearInterval(interval);observer.disconnect();},{once:true});
  parent.append(panel);api.panelOpen=true;refresh();
 }
 api.panel={mount:mountControls};
})();
