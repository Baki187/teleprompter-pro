/* =============================
   TELEPROMPTER PRO — app.js
   ============================= */

(function () {
  'use strict';

  // ── DOM refs ──────────────────────────────────────────────────
  const setupScreen   = document.getElementById('setup-screen');
  const prompterScreen = document.getElementById('prompter-screen');

  const scriptInput   = document.getElementById('script-input');
  const fontSizeSetup = document.getElementById('font-size-setup');
  const fontSizeVal   = document.getElementById('font-size-val');
  const speedSetup    = document.getElementById('speed-setup');
  const speedVal      = document.getElementById('speed-val');
  const themeSetup    = document.getElementById('theme-setup');
  const cameraToggle  = document.getElementById('camera-toggle');
  const cameraToggleLabel = document.getElementById('camera-toggle-label');
  const startBtn      = document.getElementById('start-btn');

  const prompterText  = document.getElementById('prompter-text');
  const prompterVP    = document.getElementById('prompter-viewport');
  const playPauseBtn  = document.getElementById('play-pause-btn');
  const recordBtn     = document.getElementById('record-btn');
  const restartBtn    = document.getElementById('restart-btn');
  const backBtn       = document.getElementById('back-btn');
  const fullscreenBtn = document.getElementById('fullscreen-btn');
  const controlsBar   = document.getElementById('controls-bar');
  const progressBar   = document.getElementById('progress-bar');

  const cameraPip     = document.getElementById('camera-pip');
  const cameraVideo   = document.getElementById('camera-video');
  const recBadge      = document.getElementById('rec-badge');
  const cameraError   = document.getElementById('camera-error');
  const camErrText    = document.getElementById('cam-err-text');
  const camRetryBtn   = document.getElementById('cam-retry-btn');

  const speedOverlay  = document.getElementById('speed-overlay');
  const speedRuntime  = document.getElementById('speed-runtime');
  const speedRuntimeVal = document.getElementById('speed-runtime-val');

  const downloadModal = document.getElementById('download-modal');
  const downloadBtn   = document.getElementById('download-btn');
  const dismissBtn    = document.getElementById('dismiss-btn');
  const countdownToast = document.getElementById('countdown-toast');
  const countdownNum   = document.getElementById('countdown-num');
  const startOverlay   = document.getElementById('start-overlay');
  const startScrollBtn = document.getElementById('start-scroll-btn');

  // ── State ─────────────────────────────────────────────────────
  let isPlaying       = false;
  let isRecording     = false;
  let scrollPos       = 0;        // px from top
  let scrollHeight    = 0;
  let animFrame       = null;
  let lastTimestamp   = null;
  let speed           = 3;        // 1-10

  let mediaStream     = null;
  let mediaRecorder   = null;
  let recordedChunks  = [];
  let recordedBlob    = null;
  let recordingUrl    = null;

  let controlsTimeout = null;

  // Drag state for camera PiP
  let drag = { active: false, startX: 0, startY: 0, startLeft: 0, startTop: 0 };

  // ── Setup screen interactions ─────────────────────────────────

  fontSizeSetup.addEventListener('input', () => {
    fontSizeVal.textContent = fontSizeSetup.value + 'px';
  });

  speedSetup.addEventListener('input', () => {
    speedVal.textContent = speedSetup.value;
  });

  cameraToggle.addEventListener('change', () => {
    cameraToggleLabel.textContent = cameraToggle.checked ? 'Açık' : 'Kapalı';
  });

  speedRuntime.addEventListener('input', () => {
    speed = parseInt(speedRuntime.value, 10);
    speedRuntimeVal.textContent = speed;
  });

  // ── START ─────────────────────────────────────────────────────
  startBtn.addEventListener('click', async () => {
    const text = scriptInput.value.trim();
    if (!text) {
      scriptInput.focus();
      scriptInput.style.borderColor = '#ef4444';
      setTimeout(() => { scriptInput.style.borderColor = ''; }, 1000);
      return;
    }

    // Apply settings
    prompterText.textContent  = text;
    prompterText.style.fontSize = fontSizeSetup.value + 'px';
    speed = parseInt(speedSetup.value, 10);
    speedRuntime.value = speed;
    speedRuntimeVal.textContent = speed;

    // Theme
    prompterScreen.className = 'screen';
    const theme = themeSetup.value;
    if (theme !== 'dark') prompterScreen.classList.add('theme-' + theme);

    // Reset scroll
    scrollPos  = 0;
    lastTimestamp = null;
    isPlaying  = false;
    updatePlayBtn();
    prompterVP.scrollTop = 0;  // native scroll sıfırla
    updateProgress();

    // Transition screens
    setupScreen.classList.remove('active');
    prompterScreen.style.display = 'flex';
    requestAnimationFrame(() => { prompterScreen.style.opacity = '1'; });
    prompterScreen.classList.add('active');

    // Camera
    if (cameraToggle.checked) {
      await initCamera();
    } else {
      cameraPip.style.display = 'none';
    }

    showControls();

    // Start overlay'i göster — kullanıcı hazır olunca başlatır
    startOverlay.classList.remove('hidden');
  });

  // ── CAMERA ────────────────────────────────────────────────────

  async function initCamera() {
    cameraError.classList.add('hidden');
    cameraVideo.style.display = 'block';
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: true,
      });
      cameraVideo.srcObject = mediaStream;
      cameraPip.style.display = 'block';
    } catch (err) {
      console.warn('Camera error:', err);
      // Hata türüne göre mesaj
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        camErrText.textContent = 'Kamera izni reddedildi';
      } else if (err.name === 'NotFoundError') {
        camErrText.textContent = 'Kamera bulunamadı';
      } else {
        camErrText.textContent = 'Kamera açılamadı';
      }
      cameraVideo.style.display = 'none';
      cameraError.classList.remove('hidden');
    }
  }

  // Kamera tekrar deneme butonu
  camRetryBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await initCamera();
  });

  // ── SCROLL ANIMATION ──────────────────────────────────────────

  function getMaxScroll() {
    // offsetHeight = gerçek render yüksekliği (transform'dan etkilenmez)
    // position:fixed artık doğru çalışıyor, bu hesap doğru sonuç verir
    return Math.max(0, prompterText.offsetHeight - prompterVP.clientHeight);
  }

  function applyScroll() {
    prompterText.style.transform = `translateY(${-scrollPos}px)`;  // mask-image ile uyumlu
  }

  function updateProgress() {
    const max = getMaxScroll();
    const pct = max > 0 ? Math.min(100, (scrollPos / max) * 100) : 0;
    progressBar.style.width = pct + '%';
  }

  function animate(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    const delta = timestamp - lastTimestamp;
    lastTimestamp = timestamp;

    // px/sec = speed * 30
    const pxPerSec = speed * 30;
    scrollPos += (pxPerSec * delta) / 1000;

    const max = getMaxScroll();
    if (scrollPos >= max) {
      scrollPos = max;
      applyScroll();
      updateProgress();
      // Auto-stop at end
      isPlaying = false;
      updatePlayBtn();
      lastTimestamp = null;
      return; // stop loop
    }

    applyScroll();
    updateProgress();
    animFrame = requestAnimationFrame(animate);
  }

  function play() {
    if (isPlaying) return;
    // Start overlay'i gizle
    startOverlay.classList.add('hidden');
    isPlaying = true;
    lastTimestamp = null;
    animFrame = requestAnimationFrame(animate);
    updatePlayBtn();
    scheduleHideControls();
  }

  function pause() {
    if (!isPlaying) return;
    isPlaying = false;
    if (animFrame) cancelAnimationFrame(animFrame);
    lastTimestamp = null;
    updatePlayBtn();
    showControls();
  }

  function updatePlayBtn() {
    playPauseBtn.textContent = isPlaying ? '⏸' : '▶';
  }

  // ── CONTROLS VISIBILITY ───────────────────────────────────────

  function showControls() {
    controlsBar.classList.remove('hidden');
    clearTimeout(controlsTimeout);
  }

  function scheduleHideControls() {
    clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(() => {
      if (isPlaying) controlsBar.classList.add('hidden');
    }, 3000);
  }

  // ── START OVERLAY BUTTON ──────────────────────────────────────

  function beginCountdown() {
    startOverlay.classList.add('hidden');  // overlay'i kapat
    countdownToast.classList.remove('hidden');
    countdownNum.textContent = '2';
    setTimeout(() => { countdownNum.textContent = '1'; }, 1000);
    setTimeout(() => {
      countdownToast.classList.add('hidden');
      play();
    }, 2000);
  }

  startScrollBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    beginCountdown();
  });

  // Viewport'a dokunmak da başlatır (overlay açıkken) veya play/pause yapar
  prompterVP.addEventListener('click', (e) => {
    if (e.target.closest('.camera-pip')) return;

    // Overlay açıksa → başlat
    if (!startOverlay.classList.contains('hidden')) {
      beginCountdown();
      return;
    }

    if (controlsBar.classList.contains('hidden')) {
      showControls();
      if (isPlaying) scheduleHideControls();
    } else {
      isPlaying ? pause() : play();
    }
  });

  // Long press on viewport → show speed overlay
  let longPressTimer = null;
  prompterVP.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.camera-pip')) return;
    longPressTimer = setTimeout(() => {
      speedOverlay.classList.remove('hidden');
      if (isPlaying) pause();
    }, 600);
  });
  prompterVP.addEventListener('pointerup',   () => clearTimeout(longPressTimer));
  prompterVP.addEventListener('pointerleave',() => clearTimeout(longPressTimer));

  // Tap outside speed overlay to close
  speedOverlay.addEventListener('click', (e) => {
    if (e.target === speedOverlay) speedOverlay.classList.add('hidden');
  });

  // ── CONTROL BUTTONS ───────────────────────────────────────────

  playPauseBtn.addEventListener('click', () => {
    isPlaying ? pause() : play();
  });

  restartBtn.addEventListener('click', () => {
    pause();
    scrollPos   = 0;
    lastTimestamp = null;
    applyScroll();
    updateProgress();
  });

  backBtn.addEventListener('click', () => {
    pause();
    stopRecording(false);
    stopCamera();

    prompterScreen.style.opacity = '0';
    setTimeout(() => {
      prompterScreen.classList.remove('active');
      prompterScreen.style.display = 'none';
      setupScreen.classList.add('active');
    }, 400);
  });

  fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
      fullscreenBtn.textContent = '⛶';
    } else {
      document.exitFullscreen && document.exitFullscreen();
    }
  });

  // ── RECORDING ─────────────────────────────────────────────────

  recordBtn.addEventListener('click', () => {
    if (!isRecording) {
      startRecording();
    } else {
      stopRecording(true);
    }
  });

  function startRecording() {
    if (!mediaStream) {
      alert('Kayıt için kamera/mikrofon erişimi gerekli. Lütfen kamerayı açın.');
      return;
    }
    recordedChunks = [];

    // Prefer common formats
    const mimeTypes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4',
    ];
    const mimeType = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || '';

    try {
      mediaRecorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : {});
    } catch (e) {
      mediaRecorder = new MediaRecorder(mediaStream);
    }

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      recordedBlob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'video/webm' });
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
      recordingUrl = URL.createObjectURL(recordedBlob);
      showDownloadModal();
    };

    mediaRecorder.start(100); // collect data every 100ms
    isRecording = true;
    recBadge.classList.remove('hidden');
    recordBtn.classList.add('recording');
    recordBtn.title = 'Kaydı Durdur';
  }

  function stopRecording(showModal) {
    if (!isRecording || !mediaRecorder) return;
    isRecording = false;
    recBadge.classList.add('hidden');
    recordBtn.classList.remove('recording');
    recordBtn.title = 'Kayıt Başlat';
    if (showModal) {
      mediaRecorder.stop();
    } else {
      mediaRecorder.ondataavailable = null;
      mediaRecorder.onstop = null;
      mediaRecorder.stop();
    }
  }

  function stopCamera() {
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }
    cameraVideo.srcObject = null;
  }

  // ── DOWNLOAD MODAL ────────────────────────────────────────────

  function showDownloadModal() {
    downloadModal.classList.remove('hidden');
  }

  downloadBtn.addEventListener('click', () => {
    if (!recordingUrl) return;
    const ext = (recordedBlob.type.includes('mp4')) ? 'mp4' : 'webm';
    const a = document.createElement('a');
    a.href = recordingUrl;
    a.download = `teleprompter-kayit-${Date.now()}.${ext}`;
    a.click();
    downloadModal.classList.add('hidden');
  });

  dismissBtn.addEventListener('click', () => {
    downloadModal.classList.add('hidden');
  });

  // ── CAMERA PiP DRAG ───────────────────────────────────────────

  cameraPip.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    drag.active = true;
    cameraPip.classList.add('dragging');
    cameraPip.setPointerCapture(e.pointerId);

    drag.startX = e.clientX;
    drag.startY = e.clientY;
    const rect = cameraPip.getBoundingClientRect();
    drag.startLeft = rect.left;
    drag.startTop  = rect.top;
  });

  cameraPip.addEventListener('pointermove', (e) => {
    if (!drag.active) return;
    e.preventDefault();
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    let newLeft = drag.startLeft + dx;
    let newTop  = drag.startTop  + dy;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w  = cameraPip.offsetWidth;
    const h  = cameraPip.offsetHeight;

    newLeft = Math.max(0, Math.min(vw - w, newLeft));
    newTop  = Math.max(0, Math.min(vh - h, newTop));

    cameraPip.style.left   = newLeft + 'px';
    cameraPip.style.right  = 'auto';
    cameraPip.style.top    = newTop + 'px';
  });

  cameraPip.addEventListener('pointerup', () => {
    drag.active = false;
    cameraPip.classList.remove('dragging');
  });

  // ── KEYBOARD SHORTCUTS ────────────────────────────────────────

  document.addEventListener('keydown', (e) => {
    if (!prompterScreen.classList.contains('active')) return;

    switch (e.key) {
      case ' ':
      case 'k':
        e.preventDefault();
        isPlaying ? pause() : play();
        break;
      case 'ArrowUp':
        e.preventDefault();
        speed = Math.max(1, speed - 1);
        speedRuntime.value = speed;
        speedRuntimeVal.textContent = speed;
        break;
      case 'ArrowDown':
        e.preventDefault();
        speed = Math.min(10, speed + 1);
        speedRuntime.value = speed;
        speedRuntimeVal.textContent = speed;
        break;
      case 'r':
        restartBtn.click();
        break;
      case 'Escape':
        backBtn.click();
        break;
    }
  });

})();
