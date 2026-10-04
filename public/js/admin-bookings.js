const adminBookingState = {
  bookings: [],
};

function setAdminBookingMessage(message, isError = false) {
  const element = document.getElementById('admin-bookings-message');
  element.textContent = message;
  element.classList.toggle('form-message-error', isError);
  element.classList.toggle('form-message-success', !isError && Boolean(message));
}

function makeElement(tagName, text, className) {
  const element = document.createElement(tagName);
  if (text !== undefined && text !== null) element.textContent = String(text);
  if (className) element.className = className;
  return element;
}

function makeCell(text) {
  return makeElement('td', text);
}

function appendLabelValue(container, label, value) {
  const line = document.createElement('p');
  const strong = makeElement('strong', `${label}: `);
  line.append(strong, document.createTextNode(String(value)));
  container.appendChild(line);
}

async function loadBookingFilters() {
  const { data: fields } = await apiFetch('/api/admin/bookings/fields');
  const select = document.getElementById('filter-field');
  fields.forEach((field) => {
    const option = makeElement('option', `${field.name} (${field.status})`);
    option.value = String(field.id);
    select.appendChild(option);
  });
}

function statusActions(status) {
  const actions = {
    pending: [
      { status: 'confirmed', label: 'Xác nhận' },
      { status: 'cancelled', label: 'Hủy' },
    ],
    confirmed: [
      { status: 'completed', label: 'Hoàn tất' },
      { status: 'no_show', label: 'Không đến' },
      { status: 'cancelled', label: 'Hủy' },
    ],
    completed: [],
    no_show: [],
    cancelled: [],
  };
  return actions[status] || [];
}

function createStatusActionButton(booking, action) {
  const button = makeElement('button', action.label, 'button button-secondary');
  button.type = 'button';
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await apiFetch(`/api/admin/bookings/${booking.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: action.status }),
      });
      setAdminBookingMessage(`Đã chuyển lượt đặt #${booking.id} sang ${action.status}.`);
      await loadAdminBookings();
    } catch (error) {
      setAdminBookingMessage(error.message, true);
      button.disabled = false;
    }
  });
  return button;
}

function createPaymentForm(booking) {
  const form = document.createElement('form');
  form.className = 'payment-entry-form';

  const typeLabel = makeElement('label', 'Loại khoản');
  const type = document.createElement('select');
  type.name = 'type';
  const allowedTypes = [];
  if (['pending', 'confirmed'].includes(booking.status)) {
    allowedTypes.push(['deposit', 'Cọc']);
  }
  if (['confirmed', 'completed'].includes(booking.status)) {
    allowedTypes.push(['balance', 'Phần còn lại']);
  }
  if (['cancelled', 'completed', 'no_show'].includes(booking.status)) {
    allowedTypes.push(['refund', 'Hoàn tiền']);
  }
  if (
    booking.payments.some((payment) => payment.type === 'refund' && !payment.recordedBy) &&
    !allowedTypes.some(([value]) => value === 'refund')
  ) {
    allowedTypes.push(['refund', 'Xác nhận hoàn cọc đang chờ']);
  }
  allowedTypes.forEach(([value, label]) => {
    const option = makeElement('option', label);
    option.value = value;
    type.appendChild(option);
  });
  typeLabel.appendChild(type);

  const amountLabel = makeElement('label', 'Số tiền');
  const amount = document.createElement('input');
  amount.type = 'number';
  amount.name = 'amount';
  amount.min = '1';
  amount.step = '1';
  amount.required = true;
  amountLabel.appendChild(amount);

  const methodLabel = makeElement('label', 'Phương thức');
  const method = document.createElement('input');
  method.type = 'text';
  method.name = 'method';
  method.maxLength = 50;
  method.required = true;
  method.placeholder = 'Tiền mặt, chuyển khoản...';
  methodLabel.appendChild(method);

  const noteLabel = makeElement('label', 'Ghi chú');
  const note = document.createElement('input');
  note.type = 'text';
  note.name = 'note';
  note.maxLength = 255;
  noteLabel.appendChild(note);

  const submit = makeElement('button', 'Ghi nhận', 'button button-primary');
  submit.type = 'submit';
  form.append(typeLabel, amountLabel, methodLabel, noteLabel, submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    const formData = new FormData(form);
    try {
      await apiFetch(`/api/admin/bookings/${booking.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          type: formData.get('type'),
          amount: Number(formData.get('amount')),
          method: formData.get('method'),
          note: formData.get('note'),
        }),
      });
      setAdminBookingMessage(`Đã ghi nhận thanh toán cho lượt đặt #${booking.id}.`);
      await loadAdminBookings();
    } catch (error) {
      setAdminBookingMessage(error.message, true);
      submit.disabled = false;
    }
  });

  return form;
}

function createPaymentHistory(booking) {
  const container = document.createElement('div');
  container.className = 'payment-history';
  if (booking.payments.length === 0) {
    container.textContent = 'Chưa có khoản thu.';
    return container;
  }

  booking.payments.forEach((payment) => {
    const item = document.createElement('div');
    item.className = 'payment-history-item';
    appendLabelValue(
      item,
      payment.type,
      `${payment.amount.toLocaleString('vi-VN')}đ`,
    );
    appendLabelValue(item, 'Phương thức', payment.method || 'Chờ xác nhận');
    if (payment.recorderName) appendLabelValue(item, 'Người ghi nhận', payment.recorderName);
    if (payment.note) appendLabelValue(item, 'Ghi chú', payment.note);
    if (payment.createdAt) appendLabelValue(item, 'Thời điểm', payment.createdAt);
    container.appendChild(item);
  });
  return container;
}

function renderAdminBookings() {
  const body = document.getElementById('admin-bookings-body');
  body.replaceChildren();

  if (adminBookingState.bookings.length === 0) {
    const row = document.createElement('tr');
    const cell = makeCell('Không có lượt đặt phù hợp.');
    cell.colSpan = 6;
    row.appendChild(cell);
    body.appendChild(row);
    return;
  }

  adminBookingState.bookings.forEach((booking) => {
    const row = document.createElement('tr');
    const customerCell = document.createElement('td');
    appendLabelValue(customerCell, `#${booking.id}`, booking.customerName);
    appendLabelValue(customerCell, 'Email', booking.customerEmail);
    row.appendChild(customerCell);

    const fieldCell = document.createElement('td');
    appendLabelValue(fieldCell, 'Sân', `${booking.fieldName} (${booking.sportTypeName})`);
    appendLabelValue(fieldCell, 'Thời gian', `${booking.date} · ${booking.start}–${booking.end}`);
    appendLabelValue(fieldCell, 'Tổng tiền', `${booking.totalPrice.toLocaleString('vi-VN')}đ`);
    row.appendChild(fieldCell);

    const statusCell = makeCell(booking.status);
    row.appendChild(statusCell);
    const paymentStatusCell = makeCell(booking.paymentStatus);
    row.appendChild(paymentStatusCell);

    const actionsCell = document.createElement('td');
    const actionButtons = document.createElement('div');
    actionButtons.className = 'booking-action-buttons';
    statusActions(booking.status).forEach((action) => {
      actionButtons.appendChild(createStatusActionButton(booking, action));
    });
    actionsCell.append(actionButtons, createPaymentForm(booking));
    row.appendChild(actionsCell);

    const historyCell = document.createElement('td');
    historyCell.appendChild(createPaymentHistory(booking));
    row.appendChild(historyCell);
    body.appendChild(row);
  });
}

async function loadAdminBookings() {
  const formData = new FormData(document.getElementById('booking-filters'));
  const query = new URLSearchParams();
  for (const key of ['status', 'date', 'fieldId']) {
    const value = formData.get(key);
    if (value) query.set(key, value);
  }

  const { data } = await apiFetch(`/api/admin/bookings${query.size ? `?${query}` : ''}`);
  adminBookingState.bookings = data;
  renderAdminBookings();
}

async function initializeAdminBookings() {
  try {
    const { data } = await apiFetch('/api/auth/me');
    if (!['staff', 'admin'].includes(data.user.role)) {
      window.location.replace('/login.html');
      return;
    }
    await loadBookingFilters();
    await loadAdminBookings();
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      window.location.replace('/login.html');
      return;
    }
    setAdminBookingMessage(error.message, true);
  }

  document.getElementById('booking-filters').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await loadAdminBookings();
    } catch (error) {
      setAdminBookingMessage(error.message, true);
    }
  });
  document.getElementById('clear-filters').addEventListener('click', async () => {
    document.getElementById('booking-filters').reset();
    try {
      await loadAdminBookings();
    } catch (error) {
      setAdminBookingMessage(error.message, true);
    }
  });
}

document.addEventListener('DOMContentLoaded', initializeAdminBookings);
