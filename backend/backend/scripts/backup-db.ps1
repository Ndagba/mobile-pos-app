$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = "backups\mobilepos_$timestamp.sql"

New-Item -ItemType Directory -Force -Path backups | Out-Null

docker-compose exec postgres pg_dump -U pos_user mobilepos | Out-File -FilePath $backupFile

Write-Host "✅ Backup created: $backupFile"