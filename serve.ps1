param(
    [string]$Root = "D:\rea-out\_tmp\pw-mcp\edopro-web",
    [int]$Port = 8795
)

$ErrorActionPreference = "Stop"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()
Write-Host "serving $Root on $Port"

$mime = @{
    ".html" = "text/html; charset=utf-8"
    ".js"   = "application/javascript"
    ".wasm" = "application/wasm"
    ".data" = "application/octet-stream"
    ".png"  = "image/png"
    ".ico"  = "image/x-icon"
}

while ($listener.IsListening) {
    try {
        $ctx = $listener.GetContext()
        $req = $ctx.Request
        $res = $ctx.Response
        $rel = $req.Url.AbsolutePath.TrimStart("/")
        if ([string]::IsNullOrEmpty($rel)) { $rel = "index.html" }
        $path = Join-Path $Root $rel
        if (-not (Test-Path $path)) {
            $res.StatusCode = 404
            $res.Close()
            continue
        }
        $ext = [System.IO.Path]::GetExtension($path).ToLower()
        if ($mime.ContainsKey($ext)) { $res.ContentType = $mime[$ext] }
        $res.Headers.Add("Cross-Origin-Opener-Policy", "same-origin")
        $res.Headers.Add("Cross-Origin-Embedder-Policy", "require-corp")

        $fs = [System.IO.File]::OpenRead($path)
        $res.ContentLength64 = $fs.Length
        $buf = New-Object byte[] 1048576
        while (($n = $fs.Read($buf, 0, $buf.Length)) -gt 0) {
            $res.OutputStream.Write($buf, 0, $n)
        }
        $fs.Close()
        $res.OutputStream.Flush()
        $res.Close()
    } catch {
        try { $ctx.Response.Abort() } catch {}
    }
}
