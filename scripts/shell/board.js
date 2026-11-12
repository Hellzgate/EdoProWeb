
<script>
/*fs-build*/
(function () {
  var b = window.__edoproBuild || 'dev';
  try { console.log('[build] ' + b); } catch (e) {}
  function badge() {
    if (document.getElementById('edopro-build')) return;
    var d = document.createElement('div');
    d.id = 'edopro-build';
    d.textContent = 'build ' + b;
    d.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:100003;padding:2px 6px;border-radius:4px;'
      + 'background:rgba(0,0,0,.55);color:#9fd0ff;font:11px monospace;pointer-events:none;opacity:.85';
    document.body.appendChild(d);
    setTimeout(function () { if (d && d.parentNode) d.style.display = 'none'; }, 20000);// build badge
  try { var q = '?b=' + b + '&ime=' + (typeof window.__ime) + '&touch=' + (('ontouchstart' in window) || (navigator.maxTouchPoints > 0)) + '&ua=' + encodeURIComponent((navigator.userAgent||'').slice(0,40)); (navigator.sendBeacon ? navigator.sendBeacon('/api/beacon' + q) : fetch('/api/beacon' + q)); } catch (e) {}
  }
  setTimeout(badge, 1000);
})();
</script>
