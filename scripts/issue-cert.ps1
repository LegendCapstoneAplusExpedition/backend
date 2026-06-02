# lcae.duckdns.org Let's Encrypt 인증서 발급 (win-acme HTTP-01 self-hosting)
# 반드시 "관리자 권한 PowerShell"에서 실행하세요 (포트 80 리스너 + 예약작업 등록 필요).
#
# 사전 준비 (공유기 포트포워딩):
#   외부 TCP 80  -> 192.168.45.19 : 80    (인증서 발급/갱신 검증용)
#   외부 TCP 443 -> 192.168.45.19 : 3000  (실제 앱 HTTPS 서비스용)
#   + Windows 방화벽 인바운드 80, 3000 허용

$ErrorActionPreference = 'Stop'

# 관리자 권한 확인
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "관리자 권한으로 실행해야 합니다. PowerShell을 '관리자 권한으로 실행' 후 다시 시도하세요."
    exit 1
}

& C:\tools\win-acme\wacs.exe `
    --target manual --host lcae.duckdns.org `
    --validation selfhosting `
    --store pemfiles --pemfilespath C:\Users\suche\backend\certs `
    --installation none `
    --friendlyname lcae.duckdns.org `
    --accepttos --emailaddress sucheoliking@gmail.com

Write-Host ""
Write-Host "발급이 끝나면 아래 두 파일이 생성됩니다:" -ForegroundColor Cyan
Write-Host "  C:\Users\suche\backend\certs\lcae.duckdns.org-chain.pem"
Write-Host "  C:\Users\suche\backend\certs\lcae.duckdns.org-key.pem"
Write-Host "그 다음 node 서버를 재시작하면 자동으로 HTTPS로 기동됩니다 (npm start)." -ForegroundColor Cyan
