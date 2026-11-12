
<style>
#edopro-load{position:fixed;inset:0;z-index:100000;display:flex!important;flex-direction:column;
  align-items:center;justify-content:center;gap:14px;background:#0d0f13;color:#dfe5ee;
  font:14px/1.5 'Malgun Gothic','Noto Sans KR',sans-serif;text-align:center;padding:24px}
#edopro-load .logo{font:700 30px/1 system-ui,sans-serif;letter-spacing:.14em;color:#9cc3ff}
#edopro-load .bar{width:min(360px,72vw);height:6px;border-radius:3px;background:#232833;overflow:hidden}
#edopro-load .bar>i{display:block;height:100%;width:0;border-radius:3px;background:linear-gradient(90deg,#4f8cff,#7cd0ff);transition:width .25s}
#edopro-load .msg{font-size:13px;color:#98a3b6;min-height:20px}
#edopro-load .err{max-width:min(560px,86vw);font-size:12px;color:#ff9b9b;white-space:pre-wrap}
#edopro-load.off{display:none!important}
#edopro-load button{margin-top:6px;padding:9px 22px;border-radius:8px;border:1px solid #3d4759;
  background:#1b2130;color:#dfe5ee;font-size:14px;display:none}
#edopro-load button.on{display:inline-block}
</style>
<div id="edopro-load">
  <div class="logo">EDOPRO</div>
  <div class="bar"><i id="edopro-bar"></i></div>
  <div class="msg" id="edopro-lmsg">&#48520;&#47084;&#50724;&#45716; &#51473;&#8230;</div>
  <div class="err" id="edopro-lerr"></div>
  <button id="edopro-retry" type="button">&#45796;&#49884; &#49884;&#46020;</button>
</div>
<script>
(function () {
  var box = document.getElementById('edopro-load');
  var bar = document.getElementById('edopro-bar');
  var msg = document.getElementById('edopro-lmsg');
  var err = document.getElementById('edopro-lerr');
  var btn = document.getElementById('edopro-retry');
  var t0 = Date.now();
  var done = false;

  function show(text) { if (msg) msg.textContent = text; }
  function fail(text) {
    var e = (window.__desc ? window.__desc(text) : String(text || ''));
    if (err && !err.textContent) err.textContent = e.slice(0, 300);
    if (btn) btn.classList.add('on');
    show('불러오지 못했습니다. 네트워크를 확인하고 다시 시도하세요.');
    if (window.__jlog) window.__jlog('LOAD-FAIL ' + e.slice(0, 200));
  }
  if (btn) btn.onclick = function () { location.reload(); };

  /* emscripten 셸이 갱신하는 #status 를 읽어 진행률을 옮겨온다 */
  var st = document.getElementById('status');
  var tick = setInterval(function () {
    if (done) { clearInterval(tick); return; }
    try {
      var cvs = document.querySelector('canvas');
      if ((window.Module && Module.calledRun) || (cvs && cvs.width > 320)) {
        done = true; clearInterval(tick);
        box.classList.add('off');
        return;
      }
    } catch (e) {}
    var txt = st ? (st.textContent || '') : '';
    var m = txt.match(/\((\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)\)/);
    if (m && bar) {
      var pct = Math.min(100, Math.max(0, parseFloat(m[1]) / parseFloat(m[2]) * 100));
      bar.style.width = pct.toFixed(1) + '%';
      show('불러오는 중… ' + Math.round(pct) + '%');
    } else if (txt) {
      show(txt.replace(/\s+/g, ' ').slice(0, 80));
    }
    var sec = (Date.now() - t0) / 1000;
    if (sec > 45 && !err.textContent) {
      show('불러오는 중… ' + Math.round(sec) + '초 (파일이 커서 시간이 걸립니다)');
    }
  }, 300);

  window.addEventListener('error', function (e) {
    if (e && e.message && e.message !== 'Script error.') fail(e.message);
  });
  /* 거부된 프로미스는 게임이 계속 돌 수 있으므로 경고만 남기고 화면을 막지 않는다 */
  window.addEventListener('unhandledrejection', function (e) {
    var d = (window.__desc ? window.__desc(e && e.reason) : 'unknown');
    if (window.__jlog) window.__jlog('WARN-REJ ' + d);
  });
  window.addEventListener('offline', function () { fail('네트워크 연결이 끊겼습니다.'); });
})();
</script>
