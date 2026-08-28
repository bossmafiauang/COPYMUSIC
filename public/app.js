(function(){
  const HISTORY_KEY = 'playbackbay_history';
  const HISTORY_MAX = 50;

  let audioCtx = null;
  let originalBuffer = null;
  let sourceFile = null;
  let previewSource = null;
  let vuRAF = null;
  let wavBlobUrl = null, mp3BlobUrl = null, oggBlobUrl = null;
  let lastRenderedBuffer = null;

  const el = id => document.getElementById(id);
  const dropZone = el('dropZone'), fileInput = el('fileInput');
  const fileMeta = el('fileMeta'), fileNameEl = el('fileName'), fileDurEl = el('fileDur');
  const waveBox = el('waveBox'), waveCanvas = el('wave'), trimOverlay = el('trimOverlay');
  const trimStart = el('trimStart'), trimEnd = el('trimEnd');
  const trimStartVal = el('trimStartVal'), trimEndVal = el('trimEndVal');
  const speed = el('speed'), pitch = el('pitch'), amplify = el('amplify'), maxDuration = el('maxDuration');
  const speedVal = el('speedVal'), pitchVal = el('pitchVal'), ampVal = el('ampVal'), maxDurVal = el('maxDurVal');
  const speedNormalReadout = el('speedNormalReadout');
  const advToggle = el('advToggle'), advBody = el('advBody'), advChevron = el('advChevron'), advSummary = el('advSummary');
  const speedPresets = el('speedPresets');
  const btnPreview = el('btnPreview'), btnExport = el('btnExport'), btnWav = el('btnWav'), btnMp3 = el('btnMp3'), btnOgg = el('btnOgg');
  const statusLine = el('statusLine');
  const normalizeToggle = el('normalizeToggle');
  const ledDecode = el('ledDecode'), ledProc = el('ledProc'), ledOut = el('ledOut'), ledPeak = el('ledPeak');
  const vuNeedle = el('vuNeedle');
  const histList = el('histList');

  function setStatus(msg, kind){
    statusLine.textContent = msg;
    statusLine.className = 'status-line' + (kind ? (' '+kind) : '');
  }
  function setLed(node, state){
    node.className = 'led' + (state && state!=='off' ? (' on-'+state) : '');
  }

  // ---------- File loading ----------
  dropZone.addEventListener('click', ()=>fileInput.click());
  dropZone.addEventListener('dragover', e=>{e.preventDefault();dropZone.classList.add('drag');});
  dropZone.addEventListener('dragleave', ()=>dropZone.classList.remove('drag'));
  dropZone.addEventListener('drop', e=>{
    e.preventDefault();dropZone.classList.remove('drag');
    if(e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', e=>{
    if(e.target.files.length) handleFile(e.target.files[0]);
  });

  async function handleFile(file){
    sourceFile = file;
    setStatus('Membaca & decode audio…');
    setLed(ledDecode,'off'); setLed(ledProc,'off'); setLed(ledOut,'off');
    try{
      if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
      const arrayBuf = await file.arrayBuffer();
      const decoded = await audioCtx.decodeAudioData(arrayBuf.slice(0));
      originalBuffer = decoded;
      setLed(ledDecode,'green');
      fileMeta.style.display='flex';
      fileNameEl.textContent = file.name;
      fileDurEl.textContent = formatTime(decoded.duration);
      waveBox.classList.add('show');
      drawWaveform(decoded);
      trimStart.min=0; trimStart.max=decoded.duration; trimStart.value=0; trimStart.step=0.01;
      trimEnd.min=0; trimEnd.max=decoded.duration; trimEnd.value=decoded.duration; trimEnd.step=0.01;
      updateTrimReadout();
      btnPreview.disabled=false; btnExport.disabled=false;
      btnWav.disabled=true; btnMp3.disabled=true;
      wavBlobUrl=null; mp3BlobUrl=null;
      setStatus('File siap. Atur speed/pitch/EQ lalu klik Konversi Audio.', 'ok');
    }catch(err){
      console.error(err);
      setStatus('Gagal decode file audio: '+err.message, 'err');
      setLed(ledDecode,'red');
    }
  }

  function formatTime(s){
    s = Math.max(0,s|0);
    const m = Math.floor(s/60), sec = s%60;
    return m+':' + String(sec).padStart(2,'0');
  }

  function drawWaveform(buffer){
    const ctx = waveCanvas.getContext('2d');
    const w = waveCanvas.width, h = waveCanvas.height;
    ctx.clearRect(0,0,w,h);
    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length/w);
    ctx.strokeStyle = '#4fbfb2';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for(let x=0;x<w;x++){
      let min=1,max=-1;
      const start=x*step;
      for(let i=0;i<step;i++){
        const v = data[start+i]||0;
        if(v<min)min=v; if(v>max)max=v;
      }
      const y1 = (1+min)*0.5*h;
      const y2 = (1+max)*0.5*h;
      ctx.moveTo(x,y1); ctx.lineTo(x,y2);
    }
    ctx.stroke();
  }

  function updateTrimReadout(){
    const s = parseFloat(trimStart.value), e = parseFloat(trimEnd.value);
    trimStartVal.textContent = s.toFixed(2)+'s';
    trimEndVal.textContent = e.toFixed(2)+'s';
    if(originalBuffer){
      const dur = originalBuffer.duration;
      const leftPct = (s/dur)*100, rightPct = (1-(e/dur))*100;
      trimOverlay.style.left = leftPct+'%';
      trimOverlay.style.right = rightPct+'%';
    }
  }
  trimStart.addEventListener('input', ()=>{
    if(parseFloat(trimStart.value) > parseFloat(trimEnd.value)-0.05){
      trimStart.value = Math.max(0, parseFloat(trimEnd.value)-0.05);
    }
    updateTrimReadout();
  });
  trimEnd.addEventListener('input', ()=>{
    if(parseFloat(trimEnd.value) < parseFloat(trimStart.value)+0.05){
      trimEnd.value = Math.min(originalBuffer.duration, parseFloat(trimStart.value)+0.05);
    }
    updateTrimReadout();
  });

  // ---------- Advanced Settings panel (collapse + summary) ----------
  let advCollapsed = false;
  advToggle.addEventListener('click', ()=>{
    advCollapsed = !advCollapsed;
    advBody.classList.toggle('collapsed', advCollapsed);
    advToggle.classList.toggle('collapsed', advCollapsed);
  });

  function updateAdvSummary(){
    advSummary.textContent = `(Speed: ${parseFloat(speed.value).toFixed(1)}x, Amplify: ${parseInt(amplify.value,10)} dB, Max: ${maxDuration.value}s)`;
  }

  function highlightSpeedPreset(){
    const cur = parseFloat(speed.value).toFixed(1);
    speedPresets.querySelectorAll('.chip').forEach(chip=>{
      chip.classList.toggle('active', parseFloat(chip.dataset.speed).toFixed(1) === cur);
    });
  }

  speedPresets.querySelectorAll('.chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      speed.value = chip.dataset.speed;
      speed.dispatchEvent(new Event('input'));
    });
  });

  // ---------- Rate/Gain readouts ----------
  speed.addEventListener('input', ()=>{
    speedVal.textContent = parseFloat(speed.value).toFixed(2)+'x';
    speedNormalReadout.textContent = 'Speed Normal (di game): ' + (1/parseFloat(speed.value)).toFixed(2);
    highlightSpeedPreset();
    updateAdvSummary();
  });
  pitch.addEventListener('input', ()=>{
    const v = parseInt(pitch.value,10);
    pitchVal.textContent = (v>0?'+':'')+v+' st';
  });
  amplify.addEventListener('input', ()=>{
    const v = parseInt(amplify.value,10);
    ampVal.textContent = (v>0?'+':'')+v+' dB';
    updateAdvSummary();
  });
  maxDuration.addEventListener('input', ()=>{
    maxDurVal.textContent = maxDuration.value+'s';
    updateAdvSummary();
  });

  // ---------- DSP helpers ----------
  function hannWindow(n){
    const w = new Float32Array(n);
    for(let i=0;i<n;i++) w[i] = 0.5 - 0.5*Math.cos((2*Math.PI*i)/(n-1));
    return w;
  }
  function resampleLinear(data, rate){
    if(rate===1) return data;
    const outLen = Math.max(1, Math.floor(data.length/rate));
    const out = new Float32Array(outLen);
    for(let i=0;i<outLen;i++){
      const srcIdx = i*rate;
      const i0 = Math.floor(srcIdx);
      const i1 = Math.min(i0+1, data.length-1);
      const frac = srcIdx-i0;
      out[i] = data[i0]*(1-frac) + data[i1]*frac;
    }
    return out;
  }
  function timeStretch(data, factor){
    if(Math.abs(factor-1) < 1e-6) return data;
    const grain = 4096;
    const hopIn = Math.round(grain*0.25);
    const hopOut = Math.round(hopIn*factor);
    const win = hannWindow(grain);
    const outLen = Math.ceil(data.length*factor) + grain;
    const out = new Float32Array(outLen);
    const winSum = new Float32Array(outLen);
    let inPos=0, outPos=0;
    while(inPos+grain <= data.length){
      for(let i=0;i<grain;i++){
        out[outPos+i] += data[inPos+i]*win[i];
        winSum[outPos+i] += win[i]*win[i];
      }
      inPos += hopIn;
      outPos += hopOut;
      if(outPos+grain >= outLen) break;
    }
    for(let i=0;i<out.length;i++){ if(winSum[i]>1e-6) out[i] /= winSum[i]; }
    const finalLen = Math.round(data.length*factor);
    return out.slice(0, Math.max(1,finalLen));
  }
  function pitchShift(data, semitones){
    if(!semitones) return data;
    const rate = Math.pow(2, semitones/12);
    const resampled = resampleLinear(data, rate);
    const factor = data.length/resampled.length;
    return timeStretch(resampled, factor);
  }

  async function renderGain(buffer, ampDb){
    const offline = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    const src = offline.createBufferSource();
    src.buffer = buffer;
    const gain = offline.createGain();
    gain.gain.value = Math.pow(10, ampDb/20);
    src.connect(gain);
    gain.connect(offline.destination);
    src.start(0);
    return await offline.startRendering();
  }

  function normalizeBuffer(buffer, targetPeak){
    let peak = 0;
    for(let c=0;c<buffer.numberOfChannels;c++){
      const data = buffer.getChannelData(c);
      for(let i=0;i<data.length;i++){
        const a = Math.abs(data[i]);
        if(a>peak) peak=a;
      }
    }
    if(peak < 1e-9) return { buffer, peak };
    const scale = targetPeak/peak;
    for(let c=0;c<buffer.numberOfChannels;c++){
      const data = buffer.getChannelData(c);
      for(let i=0;i<data.length;i++) data[i] *= scale;
    }
    return { buffer, peak: peak*scale };
  }

  function truncateBuffer(buffer, maxSeconds){
    const sr = buffer.sampleRate;
    const maxSamples = Math.min(buffer.length, Math.floor(maxSeconds*sr));
    const out = audioCtx.createBuffer(buffer.numberOfChannels, maxSamples, sr);
    for(let c=0;c<buffer.numberOfChannels;c++){
      out.getChannelData(c).set(buffer.getChannelData(c).subarray(0, maxSamples));
    }
    return out;
  }

  function buildProcessedBuffer(orig, trimS, trimE, speedRate, pitchSt){
    const sr = orig.sampleRate;
    const startSample = Math.floor(trimS*sr);
    const endSample = Math.floor(trimE*sr);
    const channels = [];
    let minLen = Infinity;
    for(let c=0;c<orig.numberOfChannels;c++){
      let data = orig.getChannelData(c).slice(startSample, endSample);
      if(speedRate !== 1) data = resampleLinear(data, speedRate);
      if(pitchSt) data = pitchShift(data, pitchSt);
      channels.push(data);
      if(data.length < minLen) minLen = data.length;
    }
    const buf = audioCtx.createBuffer(orig.numberOfChannels, Math.max(1,minLen), sr);
    channels.forEach((data,c)=> buf.getChannelData(c).set(data.subarray(0,minLen)));
    return buf;
  }

  // ---------- WAV encoding ----------
  function encodeWav(buffer){
    const numCh = buffer.numberOfChannels;
    const sr = buffer.sampleRate;
    const len = buffer.length;
    const bytesPerSample = 2;
    const blockAlign = numCh*bytesPerSample;
    const dataSize = len*blockAlign;
    const bufArr = new ArrayBuffer(44+dataSize);
    const view = new DataView(bufArr);
    function writeStr(off,str){ for(let i=0;i<str.length;i++) view.setUint8(off+i, str.charCodeAt(i)); }
    writeStr(0,'RIFF'); view.setUint32(4, 36+dataSize, true);
    writeStr(8,'WAVE'); writeStr(12,'fmt ');
    view.setUint32(16,16,true); view.setUint16(20,1,true);
    view.setUint16(22,numCh,true); view.setUint32(24,sr,true);
    view.setUint32(28, sr*blockAlign, true); view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeStr(36,'data'); view.setUint32(40, dataSize, true);
    let offset=44;
    const chans=[]; for(let c=0;c<numCh;c++) chans.push(buffer.getChannelData(c));
    for(let i=0;i<len;i++){
      for(let c=0;c<numCh;c++){
        let s = Math.max(-1, Math.min(1, chans[c][i]));
        s = s<0 ? s*0x8000 : s*0x7FFF;
        view.setInt16(offset, s, true);
        offset+=2;
      }
    }
    return new Blob([bufArr], {type:'audio/wav'});
  }

  function encodeMp3(buffer){
    if(typeof lamejs === 'undefined') return null;
    try{
      const numCh = Math.min(2, buffer.numberOfChannels);
      const sr = buffer.sampleRate;
      const encoder = new lamejs.Mp3Encoder(numCh, sr, 128);
      const blockSize = 1152;
      const chans = []; for(let c=0;c<numCh;c++) chans.push(buffer.getChannelData(c));
      const mp3Data = [];
      const toInt16 = (f)=>{
        const out = new Int16Array(f.length);
        for(let i=0;i<f.length;i++){
          let s = Math.max(-1,Math.min(1,f[i]));
          out[i] = s<0 ? s*0x8000 : s*0x7FFF;
        }
        return out;
      };
      const left16 = toInt16(chans[0]);
      const right16 = numCh>1 ? toInt16(chans[1]) : null;
      for(let i=0;i<left16.length;i+=blockSize){
        const lChunk = left16.subarray(i, i+blockSize);
        let mp3buf;
        if(right16){
          const rChunk = right16.subarray(i, i+blockSize);
          mp3buf = encoder.encodeBuffer(lChunk, rChunk);
        } else {
          mp3buf = encoder.encodeBuffer(lChunk);
        }
        if(mp3buf.length>0) mp3Data.push(mp3buf);
      }
      const end = encoder.flush();
      if(end.length>0) mp3Data.push(end);
      return new Blob(mp3Data, {type:'audio/mp3'});
    }catch(err){
      console.error('MP3 encode failed', err);
      return null;
    }
  }

  // ---------- OGG encoding (fast, offline, via WebAssembly Opus encoder worker) ----------
  function encodeOgg(buffer){
    return new Promise((resolve)=>{
      let settled = false;
      let worker;
      const finish = (result)=>{
        if(settled) return;
        settled = true;
        clearTimeout(timeoutId);
        try{ if(worker) worker.terminate(); }catch(e){}
        resolve(result);
      };
      // Safety timeout: never let this hang the UI forever if something goes wrong.
      const timeoutMs = Math.max(15000, buffer.duration * 1000 * 0.5 + 10000);
      const timeoutId = setTimeout(()=>{ console.error('OGG encode timed out'); finish(null); }, timeoutMs);

      try{
        worker = new Worker('encoderWorker.min.js');
      }catch(err){
        console.error('Could not start OGG encoder worker', err);
        finish(null);
        return;
      }

      const numberOfChannels = Math.min(2, buffer.numberOfChannels);
      const channelData = [];
      for(let c=0;c<numberOfChannels;c++) channelData.push(buffer.getChannelData(c));
      const totalLength = buffer.length;
      const bufferLength = 4096;
      const pages = [];

      worker.onerror = (err)=>{
        console.error('OGG encoder worker error', err);
        finish(null);
      };

      worker.onmessage = (e)=>{
        const data = e.data;
        if(!data) return;
        if(data.message === 'ready'){
          worker.postMessage({ command: 'getHeaderPages' });
        } else if(data.message === 'page'){
          pages.push(data.page);
          if(pages.length === 2){
            sendAllChunks();
          }
        } else if(data.message === 'done'){
          finish(new Blob(pages, {type:'audio/ogg'}));
        }
      };

      function sendAllChunks(){
        let pos = 0;
        while(pos < totalLength){
          const len = Math.min(bufferLength, totalLength - pos);
          const chunkBuffers = [];
          for(let c=0;c<numberOfChannels;c++){
            const chunk = new Float32Array(bufferLength);
            chunk.set(channelData[c].subarray(pos, pos+len));
            chunkBuffers.push(chunk);
          }
          worker.postMessage({ command: 'encode', buffers: chunkBuffers });
          pos += bufferLength;
        }
        worker.postMessage({ command: 'done' });
      }

      worker.postMessage({
        command: 'init',
        originalSampleRate: buffer.sampleRate,
        numberOfChannels: numberOfChannels,
        encoderSampleRate: 48000,
        encoderBitRate: 128000,
        encoderApplication: 2049,
        encoderFrameSize: 20,
        maxFramesPerPage: 40,
        resampleQuality: 3
      });
    });
  }

  // ---------- VU meter ----------
  function setNeedle(level){
    const angle = -45 + level*90;
    vuNeedle.style.transform = `rotate(${angle}deg)`;
  }

  function stopPreview(){
    if(previewSource){ try{previewSource.stop();}catch(e){} previewSource=null; }
    if(vuRAF){ cancelAnimationFrame(vuRAF); vuRAF=null; }
    setNeedle(0);
    btnPreview.textContent = '▶ Preview';
  }

  btnPreview.addEventListener('click', ()=>{
    if(previewSource){ stopPreview(); return; }
    if(!originalBuffer) return;
    const sr = originalBuffer.sampleRate;
    const s = parseFloat(trimStart.value), e = parseFloat(trimEnd.value);
    const startSample = Math.floor(s*sr), endSample = Math.floor(e*sr);
    const len = Math.max(1, endSample-startSample);
    const trimmed = audioCtx.createBuffer(originalBuffer.numberOfChannels, len, sr);
    for(let c=0;c<originalBuffer.numberOfChannels;c++){
      trimmed.getChannelData(c).set(originalBuffer.getChannelData(c).subarray(startSample,endSample));
    }
    const src = audioCtx.createBufferSource();
    src.buffer = trimmed;
    const speedRate = parseFloat(speed.value);
    const pitchSt = parseInt(pitch.value,10);
    src.playbackRate.value = speedRate * Math.pow(2, pitchSt/12);

    let node = src;
    const gain = audioCtx.createGain();
    gain.gain.value = Math.pow(10, parseFloat(amplify.value)/20);
    node.connect(gain);

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    gain.connect(analyser);
    analyser.connect(audioCtx.destination);

    previewSource = src;
    src.onended = ()=>{ stopPreview(); };
    src.start(0);
    btnPreview.textContent = '■ Stop';

    const dataArr = new Uint8Array(analyser.frequencyBinCount);
    function loop(){
      analyser.getByteTimeDomainData(dataArr);
      let peak=0;
      for(let i=0;i<dataArr.length;i++){
        const v = Math.abs(dataArr[i]-128)/128;
        if(v>peak) peak=v;
      }
      setNeedle(Math.min(1,peak));
      setLed(ledPeak, peak>0.95 ? 'red' : (peak>0.02?'green':'off'));
      vuRAF = requestAnimationFrame(loop);
    }
    loop();
  });

  function triggerDownload(blobUrl, ext){
    if(!blobUrl) return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = (sourceFile? sourceFile.name.replace(/\.[^.]+$/,'') : 'audio') + '_playbackbay.' + ext;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ---------- Export pipeline ----------
  btnExport.addEventListener('click', async ()=>{
    if(!originalBuffer) return;
    stopPreview();
    btnExport.disabled = true;
    btnWav.disabled = true; btnMp3.disabled = true; btnOgg.disabled = true;
    setLed(ledProc,'off'); setLed(ledOut,'off');
    try{
      setStatus('Memproses speed & pitch…');
      const s = parseFloat(trimStart.value), e = parseFloat(trimEnd.value);
      const speedRate = parseFloat(speed.value);
      const pitchSt = parseInt(pitch.value,10);
      const processed = buildProcessedBuffer(originalBuffer, s, e, speedRate, pitchSt);
      setLed(ledProc,'green');

      setStatus('Menerapkan amplify…');
      const ampDb = parseFloat(amplify.value);
      let rendered = await renderGain(processed, ampDb);

      if(normalizeToggle.checked){
        setStatus('Normalisasi volume…');
        normalizeBuffer(rendered, 0.891);
      }

      const maxDurSec = parseFloat(maxDuration.value);
      if(rendered.duration > maxDurSec){
        setStatus('Memotong ke Durasi Maks ('+maxDurSec+'s)…');
        rendered = truncateBuffer(rendered, maxDurSec);
      }

      setLed(ledOut,'green');

      setStatus('Encoding WAV…');
      const wavBlob = encodeWav(rendered);
      if(wavBlobUrl) URL.revokeObjectURL(wavBlobUrl);
      wavBlobUrl = URL.createObjectURL(wavBlob);
      btnWav.disabled = false;

      setStatus('Encoding MP3…');
      const mp3Blob = encodeMp3(rendered);
      if(mp3Blob){
        if(mp3BlobUrl) URL.revokeObjectURL(mp3BlobUrl);
        mp3BlobUrl = URL.createObjectURL(mp3Blob);
        btnMp3.disabled = false;
      } else {
        btnMp3.disabled = true;
      }

      setStatus('Encoding OGG…');
      lastRenderedBuffer = rendered;
      let oggBlob = null;
      try{ oggBlob = await encodeOgg(rendered); }catch(err){ console.error('OGG encode failed', err); }
      if(oggBlob){
        if(oggBlobUrl) URL.revokeObjectURL(oggBlobUrl);
        oggBlobUrl = URL.createObjectURL(oggBlob);
        btnOgg.disabled = false;
        btnOgg.title = '';
      } else {
        btnOgg.disabled = true;
        btnOgg.title = 'Encoding OGG gagal di browser ini. Gunakan MP3 atau WAV.';
      }

      const speedNormal = (1/speedRate).toFixed(2);

      if(oggBlob){
        setStatus('Selesai. Auto-download OGG · Speed Normal (di game): '+speedNormal+' · Durasi hasil: '+formatTime(rendered.duration), 'ok');
        triggerDownload(oggBlobUrl, 'ogg');
      } else if(mp3Blob){
        setStatus('Selesai. OGG gagal di browser ini, auto-download MP3 sebagai gantinya · Speed Normal (di game): '+speedNormal+' · Durasi hasil: '+formatTime(rendered.duration), 'ok');
        triggerDownload(mp3BlobUrl, 'mp3');
      } else {
        setStatus('Selesai. OGG & MP3 tidak tersedia, auto-download WAV · Speed Normal (di game): '+speedNormal+' · Durasi hasil: '+formatTime(rendered.duration), 'ok');
        triggerDownload(wavBlobUrl, 'wav');
      }

      saveHistoryEntry({
        filename: sourceFile ? sourceFile.name : 'audio',
        speed: speedRate, pitch: pitchSt, amplify: ampDb,
        trimStart: s, trimEnd: e,
        maxDuration: maxDurSec,
        normalize: normalizeToggle.checked,
        outDuration: rendered.duration,
        hasMp3: !!mp3Blob,
        hasOgg: !!oggBlob,
        createdAt: Date.now()
      });
    }catch(err){
      console.error(err);
      setStatus('Gagal memproses: '+err.message, 'err');
      setLed(ledProc,'red');
    }finally{
      btnExport.disabled = false;
    }
  });

  btnWav.addEventListener('click', ()=> triggerDownload(wavBlobUrl, 'wav'));
  btnMp3.addEventListener('click', ()=> triggerDownload(mp3BlobUrl, 'mp3'));
  btnOgg.addEventListener('click', ()=> triggerDownload(oggBlobUrl, 'ogg'));

  // ---------- History (localStorage, browser-local) ----------
  function readHistory(){
    try{
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    }catch(err){
      console.error('history read failed', err);
      return [];
    }
  }
  function writeHistory(list){
    try{
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX)));
    }catch(err){
      console.error('history write failed', err);
    }
  }
  function saveHistoryEntry(entry){
    const list = readHistory();
    list.unshift(entry);
    writeHistory(list);
    renderHistory();
  }
  function deleteHistoryEntry(createdAt){
    const list = readHistory().filter(item => item.createdAt !== createdAt);
    writeHistory(list);
    renderHistory();
  }
  function renderHistory(){
    const list = readHistory();
    if(!list.length){
      histList.innerHTML = '<div class="hist-empty">Belum ada riwayat konversi.</div>';
      return;
    }
    histList.innerHTML = '';
    list.forEach(data=>{
      const div = document.createElement('div');
      div.className = 'hist-item';
      const date = new Date(data.createdAt);
      div.innerHTML = `
        <button class="hist-del" data-created="${data.createdAt}">✕</button>
        <div class="hist-name">${escapeHtml(data.filename)}</div>
        <div class="hist-meta">
          Speed: <span class="accent">${data.speed.toFixed(2)}x</span> ·
          Pitch: <span class="accent">${data.pitch>0?'+':''}${data.pitch}st</span> ·
          Amp: <span class="accent">${data.amplify>0?'+':''}${data.amplify}dB</span><br>
          Speed Normal (di game): <span class="accent">${(1/data.speed).toFixed(2)}</span> ·
          Max: <span class="accent">${data.maxDuration||400}s</span><br>
          Trim: ${data.trimStart.toFixed(1)}s–${data.trimEnd.toFixed(1)}s · ${data.normalize?'Normalized':'No normalize'}<br>
          ${date.toLocaleString('id-ID')}
        </div>
      `;
      histList.appendChild(div);
    });
    histList.querySelectorAll('.hist-del').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        deleteHistoryEntry(parseFloat(btn.dataset.created));
      });
    });
  }
  function escapeHtml(str){
    const d = document.createElement('div'); d.textContent = str; return d.innerHTML;
  }

  renderHistory();
  updateAdvSummary();
  highlightSpeedPreset();
})();
