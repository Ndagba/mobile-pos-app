Write-Host "🗑️  Resetting database..."

# Drop and recreate database
docker-compose exec postgres psql -U pos_user -c "DROP DATABASE IF EXISTS mobilepos;"
docker-compose exec postgres psql -U pos_user -c "CREATE DATABASE mobilepos;"

# Run migrations
docker-compose exec api npx prisma migrate deploy

# Seed data
cd backend
npx prisma db seed
cd ..

Write-Host "✅ Database reset complete"