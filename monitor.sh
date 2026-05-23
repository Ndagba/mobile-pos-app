#!/bin/bash

PROJECT_DIR="/mnt/c/Users/NDAGBA/OneDrive/Documents/Work/Ai_Products/POS_Mobile_App"
LOG_FILE="$PROJECT_DIR/logs/monitor.log"
ALERT_FILE="$PROJECT_DIR/logs/alerts.log"

mkdir -p "$PROJECT_DIR/logs"

echo "========================================" >> $LOG_FILE
echo "Monitor check: $(date)" >> $LOG_FILE

# Check API health
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health)
if [ "$API_STATUS" != "200" ]; then
  echo "🚨 ALERT: API is DOWN (status: $API_STATUS)" | tee -a $ALERT_FILE $LOG_FILE
else
  echo "✅ API: OK" >> $LOG_FILE
fi

# Check containers
DB_STATUS=$(docker inspect --format='{{.State.Health.Status}}' mobilepos_db_prod 2>/dev/null)
REDIS_STATUS=$(docker inspect --format='{{.State.Health.Status}}' mobilepos_redis_prod 2>/dev/null)

if [ "$DB_STATUS" != "healthy" ]; then
  echo "🚨 ALERT: Database is $DB_STATUS" | tee -a $ALERT_FILE $LOG_FILE
else
  echo "✅ Database: healthy" >> $LOG_FILE
fi

if [ "$REDIS_STATUS" != "healthy" ]; then
  echo "🚨 ALERT: Redis is $REDIS_STATUS" | tee -a $ALERT_FILE $LOG_FILE
else
  echo "✅ Redis: healthy" >> $LOG_FILE
fi

# Check error count in API logs (last 100 lines)
ERROR_COUNT=$(docker logs mobilepos_api_prod --tail=100 2>&1 | grep -c '"level":50' || true)
if [ "$ERROR_COUNT" -gt "5" ]; then
  echo "🚨 ALERT: $ERROR_COUNT errors in last 100 log lines" | tee -a $ALERT_FILE $LOG_FILE
else
  echo "✅ Error count: $ERROR_COUNT (last 100 lines)" >> $LOG_FILE
fi

# Check disk usage
DISK_USAGE=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt "85" ]; then
  echo "🚨 ALERT: Disk usage at ${DISK_USAGE}%" | tee -a $ALERT_FILE $LOG_FILE
else
  echo "✅ Disk usage: ${DISK_USAGE}%" >> $LOG_FILE
fi

echo "Check complete." >> $LOG_FILE
