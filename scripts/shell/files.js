
<script>
/*fs-files*/
/* 모바일에서도 덱/리플레이 파일을 올리고 내려받을 수 있게 /files.html 로 가는 버튼 */
(function () {
  function mk() {
    if (document.getElementById('edopro-files')) return;
    var a = document.createElement('a');
    a.id = 'edopro-files';
    a.href = '/files.html';
    a.target = '_blank';
    a.rel = 'noopener';
    a.title = '\uB371 / \uB9AC\uD50C\uB808\uC774 \uD30C\uC77C (\uC5C5\uB85C\uB4DC\u00B7\uB2E4\uC6B4\uB85C\uB4DC)';
    a.textContent = '\uD83D\uDCC1';
    document.body.appendChild(a);
  }
  if (document.body) mk(); else document.addEventListener('DOMContentLoaded', mk);
})();
</script>
