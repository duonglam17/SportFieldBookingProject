let countdownTimer = null;

function setBookingsMessage(message, isError = false) {
  const element = document.getElementById('bookings-message');
  element.textContent = message;
  element.classList.toggle('form-message-error', isError);
  element.classList.toggle('form-message-success', !isError && Boolean(message));
}

function parseLocalDateTime(date, time) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute).getTime();
}

function appendTextRow(container, label, value) {
  const row = document.createElement('p');
  const strong = document.createElement('strong');
  strong.textContent = `${label}: `;
  row.append(strong, document.createTextNode(String(value)));
  container.appendChild(row);
}

function statusLabel(status) {
  const labels = {
    pending: 'Chờ xác nhận',
    confirmed: 'Đã xác nhận',
    completed: 'Đã hoàn thành',
    no_show: 'Không đến',
    cancelled: 'Đã hủy',
  };
  return labels[status] || status;
}

function formatRemaining(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function renderBookingCard(booking) {
  const card = document.createElement('article');
  card.className = 'booking-card-item';
  card.dataset.bookingId = String(booking.id);
  const title = document.createElement('h3');
  title.textContent = `${booking.fieldName} · ${booking.sportTypeName}`;
  card.appendChild(title);
  appendTextRow(card, 'Ngày giờ', `${booking.date}, ${booking.start}–${booking.end}`);
  appendTextRow(card, 'Trạng thái', statusLabel(booking.status));
  appendTextRow(card, 'Tổng tiền', `${booking.totalPrice.toLocaleString('vi-VN')}đ`);

  if (booking.status === 'pending') {
    const hold = document.createElement('p');
    hold.append(document.createTextNode('Thời hạn giữ chỗ còn: '));
    const countdown = document.createElement('strong');
    countdown.className = 'hold-countdown';
    countdown.dataset.remainingSeconds = String(booking.holdSecondsRemaining);
    countdown.textContent = formatRemaining(booking.holdSecondsRemaining);
    hold.appendChild(countdown);
    card.appendChild(hold);

    const transfer = document.createElement('div');
    transfer.className = 'transfer-details';
    appendTextRow(
      transfer,
      'Tiền cọc cần chuyển',
      `${booking.depositAmount.toLocaleString('vi-VN')}đ`,
    );
    appendTextRow(transfer, 'Nội dung chuyển khoản', booking.transferReference);
    card.appendChild(transfer);
  }

  if (Number(booking.refundPending) > 0) {
    appendTextRow(
      card,
      'Hoàn cọc',
      `Đang chờ nhân viên xác nhận (${Number(booking.refundPending).toLocaleString('vi-VN')}đ)`,
    );
  }

  if (booking.note) {
    appendTextRow(card, 'Ghi chú', booking.note);
  }

  if (['pending', 'confirmed'].includes(booking.status)) {
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'button button-secondary';
    cancelButton.textContent = 'Hủy lượt đặt';
    cancelButton.addEventListener('click', async () => {
      if (!window.confirm('Bạn có chắc muốn hủy lượt đặt này?')) return;
      cancelButton.disabled = true;
      try {
        const { data } = await apiFetch(`/api/bookings/${booking.id}/cancel`, {
          method: 'PATCH',
        });
        setBookingsMessage(data.message, false);
        await loadMyBookings();
      } catch (error) {
        setBookingsMessage(error.message, true);
        cancelButton.disabled = false;
      }
    });
    card.appendChild(cancelButton);
  }

  return card;
}

function startCountdowns() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    document.querySelectorAll('.hold-countdown').forEach((element) => {
      const remaining = Math.max(0, Number(element.dataset.remainingSeconds) - 1);
      element.dataset.remainingSeconds = String(remaining);
      element.textContent = formatRemaining(remaining);
    });
  }, 1000);
}

async function loadMyBookings() {
  const upcoming = document.getElementById('upcoming-bookings');
  const past = document.getElementById('past-bookings');
  try {
    const { data: bookings } = await apiFetch('/api/bookings/mine');
    upcoming.replaceChildren();
    past.replaceChildren();

    const now = Date.now();
    bookings.forEach((booking) => {
      const isFuture = parseLocalDateTime(booking.date, booking.start) > now;
      const target = isFuture ? upcoming : past;
      const card = renderBookingCard(booking);
      card.dataset.holdSecondsRemaining = String(booking.holdSecondsRemaining || 0);
      target.appendChild(card);
    });

    if (upcoming.childElementCount === 0) {
      upcoming.textContent = 'Chưa có lượt đặt sắp tới.';
    }
    if (past.childElementCount === 0) {
      past.textContent = 'Chưa có lượt đặt đã qua.';
    }
    startCountdowns();
  } catch (error) {
    if (error.status === 401) {
      const next = `${window.location.pathname}${window.location.search}`;
      window.location.replace(`/login.html?next=${encodeURIComponent(next)}`);
      return;
    }
    setBookingsMessage(error.message, true);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const createdId = new URLSearchParams(window.location.search).get('created');
  if (createdId) {
    setBookingsMessage(`Đặt sân #${createdId} thành công. Hãy chuyển cọc trước khi hết hạn giữ chỗ.`, false);
  }
  loadMyBookings();
});
