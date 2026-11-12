
<script>
/*fs-ime*/
/* SDL2-emscripten 에 IME 가 없어 HTML 입력을 게임 편집박스에 연결한다.
   - 게임이 편집박스를 포커스하면 Module.__edoproIME(1,...) 가 호출된다.
   - 터치 기기에서는 화면 아래에 입력 필드를 띄워 한 번 탭으로 키보드를 연다. */
(function () {
  var el = null, active = false;
  var MAP = { Backspace: 8, Enter: 13, Escape: 27, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Tab: 9, Delete: 46 };

  function sendChar(cp) {
    try {
      document.dispatchEvent(new KeyboardEvent('keypress', {
        charCode: cp, keyCode: cp, which: cp, key: String.fromCharCode(cp), bubbles: true, cancelable: true
      }));
    } catch (e) {}
  }
  function sendKey(kc) {
    var name = '';
    for (var k in MAP) { if (MAP[k] === kc) { name = k; break; } }
    ['keydown', 'keyup'].forEach(function (t) {
      try {
        document.dispatchEvent(new KeyboardEvent(t, {
          keyCode: kc, which: kc, key: name, bubbles: true, cancelable: true
        }));
      } catch (e) {}
    });
  }
  function ensure() {
    if (el) return el;
    el = document.createElement('input');
    el.id = 'edopro-ime';
    el.type = 'text';
    el.setAttribute('autocomplete', 'off');
    el.setAttribute('autocapitalize', 'off');
    el.setAttribute('autocorrect', 'off');
    el.setAttribute('spellcheck', 'false');
    el.placeholder = '\uC5EC\uAE30\uC5D0 \uC785\uB825';
    el.style.cssText = [
      'display:none', 'position:fixed', 'left:12px', 'bottom:10px',
      'width:min(46vw,270px)', 'height:32px', 'z-index:100002', 'padding:0 10px',
      'background:rgba(18,20,26,.94)', 'color:#e8eaf0', 'border:1px solid #569CD6',
      'border-radius:8px', 'font:15px sans-serif', 'outline:none', 'box-shadow:0 2px 10px rgba(0,0,0,.5)'
    ].join(';');
    document.body.appendChild(el);

    el.addEventListener('input', function () {
      var t = el.value || '';
      el.value = '';
      for (var i = 0; i < t.length; i++) sendChar(t.charCodeAt(i));
    });
    el.addEventListener('keydown', function (e) {
      var kc = MAP[e.key];
      if (kc === undefined && e.keyCode) kc = e.keyCode;
      if (kc === 8 || kc === 13 || kc === 27 || kc === 37 || kc === 38 || kc === 39 || kc === 40 || kc === 9 || kc === 46) {
        sendKey(kc);
        e.preventDefault();
      }
    });
    return el;
  }

  var touch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0)
    || /Android|iPhone|iPad|iPod|Mobile|DeX/i.test(navigator.userAgent || '');
  window.__ime = function (on, x, y, w, h) {
    var e = ensure();
    if (!on) { active = false; try { e.blur(); } catch (er) {} e.style.setProperty('display', 'none', 'important'); return; }
    active = true;
    e.style.setProperty('display', 'block', 'important');
    e.style.zIndex = '2147483647';
    if (touch) {
      try { e.focus(); } catch (er) {}
    }
  };
})();
</script>
