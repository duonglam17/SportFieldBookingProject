const { pool } = require('../config/db');

let intervalId = null;
let jobRunning = false;

async function expirePendingBookings(db = pool) {
  const [result] = await db.execute(
    `UPDATE bookings
     SET status = 'cancelled'
     WHERE status = 'pending'
       AND expires_at IS NOT NULL
       AND expires_at < NOW()`,
  );
  return result.affectedRows;
}

function startExpiryJob(intervalMs = 60_000) {
  if (intervalId) {
    return intervalId;
  }

  intervalId = setInterval(async () => {
    if (jobRunning) {
      return;
    }

    jobRunning = true;
    try {
      const expiredCount = await expirePendingBookings();
      if (expiredCount > 0) {
        console.log(`Đã tự hủy ${expiredCount} lượt đặt pending hết hạn.`);
      }
    } catch (error) {
      console.error('Không thể xử lý các lượt đặt pending hết hạn:', error);
    } finally {
      jobRunning = false;
    }
  }, intervalMs);

  return intervalId;
}

function stopExpiryJob() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

module.exports = { expirePendingBookings, startExpiryJob, stopExpiryJob };
