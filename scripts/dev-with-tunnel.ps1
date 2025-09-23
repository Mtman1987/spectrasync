Start-Process -NoNewWindow -FilePath ngrok -ArgumentList @('http','9002','--domain','spacemountain.ngrok.dev')
Start-Sleep -Seconds 3
npm run dev
