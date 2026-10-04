const bookingParams = new URLSearchParams(window.location.search);
let bookingDetails = null;

function bookingMessage(message, isError = true) {
  const element = document.getElementById('booking-message');
  element.textContent = message;
  element.classList.toggle('form-message-error', isError);
  element.classList.toggle('form-message-success', !isError);
}

function appendDetail(container, label, value) {
  const row = document.createElement('p');
  const strong = document.createElement('strong');
  strong.textContent = `${label}: `;
  row.append(strong, document.createTextNode(value));
  container.appendChild(row);
}

async function loadBookingDetails() {
  const fieldId = bookingParams.get('fieldId');
  const sportTypeId = bookingParams.get('sportTypeId');
  const date = bookingParams.get('date');
  const start = bookingParams.get('start');
  const end = bookingParams.get('end');
  if (
    !fieldId ||
    !/^[1-9]\d*$/.test(fieldId) ||
    !sportTypeId ||
    !/^[1-9]\d*$/.test(sportTypeId) ||
    !date ||
    !start ||
    !end
  ) {
    bookingMessage('Thông tin khung giờ không hợp lệ. Vui lòng chọn lại lịch.', true);
    return;
  }

  try {
    const [fieldResponse, priceResponse, configResponse] = await Promise.all([
      apiFetch(`/api/fields?sportTypeId=${encodeURIComponent(sportTypeId)}`),
      apiFetch(
        `/api/price?${new URLSearchParams({ sportTypeId, date, start, end }).toString()}`,
      ),
      apiFetch('/api/config'),
    ]);
    const field = fieldResponse.data.find((item) => item.id === Number(fieldId));
    if (!field) {
      throw new Error('Không tìm thấy sân đang hoạt động đã chọn.');
    }

    bookingDetails = {
      fieldId: Number(fieldId),
      sportTypeId: Number(sportTypeId),
      date,
      start,
      end,
      fieldName: field.name,
      totalPrice: Number(priceResponse.data.totalPrice),
      depositAmount: Number(priceResponse.data.depositAmount),
    };

    const details = document.getElementById('booking-details');
    details.replaceChildren();
    appendDetail(details, 'Môn thể thao', field.sport_type_name);
    appendDetail(details, 'Sân', field.name);
    appendDetail(details, 'Ngày', date);
    appendDetail(details, 'Giờ', `${start}–${end}`);
    appendDetail(
      details,
      'Tổng tiền',
      `${bookingDetails.totalPrice.toLocaleString('vi-VN')}đ`,
    );
    appendDetail(
      details,
      'Tiền cọc cần chuyển',
      `${bookingDetails.depositAmount.toLocaleString('vi-VN')}đ`,
    );

    document.getElementById('cancel-hours').textContent =
      configResponse.data.cancelBeforeHours;
    document.getElementById('refund-hours').textContent =
      configResponse.data.refundFullBeforeHours;
    const button = document.getElementById('confirm-booking');
    button.disabled = false;
    button.textContent = 'Xác nhận đặt sân';
  } catch (error) {
    if (error.status === 401) {
      const next = `${window.location.pathname}${window.location.search}`;
      window.location.replace(`/login.html?next=${encodeURIComponent(next)}`);
      return;
    }
    bookingMessage(error.message, true);
    document.getElementById('confirm-booking').textContent = 'Không thể đặt sân';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await apiFetch('/api/auth/me');
  } catch (error) {
    if (error.status === 401) {
      const next = `${window.location.pathname}${window.location.search}`;
      window.location.replace(`/login.html?next=${encodeURIComponent(next)}`);
      return;
    }
    bookingMessage(error.message, true);
    return;
  }

  await loadBookingDetails();
  document.getElementById('booking-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!bookingDetails) return;

    const button = document.getElementById('confirm-booking');
    button.disabled = true;
    try {
      const note = document.getElementById('booking-note').value;
      const { data } = await apiFetch('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({
          fieldId: bookingDetails.fieldId,
          date: bookingDetails.date,
          start: bookingDetails.start,
          end: bookingDetails.end,
          note,
        }),
      });
      const destination = new URLSearchParams({
        created: String(data.booking.id),
      });
      window.location.assign(`/my-bookings.html?${destination.toString()}`);
    } catch (error) {
      bookingMessage(error.message, true);
      button.disabled = false;
    }
  });
});
